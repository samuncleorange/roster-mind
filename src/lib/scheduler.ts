import {
  addDays,
  daysBetween,
  enumerateDates,
  startOfMondayWeek,
} from "@/lib/dates";
import type {
  ApprovedLeave,
  EmployeeScheduleMetric,
  GeneratedSchedule,
  RestPreference,
  ScheduleAssignment,
  ScheduleConfig,
  SchedulingEmployee,
  ShiftTeams,
  ShiftType,
} from "@/lib/domain";

export class ScheduleGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleGenerationError";
  }
}

interface GenerateScheduleInput {
  employees: SchedulingEmployee[];
  config: ScheduleConfig;
  approvedLeaves?: ApprovedLeave[];
  previousWeekAssignments?: ScheduleAssignment[];
}

interface OffDayChoice {
  first: Set<number>;
  second: Set<number>;
}

const WEEK_LENGTH = 7;
const WEEKEND_START_INDEX = 5;

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function rotationBlockForWeek(config: ScheduleConfig): number {
  if (!Number.isInteger(config.rotationWeeks) || config.rotationWeeks < 2 || config.rotationWeeks > 5) {
    throw new ScheduleGenerationError("倒班周期必须是 2 到 5 周之间的整数");
  }

  const weekStart = startOfMondayWeek(config.weekStart);
  const anchor = startOfMondayWeek(config.rotationAnchorDate);
  const weekDifference = Math.floor(daysBetween(anchor, weekStart) / 7);
  return Math.floor(weekDifference / config.rotationWeeks);
}

function canWorkShift(employee: SchedulingEmployee, shiftType: ShiftType): boolean {
  return (
    employee.restriction === "ANY" ||
    (employee.restriction === "DAY_ONLY" && shiftType === "DAY") ||
    (employee.restriction === "NIGHT_ONLY" && shiftType === "NIGHT")
  );
}

function sortEmployees(employees: SchedulingEmployee[]): SchedulingEmployee[] {
  return [...employees].sort(
    (first, second) =>
      first.rotationOrder - second.rotationOrder || first.id.localeCompare(second.id),
  );
}

function assertValidTeam(team: SchedulingEmployee[], shiftType: ShiftType): void {
  if (team.length !== 2 || team.some((employee) => !canWorkShift(employee, shiftType))) {
    throw new ScheduleGenerationError(
      `${shiftType === "DAY" ? "白班" : "夜班"}无法组成两人班组，请检查员工班次限制`,
    );
  }
}

export function determineShiftTeams(
  employees: SchedulingEmployee[],
  config: ScheduleConfig,
): ShiftTeams {
  if (employees.length !== 4) {
    throw new ScheduleGenerationError("当前自动排班模式要求恰好有 4 名启用员工");
  }

  const sorted = sortEmployees(employees);
  const dayOnly = sorted.filter((employee) => employee.restriction === "DAY_ONLY");
  const nightOnly = sorted.filter((employee) => employee.restriction === "NIGHT_ONLY");
  const flexible = sorted.filter((employee) => employee.restriction === "ANY");
  const rotationBlock = rotationBlockForWeek(config);

  let day: SchedulingEmployee[];
  let night: SchedulingEmployee[];

  if (dayOnly.length === 1 && nightOnly.length === 0 && flexible.length === 3) {
    const partner = flexible[modulo(rotationBlock, flexible.length)];
    day = [dayOnly[0], partner];
    night = flexible.filter((employee) => employee.id !== partner.id);
  } else if (nightOnly.length === 1 && dayOnly.length === 0 && flexible.length === 3) {
    const partner = flexible[modulo(rotationBlock, flexible.length)];
    night = [nightOnly[0], partner];
    day = flexible.filter((employee) => employee.id !== partner.id);
  } else if (dayOnly.length === 1 && nightOnly.length === 1 && flexible.length === 2) {
    const dayPartner = flexible[modulo(rotationBlock, flexible.length)];
    day = [dayOnly[0], dayPartner];
    night = [nightOnly[0], flexible.find((employee) => employee.id !== dayPartner.id)!];
  } else if (dayOnly.length === 2 && nightOnly.length === 2) {
    day = dayOnly;
    night = nightOnly;
  } else if (flexible.length === 4) {
    const firstPair = sorted.slice(0, 2);
    const secondPair = sorted.slice(2, 4);
    const swapped = modulo(rotationBlock, 2) === 1;
    day = swapped ? secondPair : firstPair;
    night = swapped ? firstPair : secondPair;
  } else {
    const validPartitions: Array<{ day: SchedulingEmployee[]; night: SchedulingEmployee[] }> = [];

    for (let firstIndex = 0; firstIndex < sorted.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
        const possibleDay = [sorted[firstIndex], sorted[secondIndex]];
        const possibleNight = sorted.filter((employee) => !possibleDay.includes(employee));
        if (
          possibleDay.every((employee) => canWorkShift(employee, "DAY")) &&
          possibleNight.every((employee) => canWorkShift(employee, "NIGHT"))
        ) {
          validPartitions.push({ day: possibleDay, night: possibleNight });
        }
      }
    }

    if (validPartitions.length === 0) {
      throw new ScheduleGenerationError("员工班次限制互相冲突，无法组成白班和夜班班组");
    }

    const selected = validPartitions[modulo(rotationBlock, validPartitions.length)];
    day = selected.day;
    night = selected.night;
  }

  assertValidTeam(day, "DAY");
  assertValidTeam(night, "NIGHT");

  return { day, night, rotationBlock };
}

