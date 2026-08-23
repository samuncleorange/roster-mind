import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const swapSchema = z.object({
  sourceAssignmentId: z.string().uuid(),
  targetAssignmentId: z.string().uuid(),
  reason: z.string().trim().max(500).default(""),
});

interface AssignmentRow {
  id: string;
  schedule_id: string;
  user_id: string;
  user_name: string;
  shift_date: string;
  shift_type: "DAY" | "NIGHT";
  schedule_status: string;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }
  if (user.role !== "EMPLOYEE") {
    return apiError("管理员账户不参与员工换班", 403);
  }

  try {
    const input = swapSchema.parse(await request.json());
    if (input.sourceAssignmentId === input.targetAssignmentId) {
      return apiError("请选择两个不同的值班日期");
    }
    const result = await query<AssignmentRow>(
      `
        SELECT
          schedule_assignments.id,
          schedule_assignments.schedule_id,
          schedule_assignments.user_id,
          users.name AS user_name,
          schedule_assignments.shift_date::text,
          schedule_assignments.shift_type,
          schedules.status AS schedule_status
        FROM schedule_assignments
        JOIN users ON users.id = schedule_assignments.user_id
        JOIN schedules ON schedules.id = schedule_assignments.schedule_id
        WHERE schedule_assignments.id IN ($1, $2)
      `,
      [input.sourceAssignmentId, input.targetAssignmentId],
    );
    const source = result.rows.find((assignment) => assignment.id === input.sourceAssignmentId);
    const target = result.rows.find((assignment) => assignment.id === input.targetAssignmentId);
    if (!source || !target) {
      return apiError("未找到选择的值班记录", 404);
    }
    if (source.user_id !== user.id) {
      return apiError("只能用自己的值班发起换班", 403);
    }
    if (target.user_id === user.id) {
      return apiError("换班对象必须是其他员工");
    }
    if (source.schedule_id !== target.schedule_id || source.schedule_status !== "PUBLISHED") {
      return apiError("只能交换同一周已经发布的排班");
    }
    if (source.shift_type !== target.shift_type) {
      return apiError("当前版本只允许同班次之间换班，以避免白夜班衔接风险");
    }
    if (source.shift_date === target.shift_date) {
      return apiError("请选择不同日期的值班");
    }

    const conflict = await query(
      `
        SELECT 1
        FROM schedule_assignments
        WHERE schedule_id = $1
          AND (
            (user_id = $2 AND shift_date = $3)
            OR (user_id = $4 AND shift_date = $5)
          )
        LIMIT 1
      `,
      [
        source.schedule_id,
        target.user_id,
        source.shift_date,
        source.user_id,
        target.shift_date,
      ],
    );
    if (conflict.rowCount) {
      return apiError("双方在目标日期已有值班，无法直接交换");
    }

    const leaveConflict = await query(
      `
        SELECT 1
        FROM leave_requests
        WHERE status = 'APPROVED'
          AND (
            (user_id = $1 AND $2 BETWEEN start_date AND end_date)
            OR (user_id = $3 AND $4 BETWEEN start_date AND end_date)
          )
        LIMIT 1
      `,
      [target.user_id, source.shift_date, source.user_id, target.shift_date],
    );
    if (leaveConflict.rowCount) {
      return apiError("换班后的日期与已批准请假冲突");
    }

    const pending = await query(
      `
        SELECT 1 FROM swap_requests
        WHERE status = 'PENDING'
          AND (source_assignment_id = $1 OR target_assignment_id = $1)
        LIMIT 1
      `,
      [source.id],
    );
    if (pending.rowCount) {
      return apiError("该值班已经有待处理的换班申请", 409);
    }

    const inserted = await query<{ id: string }>(
      `
        INSERT INTO swap_requests (
          requester_id,
          target_user_id,
          source_assignment_id,
          target_assignment_id,
          reason
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [user.id, target.user_id, source.id, target.id, input.reason],
    );
    await query(
      `
        INSERT INTO notifications (user_id, title, message, link)
        VALUES ($1, '收到换班申请', $2, '/requests')
      `,
      [target.user_id, `${user.name}希望与你交换${source.shift_date}和${target.shift_date}的值班`],
    );
    return apiSuccess({ id: inserted.rows[0].id }, 201);
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
