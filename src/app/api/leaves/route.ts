import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const leaveSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  reason: z.string().trim().max(500).default(""),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }
  if (user.role !== "EMPLOYEE") {
    return apiError("管理员账户不参与员工请假", 403);
  }

  try {
    const input = leaveSchema.parse(await request.json());
    if (input.endDate < input.startDate) {
      return apiError("结束日期不能早于开始日期");
    }

    const overlap = await query(
      `
        SELECT 1
        FROM leave_requests
        WHERE user_id = $1
          AND status IN ('PENDING', 'APPROVED')
          AND start_date <= $3
          AND end_date >= $2
        LIMIT 1
      `,
      [user.id, input.startDate, input.endDate],
    );
    if (overlap.rowCount) {
      return apiError("该日期范围已经有待处理或已批准的请假申请", 409);
    }

    const result = await query<{ id: string }>(
      `
        INSERT INTO leave_requests (user_id, start_date, end_date, reason)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [user.id, input.startDate, input.endDate, input.reason],
    );
    await query(
      `
        INSERT INTO notifications (user_id, title, message, link)
        SELECT id, '新的请假申请', $1, '/requests'
        FROM users
        WHERE active = TRUE AND role = 'ADMIN'
      `,
      [`${user.name}申请${input.startDate}至${input.endDate}请假`],
    );
    return apiSuccess({ id: result.rows[0].id }, 201);
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