function combinations(values: number[], size: number): number[][] {
  const result: number[][] = [];

  function visit(start: number, selected: number[]): void {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }

    for (let index = start; index <= values.length - (size - selected.length); index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  }

  visit(0, []);
  return result;
}

function includesWeekend(days: Set<number>): boolean {
  return [...days].some((day) => day >= WEEKEND_START_INDEX);
}

function requiresWeekendRest(preference: RestPreference): boolean {
  return preference !== "WEEKDAY";
}

function targetOffDayCount(employee: SchedulingEmployee, forced: Set<number>): number {
  const weekendDayNeeded = requiresWeekendRest(employee.restPreference) && !includesWeekend(forced);
  return Math.max(2, forced.size + (weekendDayNeeded ? 1 : 0));
}

function candidateOffDaySets(
  forced: Set<number>,
  targetSize: number,
  weekendRequired: boolean,
): Set<number>[] {
  if (forced.size > targetSize) {
    return [];
  }

  const available = Array.from({ length: WEEK_LENGTH }, (_, index) => index).filter(
    (day) => !forced.has(day),
  );
  return combinations(available, targetSize - forced.size)
    .map((extraDays) => new Set([...forced, ...extraDays]))
    .filter((days) => !weekendRequired || includesWeekend(days));
}

function adjacentPairs(days: number[]): number {
  let count = 0;
  for (let index = 1; index < days.length; index += 1) {
    if (days[index] - days[index - 1] === 1) {
      count += 1;
    }
  }
  return count;
}

function scoreRestPreference(days: Set<number>, preference: RestPreference): number {
  const sorted = [...days].sort((first, second) => first - second);
  const adjacency = adjacentPairs(sorted);
  const weekendDays = sorted.filter((day) => day >= 5).length;
  const weekdayDays = sorted.length - weekendDays;

  switch (preference) {
    case "CONSECUTIVE":
      return adjacency * 12 - Math.max(0, sorted.length - 1 - adjacency) * 3;
    case "WEEKEND":
      return weekendDays * 12 + (weekendDays === 2 ? 8 : 0);
    case "WEEKDAY":
      return weekdayDays * 8 - weekendDays * 4;
    case "SCATTERED":
      return adjacency === 0 ? 14 : -adjacency * 8;
    case "NONE":
      return adjacency * 2;
  }
}

function stableTieBreak(
  days: Set<number>,
  employee: SchedulingEmployee,
  weekOrdinal: number,
): number {
  const target = modulo(weekOrdinal + employee.rotationOrder * 2, WEEK_LENGTH);
  return [...days].reduce((score, day) => {
    const direct = Math.abs(day - target);
    const circular = Math.min(direct, WEEK_LENGTH - direct);
    return score - circular * 0.01;
  }, 0);
}

