import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, message }, { status });
}

export function apiSuccess<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "提交的数据不正确";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败，请稍后重试";
}
