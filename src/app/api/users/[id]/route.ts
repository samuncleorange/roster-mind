import bcrypt from "bcryptjs";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "密码至少 8 个字符").max(200).optional(),
  shiftRestriction: z.enum(["ANY", "DAY_ONLY", "NIGHT_ONLY"]).optional(),
  restPreference: z
    .enum(["NONE", "CONSECUTIVE", "WEEKEND", "WEEKDAY", "SCATTERED"])
    .optional(),
  rotationOrder: z.number().int().min(0).max(999).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return apiError("请先登录", 401);
  }
  if (currentUser.role !== "ADMIN") {
    return apiError("只有管理员可以修改员工", 403);
  }

  try {
    const { id } = await context.params;
    const input = updateUserSchema.parse(await request.json());
    const fields: string[] = [];
    const values: unknown[] = [];

    function addField(column: string, value: unknown): void {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    }

    if (input.name !== undefined) addField("name", input.name);
    if (input.active !== undefined) addField("active", input.active);
    if (input.shiftRestriction !== undefined) {
      addField("shift_restriction", input.shiftRestriction);
    }
    if (input.restPreference !== undefined) addField("rest_preference", input.restPreference);
    if (input.rotationOrder !== undefined) addField("rotation_order", input.rotationOrder);
    if (input.password !== undefined) {
      addField("password_hash", await bcrypt.hash(input.password, 12));
    }

    if (fields.length === 0) {
      return apiError("没有可更新的内容");
    }

    fields.push("updated_at = NOW()");
    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length} AND role = 'EMPLOYEE'`,
      values,
    );
    if (!result.rowCount) {
      return apiError("未找到该员工", 404);
    }

    await query(
      `
        INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES ($1, 'UPDATE_USER', 'USER', $2, $3::jsonb)
      `,
      [currentUser.id, id, JSON.stringify({ fields: Object.keys(input) })],
    );
    return apiSuccess({});
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
