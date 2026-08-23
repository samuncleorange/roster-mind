import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const reviewSchema = z.object({
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
    const input = reviewSchema.parse(await request.json());
    await withTransaction(async (client) => {
      const requestResult = await client.query<{
        id: string;
        user_id: string;
        user_name: string;
        start_date: string;
        end_date: string;
        status: string;
      }>(
        `
          SELECT
            leave_requests.id,
            leave_requests.user_id,
            users.name AS user_name,
            leave_requests.start_date::text,
            leave_requests.end_date::text,
            leave_requests.status
          FROM leave_requests
          JOIN users ON users.id = leave_requests.user_id
          WHERE leave_requests.id = $1
          FOR UPDATE
        `,
        [id],
      );
      const leaveRequest = requestResult.rows[0];
      if (!leaveRequest) {
        throw new Error("未找到该请假申请");
      }
      if (leaveRequest.status !== "PENDING") {
        throw new Error("该申请已经处理，不能重复操作");
      }

      if (input.status === "CANCELLED") {
        if (leaveRequest.user_id !== user.id) {
          throw new Error("只能撤销自己的请假申请");
        }
        await client.query(
          "UPDATE leave_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1",
          [id],
        );
        return;
      }

      if (user.role !== "ADMIN") {
        throw new Error("只有管理员可以审批请假");
      }

      if (input.status === "APPROVED") {
        const affectedAssignments = await client.query<{
          id: string;
          shift_date: string;
          shift_type: string;
          status: string;
          worker_count: number;
        }>(
          `
            SELECT
              own.id,
              own.shift_date::text,
              own.shift_type,
              schedules.status,
              (
                SELECT COUNT(*)::int
                FROM schedule_assignments coworkers
                WHERE coworkers.schedule_id = own.schedule_id
                  AND coworkers.shift_date = own.shift_date
                  AND coworkers.shift_type = own.shift_type
              ) AS worker_count
            FROM schedule_assignments own
            JOIN schedules ON schedules.id = own.schedule_id
            WHERE own.user_id = $1
              AND own.shift_date BETWEEN $2 AND $3
          `,
          [leaveRequest.user_id, leaveRequest.start_date, leaveRequest.end_date],
        );
        const uncovered = affectedAssignments.rows.find(
          (assignment) => assignment.status === "PUBLISHED" && assignment.worker_count <= 1,
        );
        if (uncovered) {
          throw new Error(
            `${uncovered.shift_date}${uncovered.shift_type === "DAY" ? "白班" : "夜班"}目前为单独值班，请先完成换班再批准请假`,
          );
        }

        await client.query(
          `
            DELETE FROM schedule_assignments
            WHERE user_id = $1
              AND shift_date BETWEEN $2 AND $3
          `,
          [leaveRequest.user_id, leaveRequest.start_date, leaveRequest.end_date],
        );
      }

      await client.query(
        `
          UPDATE leave_requests
          SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $3
        `,
        [input.status, user.id, id],
      );
      await client.query(
        `
          INSERT INTO notifications (user_id, title, message, link)
          VALUES ($1, '请假申请已处理', $2, '/requests')
        `,
        [
          leaveRequest.user_id,
          `你的请假申请已${input.status === "APPROVED" ? "批准" : "拒绝"}`,
        ],
      );
      await client.query(
        `
          INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
          VALUES ($1, 'REVIEW_LEAVE', 'LEAVE_REQUEST', $2, $3::jsonb)
        `,
        [user.id, id, JSON.stringify({ status: input.status })],
      );
    });
    return apiSuccess({});
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
