import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const responseSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }

  try {
    const { id } = await context.params;
    const input = responseSchema.parse(await request.json());
    await withTransaction(async (client) => {
      const swapResult = await client.query<{
        id: string;
        requester_id: string;
        target_user_id: string;
        source_assignment_id: string;
        target_assignment_id: string;
        status: string;
      }>("SELECT * FROM swap_requests WHERE id = $1 FOR UPDATE", [id]);
      const swap = swapResult.rows[0];
      if (!swap) {
        throw new Error("未找到该换班申请");
      }
      if (swap.status !== "PENDING") {
        throw new Error("该换班申请已经处理");
      }

      if (input.status === "CANCELLED") {
        if (swap.requester_id !== user.id) {
          throw new Error("只有发起人可以撤销换班申请");
        }
        await client.query(
          "UPDATE swap_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1",
          [id],
        );
        return;
      }

      if (swap.target_user_id !== user.id) {
        throw new Error("只有被邀请换班的员工可以处理该申请");
      }

      if (input.status === "APPROVED") {
        const assignmentResult = await client.query<{
          id: string;
          schedule_id: string;
          user_id: string;
          shift_date: string;
          shift_type: string;
          schedule_status: string;
        }>(
          `
            SELECT
              schedule_assignments.id,
              schedule_assignments.schedule_id,
              schedule_assignments.user_id,
              schedule_assignments.shift_date::text,
              schedule_assignments.shift_type,
              schedules.status AS schedule_status
            FROM schedule_assignments
            JOIN schedules ON schedules.id = schedule_assignments.schedule_id
            WHERE schedule_assignments.id IN ($1, $2)
            FOR UPDATE
          `,
          [swap.source_assignment_id, swap.target_assignment_id],
        );
        const source = assignmentResult.rows.find(
          (assignment) => assignment.id === swap.source_assignment_id,
        );
        const target = assignmentResult.rows.find(
          (assignment) => assignment.id === swap.target_assignment_id,
        );
        if (!source || !target || source.schedule_status !== "PUBLISHED") {
          throw new Error("原排班已经发生变化，请重新发起换班");
        }
        if (
          source.user_id !== swap.requester_id ||
          target.user_id !== swap.target_user_id ||
          source.schedule_id !== target.schedule_id ||
          source.shift_type !== target.shift_type
        ) {
          throw new Error("原排班已经发生变化，请重新发起换班");
        }

        const conflict = await client.query(
          `
            SELECT 1
            FROM schedule_assignments
            WHERE schedule_id = $1
              AND id NOT IN ($2, $3)
              AND (
                (user_id = $4 AND shift_date = $5)
                OR (user_id = $6 AND shift_date = $7)
              )
            LIMIT 1
          `,
          [
            source.schedule_id,
            source.id,
            target.id,
            target.user_id,
            source.shift_date,
            source.user_id,
            target.shift_date,
          ],
        );
        if (conflict.rowCount) {
          throw new Error("双方目标日期已有其他值班，无法交换");
        }

        await client.query("UPDATE schedule_assignments SET user_id = $1 WHERE id = $2", [
          target.user_id,
          source.id,
        ]);
        await client.query("UPDATE schedule_assignments SET user_id = $1 WHERE id = $2", [
          source.user_id,
          target.id,
        ]);
      }

      await client.query(
        `
          UPDATE swap_requests
          SET status = $1, responded_at = NOW(), updated_at = NOW()
          WHERE id = $2
        `,
        [input.status, id],
      );
      await client.query(
        `
          INSERT INTO notifications (user_id, title, message, link)
          VALUES ($1, '换班申请已处理', $2, '/requests')
        `,
        [
          swap.requester_id,
          `你的换班申请已${input.status === "APPROVED" ? "同意" : "拒绝"}`,
        ],
      );
      await client.query(
        `
          INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
          VALUES ($1, 'RESPOND_SWAP', 'SWAP_REQUEST', $2, $3::jsonb)
        `,
        [user.id, id, JSON.stringify({ status: input.status })],
      );
    });
    return apiSuccess({});
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
