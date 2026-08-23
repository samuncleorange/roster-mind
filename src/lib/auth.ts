import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { RestPreference, ShiftRestriction, UserRole } from "@/lib/domain";
import { query } from "@/lib/db";

const SESSION_COOKIE = "roster_mind_session";
const SESSION_DURATION_DAYS = 30;

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  shiftRestriction: ShiftRestriction;
  restPreference: RestPreference;
}

interface CurrentUserRow {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  shift_restriction: ShiftRestriction;
  rest_preference: RestPreference;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  await query(
    `
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const result = await query<CurrentUserRow>(
    `
      SELECT
        users.id,
        users.username,
        users.name,
        users.role,
        users.shift_restriction,
        users.rest_preference
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1
        AND sessions.expires_at > NOW()
        AND users.active = TRUE
      LIMIT 1
    `,
    [hashToken(token)],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    shiftRestriction: row.shift_restriction,
    restPreference: row.rest_preference,
  };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  return user;
}
