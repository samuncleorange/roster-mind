import { addDays } from "@/lib/dates";
import { query } from "@/lib/db";
import type {
  RequestStatus,
  RestPreference,
  ScheduleAssignment,
  ShiftRestriction,
  ShiftType,
  UserRole,
} from "@/lib/domain";

export interface AppSettings {
  organizationName: string;
  timezone: string;
  rotationWeeks: number;
  rotationAnchorDate: string;
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  shiftRestriction: ShiftRestriction;
  restPreference: RestPreference;
  rotationOrder: number;
}

export interface AssignmentRecord extends ScheduleAssignment {
  id: string;
  scheduleId: string;
  employeeName: string;
}

export interface ScheduleRecord {
  id: string;
  weekStart: string;
  status: "DRAFT" | "PUBLISHED";
  rotationBlock: number;
  warnings: string[];
  publishedAt: string | null;
  assignments: AssignmentRecord[];
}

export interface LeaveRequestRecord {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: RequestStatus;
  createdAt: string;
}

export interface SwapRequestRecord {
  id: string;
  requesterId: string;
  requesterName: string;
  targetUserId: string;
  targetUserName: string;
  sourceDate: string;
  targetDate: string;
  shiftType: ShiftType;
  reason: string;
  status: RequestStatus;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface SettingsRow {
  organization_name: string;
  timezone: string;
  rotation_weeks: number;
  rotation_anchor_date: string;
  day_start: string;
  day_end: string;
  night_start: string;
  night_end: string;
}

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  shift_restriction: ShiftRestriction;
  rest_preference: RestPreference;
  rotation_order: number;
}

interface ScheduleRow {
  id: string;
  week_start: string;
  status: "DRAFT" | "PUBLISHED";
  rotation_block: number;
  warnings: string[];
  published_at: string | null;
}

interface AssignmentRow {
  id: string;
  schedule_id: string;
  user_id: string;
  employee_name: string;
  shift_date: string;
  shift_type: ShiftType;
}

function normalizeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function normalizeTime(value: string): string {
  return String(value).slice(0, 5);
}

export async function getSettings(): Promise<AppSettings> {
  const result = await query<SettingsRow>(
    `
      SELECT
        organization_name,
        timezone,
        rotation_weeks,
        rotation_anchor_date::text,
        day_start::text,
        day_end::text,
        night_start::text,
        night_end::text
      FROM app_settings
      WHERE id = 1
    `,
  );
  const row = result.rows[0];
  return {
    organizationName: row.organization_name,
    timezone: row.timezone,
    rotationWeeks: row.rotation_weeks,
    rotationAnchorDate: normalizeDate(row.rotation_anchor_date),
    dayStart: normalizeTime(row.day_start),
    dayEnd: normalizeTime(row.day_end),
    nightStart: normalizeTime(row.night_start),
    nightEnd: normalizeTime(row.night_end),
  };
}

export async function listUsers(includeInactive = true): Promise<UserRecord[]> {
  const result = await query<UserRow>(
    `
      SELECT
        id,
        username,
        name,
        role,
        active,
        shift_restriction,
        rest_preference,
        rotation_order
      FROM users
      ${includeInactive ? "" : "WHERE active = TRUE"}
      ORDER BY role, rotation_order, created_at
    `,
  );
  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: row.active,
    shiftRestriction: row.shift_restriction,
    restPreference: row.rest_preference,
    rotationOrder: row.rotation_order,
  }));
}

export async function listActiveEmployees(): Promise<UserRecord[]> {
  const users = await listUsers(false);
  return users.filter((user) => user.role === "EMPLOYEE");
}

export async function getScheduleForWeek(
  weekStart: string,
  publishedOnly = false,
): Promise<ScheduleRecord | null> {
  const scheduleResult = await query<ScheduleRow>(
    `
      SELECT id, week_start::text, status, rotation_block, warnings, published_at::text
      FROM schedules
      WHERE week_start = $1
        ${publishedOnly ? "AND status = 'PUBLISHED'" : ""}
      LIMIT 1
    `,
    [weekStart],
  );
  const schedule = scheduleResult.rows[0];
  if (!schedule) {
    return null;
  }

  const assignmentResult = await query<AssignmentRow>(
    `
      SELECT
        schedule_assignments.id,
        schedule_assignments.schedule_id,
        schedule_assignments.user_id,
        users.name AS employee_name,
        schedule_assignments.shift_date::text,
        schedule_assignments.shift_type
      FROM schedule_assignments
      JOIN users ON users.id = schedule_assignments.user_id
      WHERE schedule_assignments.schedule_id = $1
      ORDER BY schedule_assignments.shift_date, schedule_assignments.shift_type, users.rotation_order
    `,
    [schedule.id],
  );

  return {
    id: schedule.id,
    weekStart: normalizeDate(schedule.week_start),
    status: schedule.status,
    rotationBlock: schedule.rotation_block,
    warnings: schedule.warnings ?? [],
    publishedAt: schedule.published_at,
    assignments: assignmentResult.rows.map((row) => ({
      id: row.id,
      scheduleId: row.schedule_id,
      employeeId: row.user_id,
      employeeName: row.employee_name,
      date: normalizeDate(row.shift_date),
      shiftType: row.shift_type,
    })),
  };
}

