import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError, errorMessage } from "@/lib/http";

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名").max(50),
  password: z.string().min(1, "请输入密码").max(200),
});

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const result = await query<{
      id: string;
      password_hash: string;
      active: boolean;
    }>(
      "SELECT id, password_hash, active FROM users WHERE username = $1 LIMIT 1",
      [input.username],
    );
    const user = result.rows[0];

    if (!user || !user.active || !(await bcrypt.compare(input.password, user.password_hash))) {
      return apiError("用户名或密码不正确", 401);
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(errorMessage(error));
  }
}