function chooseOffDaysForTeam(
  team: SchedulingEmployee[],
  forcedOff: Map<string, Set<number>>,
  weekOrdinal: number,
): OffDayChoice {
  const [firstEmployee, secondEmployee] = team;
  const firstForced = forcedOff.get(firstEmployee.id) ?? new Set<number>();
  const secondForced = forcedOff.get(secondEmployee.id) ?? new Set<number>();
  const overlappingForced = [...firstForced].filter((day) => secondForced.has(day));

  if (overlappingForced.length > 0) {
    throw new ScheduleGenerationError(
      `${firstEmployee.name}和${secondEmployee.name}在同一天必须休息，班组将无人值班`,
    );
  }

  const firstWeekendRequired = requiresWeekendRest(firstEmployee.restPreference);
  const secondWeekendRequired = requiresWeekendRest(secondEmployee.restPreference);
  const firstTargetSize = targetOffDayCount(firstEmployee, firstForced);
  const secondTargetSize = targetOffDayCount(secondEmployee, secondForced);
  if (firstTargetSize + secondTargetSize > WEEK_LENGTH) {
    throw new ScheduleGenerationError(
      `${firstEmployee.name}和${secondEmployee.name}本周休假过多，无法保证每天至少一人值班`,
    );
  }

  const firstCandidates = candidateOffDaySets(
    firstForced,
    firstTargetSize,
    firstWeekendRequired,
  );
  const secondCandidates = candidateOffDaySets(
    secondForced,
    secondTargetSize,
    secondWeekendRequired,
  );
  let best: { choice: OffDayChoice; score: number } | null = null;

  for (const first of firstCandidates) {
    for (const second of secondCandidates) {
      if ([...first].some((day) => second.has(day))) {
        continue;
      }

      const score =
        scoreRestPreference(first, firstEmployee.restPreference) +
        scoreRestPreference(second, secondEmployee.restPreference) +
        stableTieBreak(first, firstEmployee, weekOrdinal) +
        stableTieBreak(second, secondEmployee, weekOrdinal);

      if (!best || score > best.score) {
        best = { choice: { first, second }, score };
      }
    }
  }

  if (!best) {
    throw new ScheduleGenerationError(
      `${firstEmployee.name}和${secondEmployee.name}无法排出互不重叠的休息日`,
    );
  }

  return best.choice;
}

function addForcedDay(forcedOff: Map<string, Set<number>>, employeeId: string, day: number): void {
  const days = forcedOff.get(employeeId) ?? new Set<number>();
  days.add(day);
  forcedOff.set(employeeId, days);
}

function forcedOffFromLeaves(
  employees: SchedulingEmployee[],
  approvedLeaves: ApprovedLeave[],
  weekStart: string,
): Map<string, Set<number>> {
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const weekDates = new Map(
    Array.from({ length: WEEK_LENGTH }, (_, index) => [addDays(weekStart, index), index]),
  );
  const forcedOff = new Map<string, Set<number>>();

  for (const leave of approvedLeaves) {
    if (!employeeIds.has(leave.employeeId)) {
      continue;
    }

    for (const date of enumerateDates(leave.startDate, leave.endDate)) {
      const dayIndex = weekDates.get(date);
      if (dayIndex !== undefined) {
        addForcedDay(forcedOff, leave.employeeId, dayIndex);
      }
    }
  }

  return forcedOff;
}

function employeeIds(team: SchedulingEmployee[]): Set<string> {
  return new Set(team.map((employee) => employee.id));
}

function selectTransitionBufferEmployee(
  employees: SchedulingEmployee[],
  weekOrdinal: number,
): SchedulingEmployee {
  return [...employees].sort((first, second) => {
    const firstWeekend = first.restPreference === "WEEKEND" ? 0 : 1;
    const secondWeekend = second.restPreference === "WEEKEND" ? 0 : 1;
    return (
      firstWeekend - secondWeekend ||
      modulo(first.rotationOrder + weekOrdinal, employees.length) -
        modulo(second.rotationOrder + weekOrdinal, employees.length)
    );
  })[0];
}

function applyRotationTransitionRules(
  forcedOff: Map<string, Set<number>>,
  currentTeams: ShiftTeams,
  nextTeams: ShiftTeams,
  previousWeekAssignments: ScheduleAssignment[],
  previousSunday: string,
  warnings: string[],
  weekOrdinal: number,
): void {
  const previousSundayNightWorkers = new Set(
    previousWeekAssignments
      .filter(
        (assignment) =>
          assignment.date === previousSunday && assignment.shiftType === "NIGHT",
      )
      .map((assignment) => assignment.employeeId),
  );

  for (const employee of currentTeams.day) {
    if (previousSundayNightWorkers.has(employee.id)) {
      addForcedDay(forcedOff, employee.id, 0);
      warnings.push(`${employee.name}周日夜班后周一不接白班，已自动安排休息`);
    }
  }

  const nextDayIds = employeeIds(nextTeams.day);
  const movingNightToDay = currentTeams.night.filter((employee) => nextDayIds.has(employee.id));
  if (movingNightToDay.length === 2) {
    const alreadyOffSunday = movingNightToDay.find((employee) =>
      forcedOff.get(employee.id)?.has(6),
    );
    if (!alreadyOffSunday) {
      const bufferedEmployee = selectTransitionBufferEmployee(movingNightToDay, weekOrdinal);
      addForcedDay(forcedOff, bufferedEmployee.id, 6);
      warnings.push(`${bufferedEmployee.name}周日预留休息，为下周夜转白提供安全衔接`);
    }
  }
}