export async function getAssignmentsForWeek(weekStart: string): Promise<ScheduleAssignment[]> {
  const schedule = await getScheduleForWeek(weekStart);
  return schedule?.assignments.map(({ employeeId, date, shiftType }) => ({
    employeeId,
    date,
    shiftType,
  })) ?? [];
}

export async function listApprovedLeavesForWeek(weekStart: string): Promise<{
  employeeId: string;
  startDate: string;
  endDate: string;
}[]> {
  const weekEnd = addDays(weekStart, 6);
  const result = await query<{
    user_id: string;
    start_date: string;
    end_date: string;
  }>(
    `
      SELECT user_id, start_date::text, end_date::text
      FROM leave_requests
      WHERE status = 'APPROVED'
        AND start_date <= $2
        AND end_date >= $1
    `,
    [weekStart, weekEnd],
  );
  return result.rows.map((row) => ({
    employeeId: row.user_id,
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
  }));
}

export async function listLeaveRequests(userId?: string): Promise<LeaveRequestRecord[]> {
  const result = await query<{
    id: string;
    user_id: string;
    user_name: string;
    start_date: string;
    end_date: string;
    reason: string;
    status: RequestStatus;
    created_at: string;
  }>(
    `
      SELECT
        leave_requests.id,
        leave_requests.user_id,
        users.name AS user_name,
        leave_requests.start_date::text,
        leave_requests.end_date::text,
        leave_requests.reason,
        leave_requests.status,
        leave_requests.created_at::text
      FROM leave_requests
      JOIN users ON users.id = leave_requests.user_id
      ${userId ? "WHERE leave_requests.user_id = $1" : ""}
      ORDER BY leave_requests.created_at DESC
    `,
    userId ? [userId] : [],
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function listSwapRequests(userId?: string): Promise<SwapRequestRecord[]> {
  const result = await query<{
    id: string;
    requester_id: string;
    requester_name: string;
    target_user_id: string;
    target_user_name: string;
    source_date: string;
    target_date: string;
    shift_type: ShiftType;
    reason: string;
    status: RequestStatus;
    created_at: string;
  }>(
    `
      SELECT
        swap_requests.id,
        swap_requests.requester_id,
        requester.name AS requester_name,
        swap_requests.target_user_id,
        target.name AS target_user_name,
        source.shift_date::text AS source_date,
        destination.shift_date::text AS target_date,
        source.shift_type,
        swap_requests.reason,
        swap_requests.status,
        swap_requests.created_at::text
      FROM swap_requests
      JOIN users requester ON requester.id = swap_requests.requester_id
      JOIN users target ON target.id = swap_requests.target_user_id
      JOIN schedule_assignments source ON source.id = swap_requests.source_assignment_id
      JOIN schedule_assignments destination ON destination.id = swap_requests.target_assignment_id
      ${userId ? "WHERE swap_requests.requester_id = $1 OR swap_requests.target_user_id = $1" : ""}
      ORDER BY swap_requests.created_at DESC
    `,
    userId ? [userId] : [],
  );
  return result.rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user_name,
    sourceDate: normalizeDate(row.source_date),
    targetDate: normalizeDate(row.target_date),
    shiftType: row.shift_type,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function listPublishedAssignmentsBetween(
  startDate: string,
  endDate: string,
): Promise<AssignmentRecord[]> {
  const result = await query<AssignmentRow>(
    `
      SELECT
        schedule_assignments.id,
        schedule_assignments.schedule_id,
        schedule_assignments.user_id,
        users.name AS employee_name,
        schedule_assignments.shift_date::text,
        schedule_assignments.shift_type
      FROM schedule_assignments
      JOIN users ON users.id = schedule_assignments.user_id
      JOIN schedules ON schedules.id = schedule_assignments.schedule_id
      WHERE schedules.status = 'PUBLISHED'
        AND schedule_assignments.shift_date BETWEEN $1 AND $2
      ORDER BY schedule_assignments.shift_date, schedule_assignments.shift_type, users.rotation_order
    `,
    [startDate, endDate],
  );
  return result.rows.map((row) => ({
    id: row.id,
    scheduleId: row.schedule_id,
    employeeId: row.user_id,
    employeeName: row.employee_name,
    date: normalizeDate(row.shift_date),
    shiftType: row.shift_type,
  }));
}

export async function listNotifications(
  userId: string,
  limit = 5,
): Promise<NotificationRecord[]> {
  const result = await query<{
    id: string;
    title: string;
    message: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `
      SELECT id, title, message, link, read_at::text, created_at::text
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}
