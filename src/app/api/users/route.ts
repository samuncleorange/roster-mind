import bcrypt from "bcryptjs";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, apiSuccess, errorMessage } from "@/lib/http";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 个字符")
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "用户名只能包含字母、数字、下划线和连字符"),
  name: z.string().trim().min(1, "请输入姓名").max(80),
  password: z.string().min(8, "初始密码至少 8 个字符").max(200),
  shiftRestriction: z.enum(["ANY", "DAY_ONLY", "NIGHT_ONLY"]),
  restPreference: z.enum(["NONE", "CONSECUTIVE", "WEEKEND", "WEEKDAY", "SCATTERED"]),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return apiError("请先登录", 401);
  }
  if (currentUser.role !== "ADMIN") {
    return apiError("只有管理员可以添加员工", 403);
  }

  try {
    const input = createUserSchema.parse(await request.json());
    const passwordHash = await bcrypt.hash(input.password, 12);
    const orderResult = await query<{ next_order: number }>(
      `
        SELECT COALESCE(MAX(rotation_order), -1) + 1 AS next_order
        FROM users
        WHERE role = 'EMPLOYEE'
      `,
    );
    const result = await query<{ id: string }>(
      `
        INSERT INTO users (
          username,
          name,
          password_hash,
          role,
          shift_restriction,
          rest_preference,
          rotation_order
        )
        VALUES ($1, $2, $3, 'EMPLOYEE', $4, $5, $6)
        RETURNING id
      `,
      [
        input.username,
        input.name,
        passwordHash,
        input.shiftRestriction,
        input.restPreference,
        orderResult.rows[0]?.next_order ?? 0,
      ],
    );
    await query(
      `
        INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES ($1, 'CREATE_USER', 'USER', $2, $3::jsonb)
      `,
      [currentUser.id, result.rows[0].id, JSON.stringify({ username: input.username })],
    );
    return apiSuccess({ id: result.rows[0].id }, 201);
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") {
      return apiError("该用户名已经存在", 409);
    }
    return apiError(errorMessage(error));
  }
}
