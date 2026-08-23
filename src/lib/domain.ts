export type UserRole = "ADMIN" | "EMPLOYEE";

export type ShiftType = "DAY" | "NIGHT";

export type ShiftRestriction = "ANY" | "DAY_ONLY" | "NIGHT_ONLY";

export type RestPreference =
  | "NONE"
  | "CONSECUTIVE"
  | "WEEKEND"
  | "WEEKDAY"
  | "SCATTERED";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface SchedulingEmployee {
  id: string;
  name: string;
  restriction: ShiftRestriction;
  restPreference: RestPreference;
  rotationOrder: number;
}

export interface ScheduleAssignment {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
}

export interface ApprovedLeave {
  employeeId: string;
  startDate: string;
  endDate: string;
}

export interface ScheduleConfig {
  weekStart: string;
  rotationAnchorDate: string;
  rotationWeeks: number;
}

export interface ShiftTeams {
  day: SchedulingEmployee[];
  night: SchedulingEmployee[];
  rotationBlock: number;
}

export interface EmployeeScheduleMetric {
  employeeId: string;
  workDays: number;
  restDays: number;
  dayShifts: number;
  nightShifts: number;
  soloDutyDays: number;
}

export interface GeneratedSchedule {
  weekStart: string;
  assignments: ScheduleAssignment[];
  teams: ShiftTeams;
  metrics: EmployeeScheduleMetric[];
  warnings: string[];
}