function createMetrics(
  employees: SchedulingEmployee[],
  assignments: ScheduleAssignment[],
): EmployeeScheduleMetric[] {
  return employees.map((employee) => {
    const ownAssignments = assignments.filter(
      (assignment) => assignment.employeeId === employee.id,
    );
    const soloDutyDays = ownAssignments.filter((assignment) => {
      const workers = assignments.filter(
        (candidate) =>
          candidate.date === assignment.date && candidate.shiftType === assignment.shiftType,
      );
      return workers.length === 1;
    }).length;

    return {
      employeeId: employee.id,
      workDays: ownAssignments.length,
      restDays: WEEK_LENGTH - ownAssignments.length,
      dayShifts: ownAssignments.filter((assignment) => assignment.shiftType === "DAY").length,
      nightShifts: ownAssignments.filter((assignment) => assignment.shiftType === "NIGHT").length,
      soloDutyDays,
    };
  });
}

function validateGeneratedSchedule(
  employees: SchedulingEmployee[],
  assignments: ScheduleAssignment[],
  weekStart: string,
): void {
  for (let dayIndex = 0; dayIndex < WEEK_LENGTH; dayIndex += 1) {
    const date = addDays(weekStart, dayIndex);
    for (const shiftType of ["DAY", "NIGHT"] as const) {
      const workers = assignments.filter(
        (assignment) => assignment.date === date && assignment.shiftType === shiftType,
      );
      if (workers.length < 1 || workers.length > 2) {
        throw new ScheduleGenerationError(
          `${date}${shiftType === "DAY" ? "白班" : "夜班"}人数不符合 1 至 2 人要求`,
        );
      }
    }
  }

  for (const employee of employees) {
    const ownAssignments = assignments.filter(
      (assignment) => assignment.employeeId === employee.id,
    );
    const duplicateDate = ownAssignments.find(
      (assignment, index) =>
        ownAssignments.findIndex((candidate) => candidate.date === assignment.date) !== index,
    );
    if (duplicateDate) {
      throw new ScheduleGenerationError(`${employee.name}在${duplicateDate.date}被重复排班`);
    }
    if (ownAssignments.some((assignment) => !canWorkShift(employee, assignment.shiftType))) {
      throw new ScheduleGenerationError(`${employee.name}被安排到受限制的班次`);
    }
    if (ownAssignments.length > 5) {
      throw new ScheduleGenerationError(`${employee.name}本周工作超过 5 天`);
    }
  }
}

export function generateFourPersonSchedule(input: GenerateScheduleInput): GeneratedSchedule {
  const weekStart = startOfMondayWeek(input.config.weekStart);
  const config = { ...input.config, weekStart };
  const employees = sortEmployees(input.employees);
  const teams = determineShiftTeams(employees, config);
  const nextTeams = determineShiftTeams(employees, {
    ...config,
    weekStart: addDays(weekStart, 7),
  });
  const approvedLeaves = input.approvedLeaves ?? [];
  const previousWeekAssignments = input.previousWeekAssignments ?? [];
  const forcedOff = forcedOffFromLeaves(employees, approvedLeaves, weekStart);
  const warnings: string[] = [];
  const weekOrdinal = Math.floor(daysBetween(config.rotationAnchorDate, weekStart) / 7);

  applyRotationTransitionRules(
    forcedOff,
    teams,
    nextTeams,
    previousWeekAssignments,
    addDays(weekStart, -1),
    warnings,
    weekOrdinal,
  );

  const assignments: ScheduleAssignment[] = [];
  for (const [shiftType, team] of [
    ["DAY", teams.day],
    ["NIGHT", teams.night],
  ] as const) {
    const offDays = chooseOffDaysForTeam(team, forcedOff, weekOrdinal);
    const offByEmployee = new Map([
      [team[0].id, offDays.first],
      [team[1].id, offDays.second],
    ]);

    for (let dayIndex = 0; dayIndex < WEEK_LENGTH; dayIndex += 1) {
      for (const employee of team) {
        if (!offByEmployee.get(employee.id)?.has(dayIndex)) {
          assignments.push({
            employeeId: employee.id,
            date: addDays(weekStart, dayIndex),
            shiftType,
          });
        }
      }
    }
  }

  validateGeneratedSchedule(employees, assignments, weekStart);

  return {
    weekStart,
    assignments,
    teams,
    metrics: createMetrics(employees, assignments),
    warnings,
  };
}
