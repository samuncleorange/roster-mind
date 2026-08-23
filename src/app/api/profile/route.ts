import bcrypt from "bcryptjs";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const profileSchema = z.object({
  restPreference: z
    .enum(["NONE", "CONSECUTIVE", "WEEKEND", "WEEKDAY", "SCATTERED"])
    .optional(),
  password: z.string().min(8, "密码至少 8 个字符").max(200).optional(),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("请先登录", 401);
  }

  try {
    const input = profileSchema.parse(await request.json());
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.restPreference) {
      values.push(input.restPreference);
      fields.push(`rest_preference = $${values.length}`);
    }
    if (input.password) {
      values.push(await bcrypt.hash(input.password, 12));
      fields.push(`password_hash = $${values.length}`);
    }
    if (!fields.length) {
      return apiError("没有可更新的内容");
    }
    fields.push("updated_at = NOW()");
    values.push(user.id);
    await query(`UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
    return apiSuccess({});
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
