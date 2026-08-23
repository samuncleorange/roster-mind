import { getCurrentUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }
  if (user.role !== "ADMIN") {
    return apiError("只有管理员可以发布排班", 403);
  }

  try {
    const { id } = await context.params;
    await withTransaction(async (client) => {
      const scheduleResult = await client.query<{ week_start: string; status: string }>(
        "SELECT week_start::text, status FROM schedules WHERE id = $1 FOR UPDATE",
        [id],
      );
      const schedule = scheduleResult.rows[0];
      if (!schedule) {
        throw new Error("未找到该排班");
      }

      const coverage = await client.query<{
        shift_date: string;
        shift_type: string;
        worker_count: number;
      }>(
        `
          SELECT shift_date::text, shift_type, COUNT(*)::int AS worker_count
          FROM schedule_assignments
          WHERE schedule_id = $1
          GROUP BY shift_date, shift_type
        `,
        [id],
      );
      if (
        coverage.rows.length !== 14 ||
        coverage.rows.some((row) => row.worker_count < 1 || row.worker_count > 2)
      ) {
        throw new Error("排班覆盖不完整，必须保证每天白班和夜班至少各有一人");
      }

      await client.query(
        `
          UPDATE schedules
          SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [id],
      );
      await client.query(
        `
          INSERT INTO notifications (user_id, title, message, link)
          SELECT id, '新排班已发布', $1, '/schedule'
          FROM users
          WHERE active = TRUE AND role = 'EMPLOYEE'
        `,
        [`${schedule.week_start} 开始的一周排班已经发布`],
      );
      await client.query(
        `
          INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
          VALUES ($1, 'PUBLISH_SCHEDULE', 'SCHEDULE', $2)
        `,
        [user.id, id],
      );
    });
    return apiSuccess({});
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
