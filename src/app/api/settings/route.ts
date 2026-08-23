import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const settingsSchema = z.object({
  organizationName: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(80),
  rotationWeeks: z.number().int().min(2).max(5),
  rotationAnchorDate: z.string().date(),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }
  if (user.role !== "ADMIN") {
    return apiError("只有管理员可以修改排班设置", 403);
  }

  try {
    const input = settingsSchema.parse(await request.json());
    await query(
      `
        UPDATE app_settings
        SET
          organization_name = $1,
          timezone = $2,
          rotation_weeks = $3,
          rotation_anchor_date = $4,
          updated_at = NOW()
        WHERE id = 1
      `,
      [input.organizationName, input.timezone, input.rotationWeeks, input.rotationAnchorDate],
    );
    await query(
      `
        INSERT INTO audit_logs (actor_id, action, entity_type, details)
        VALUES ($1, 'UPDATE_SETTINGS', 'SETTINGS', $2::jsonb)
      `,
      [user.id, JSON.stringify(input)],
    );
    return apiSuccess({});
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
