import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  getAssignmentsForWeek,
  getSettings,
  listActiveEmployees,
  listApprovedLeavesForWeek,
} from "@/lib/data";
import { addDays, startOfMondayWeek } from "@/lib/dates";
import { withTransaction } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";
import { generateFourPersonSchedule } from "@/lib/scheduler";

const generateSchema = z.object({
  weekStart: z.string().date(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }
  if (user.role !== "ADMIN") {
    return apiError("只有管理员可以生成排班", 403);
  }

  try {
    const input = generateSchema.parse(await request.json());
    const weekStart = startOfMondayWeek(input.weekStart);
    const [settings, employees, approvedLeaves, previousWeekAssignments] = await Promise.all([
      getSettings(),
      listActiveEmployees(),
      listApprovedLeavesForWeek(weekStart),
      getAssignmentsForWeek(addDays(weekStart, -7)),
    ]);
    const generated = generateFourPersonSchedule({
      employees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        restriction: employee.shiftRestriction,
        restPreference: employee.restPreference,
        rotationOrder: employee.rotationOrder,
      })),
      config: {
        weekStart,
        rotationAnchorDate: settings.rotationAnchorDate,
        rotationWeeks: settings.rotationWeeks,
      },
      approvedLeaves,
      previousWeekAssignments,
    });

    const scheduleId = await withTransaction(async (client) => {
      const existing = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM schedules WHERE week_start = $1 FOR UPDATE",
        [weekStart],
      );
      if (existing.rows[0]?.status === "PUBLISHED") {
        throw new Error("该周排班已经发布，不能直接覆盖");
      }

      let id = existing.rows[0]?.id;
      if (id) {
        await client.query(
          `
            UPDATE schedules
            SET rotation_block = $1, warnings = $2::jsonb, generated_by = $3, updated_at = NOW()
            WHERE id = $4
          `,
          [generated.teams.rotationBlock, JSON.stringify(generated.warnings), user.id, id],
        );
        await client.query("DELETE FROM schedule_assignments WHERE schedule_id = $1", [id]);
      } else {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO schedules (week_start, rotation_block, warnings, generated_by)
            VALUES ($1, $2, $3::jsonb, $4)
            RETURNING id
          `,
          [weekStart, generated.teams.rotationBlock, JSON.stringify(generated.warnings), user.id],
        );
        id = inserted.rows[0].id;
      }

      for (const assignment of generated.assignments) {
        await client.query(
          `
            INSERT INTO schedule_assignments (schedule_id, user_id, shift_date, shift_type)
            VALUES ($1, $2, $3, $4)
          `,
          [id, assignment.employeeId, assignment.date, assignment.shiftType],
        );
      }
      await client.query(
        `
          INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
          VALUES ($1, 'GENERATE_SCHEDULE', 'SCHEDULE', $2, $3::jsonb)
        `,
        [user.id, id, JSON.stringify({ weekStart, warnings: generated.warnings })],
      );
      return id;
    });

    return apiSuccess({ scheduleId, weekStart, warnings: generated.warnings });
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
