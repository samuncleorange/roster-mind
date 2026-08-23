import assert from "node:assert/strict";
import test from "node:test";

import type { ScheduleAssignment, SchedulingEmployee } from "@/lib/domain";
import { addDays } from "@/lib/dates";
import {
  determineShiftTeams,
  generateFourPersonSchedule,
  ScheduleGenerationError,
} from "@/lib/scheduler";

const employees: SchedulingEmployee[] = [
  {
    id: "a",
    name: "安心",
    restriction: "DAY_ONLY",
    restPreference: "CONSECUTIVE",
    rotationOrder: 0,
  },
  {
    id: "b",
    name: "白川",
    restriction: "ANY",
    restPreference: "WEEKEND",
    rotationOrder: 1,
  },
  {
    id: "c",
    name: "陈晨",
    restriction: "ANY",
    restPreference: "WEEKDAY",
    rotationOrder: 2,
  },
  {
    id: "d",
    name: "杜宁",
    restriction: "ANY",
    restPreference: "SCATTERED",
    rotationOrder: 3,
  },
];

const baseConfig = {
  weekStart: "2026-08-24",
  rotationAnchorDate: "2026-08-24",
  rotationWeeks: 2,
};

function assignmentsFor(
  assignments: ScheduleAssignment[],
  employeeId: string,
): ScheduleAssignment[] {
  return assignments.filter((assignment) => assignment.employeeId === employeeId);
}

test("四人排班满足每人五天、每班每天至少一人", () => {
  const result = generateFourPersonSchedule({ employees, config: baseConfig });

  assert.equal(result.assignments.length, 20);
  for (const employee of employees) {
    const own = assignmentsFor(result.assignments, employee.id);
    assert.equal(own.length, 5);
    assert.equal(result.metrics.find((metric) => metric.employeeId === employee.id)?.soloDutyDays, 2);
  }

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = new Date(Date.UTC(2026, 7, 24 + dayIndex)).toISOString().slice(0, 10);
    for (const shiftType of ["DAY", "NIGHT"] as const) {
      const workers = result.assignments.filter(
        (assignment) => assignment.date === date && assignment.shiftType === shiftType,
      );
      assert.ok(workers.length === 1 || workers.length === 2);
    }
  }
});

test("无周末或工作日偏好时每人至少休一天周末，周末每班各一人在岗", () => {
  const neutralEmployees = employees.map((employee) => ({
    ...employee,
    restPreference: "NONE" as const,
  }));
  const result = generateFourPersonSchedule({
    employees: neutralEmployees,
    config: baseConfig,
  });
  const weekendDates = [addDays(baseConfig.weekStart, 5), addDays(baseConfig.weekStart, 6)];

  for (const employee of neutralEmployees) {
    const workedWeekendDates = new Set(
      assignmentsFor(result.assignments, employee.id)
        .filter((assignment) => weekendDates.includes(assignment.date))
        .map((assignment) => assignment.date),
    );
    assert.ok(weekendDates.some((date) => !workedWeekendDates.has(date)));
  }

  for (const date of weekendDates) {
    for (const shiftType of ["DAY", "NIGHT"] as const) {
      const workerCount = result.assignments.filter(
        (assignment) => assignment.date === date && assignment.shiftType === shiftType,
      ).length;
      assert.equal(workerCount, 1);
    }
  }
});

test("同组两人都明确优先工作日休时允许周末共同值班", () => {
  const weekdayEmployees = employees.map((employee, index) => ({
    ...employee,
    restPreference: index < 2 ? "WEEKDAY" as const : employee.restPreference,
  }));
  const result = generateFourPersonSchedule({
    employees: weekdayEmployees,
    config: baseConfig,
  });

  for (const date of [addDays(baseConfig.weekStart, 5), addDays(baseConfig.weekStart, 6)]) {
    const dayWorkers = result.assignments.filter(
      (assignment) => assignment.date === date && assignment.shiftType === "DAY",
    );
    assert.equal(dayWorkers.length, 2);
  }
});

test("工作日请假已占满两天时仍为默认偏好保留周末休息", () => {
  const result = generateFourPersonSchedule({
    employees,
    config: baseConfig,
    approvedLeaves: [
      { employeeId: "a", startDate: "2026-08-24", endDate: "2026-08-25" },
    ],
  });
  const employeeAssignments = assignmentsFor(result.assignments, "a");
  const weekendDates = [addDays(baseConfig.weekStart, 5), addDays(baseConfig.weekStart, 6)];

  assert.equal(employeeAssignments.length, 4);
  assert.ok(weekendDates.some((date) => !employeeAssignments.some((item) => item.date === date)));
});

test("特殊员工固定白班，其他三人按周期轮换白班搭档", () => {
  const first = determineShiftTeams(employees, baseConfig);
  const second = determineShiftTeams(employees, {
    ...baseConfig,
    weekStart: "2026-09-07",
  });
  const third = determineShiftTeams(employees, {
    ...baseConfig,
    weekStart: "2026-09-21",
  });

  assert.deepEqual(first.day.map((employee) => employee.id), ["a", "b"]);
  assert.deepEqual(second.day.map((employee) => employee.id), ["a", "c"]);
  assert.deepEqual(third.day.map((employee) => employee.id), ["a", "d"]);
});

test("夜班转白班时，若上周日值夜班则本周一自动休息", () => {
  const previousWeekAssignments: ScheduleAssignment[] = [
    { employeeId: "c", date: "2026-09-06", shiftType: "NIGHT" },
  ];
  const result = generateFourPersonSchedule({
    employees,
    config: { ...baseConfig, weekStart: "2026-09-07" },
    previousWeekAssignments,
  });

  assert.equal(
    result.assignments.some(
      (assignment) =>
        assignment.employeeId === "c" &&
        assignment.date === "2026-09-07" &&
        assignment.shiftType === "DAY",
    ),
    false,
  );
  assert.ok(result.warnings.some((warning) => warning.includes("周一不接白班")));
});

test("同组两人同日强制休息时拒绝生成", () => {
  assert.throws(
    () =>
      generateFourPersonSchedule({
        employees,
        config: baseConfig,
        approvedLeaves: [
          { employeeId: "a", startDate: "2026-08-24", endDate: "2026-08-24" },
          { employeeId: "b", startDate: "2026-08-24", endDate: "2026-08-24" },
        ],
      }),
    ScheduleGenerationError,
  );
});

test("全员可倒班时，周期结束前为下周夜转白预留周日休息", () => {
  const flexibleEmployees = employees.map((employee) => ({
    ...employee,
    restriction: "ANY" as const,
  }));
  const result = generateFourPersonSchedule({
    employees: flexibleEmployees,
    config: { ...baseConfig, weekStart: "2026-08-31" },
  });

  assert.ok(result.warnings.some((warning) => warning.includes("安全衔接")));
  const currentNightIds = new Set(result.teams.night.map((employee) => employee.id));
  const sundayNightWorkers = result.assignments.filter(
    (assignment) => assignment.date === "2026-09-06" && assignment.shiftType === "NIGHT",
  );
  assert.equal(sundayNightWorkers.length, 1);
  assert.ok(currentNightIds.has(sundayNightWorkers[0].employeeId));
});

test("全员可倒班的周期切换周保持覆盖并避免周日夜班直转周一白班", () => {
  const flexibleEmployees = employees.map((employee) => ({
    ...employee,
    restriction: "ANY" as const,
  }));
  const previousWeek = generateFourPersonSchedule({
    employees: flexibleEmployees,
    config: { ...baseConfig, weekStart: "2026-08-31" },
  });
  const transitionWeek = generateFourPersonSchedule({
    employees: flexibleEmployees,
    config: { ...baseConfig, weekStart: "2026-09-07" },
    previousWeekAssignments: previousWeek.assignments,
  });
  const sundayNightWorkers = new Set(
    previousWeek.assignments
      .filter(
        (assignment) =>
          assignment.date === "2026-09-06" && assignment.shiftType === "NIGHT",
      )
      .map((assignment) => assignment.employeeId),
  );
  const mondayDayWorkers = transitionWeek.assignments.filter(
    (assignment) => assignment.date === "2026-09-07" && assignment.shiftType === "DAY",
  );

  assert.ok(mondayDayWorkers.length >= 1);
  assert.equal(
    mondayDayWorkers.some((assignment) => sundayNightWorkers.has(assignment.employeeId)),
    false,
  );
  assert.ok(transitionWeek.metrics.every((metric) => metric.workDays === 5));
});

test("特殊白班模式在默认偏好下可连续生成全年 52 周且周末单人覆盖", () => {
  const neutralEmployees = employees.map((employee) => ({
    ...employee,
    restPreference: "NONE" as const,
  }));
  let previousWeekAssignments: ScheduleAssignment[] = [];

  for (let weekIndex = 0; weekIndex < 52; weekIndex += 1) {
    const weekStart = addDays(baseConfig.weekStart, weekIndex * 7);
    const result = generateFourPersonSchedule({
      employees: neutralEmployees,
      config: { ...baseConfig, weekStart },
      previousWeekAssignments,
    });

    assert.ok(result.metrics.every((metric) => metric.workDays === 5));
    assert.ok(result.metrics.every((metric) => metric.restDays === 2));
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDays(weekStart, dayIndex);
      for (const shiftType of ["DAY", "NIGHT"] as const) {
        const workerCount = result.assignments.filter(
          (assignment) => assignment.date === date && assignment.shiftType === shiftType,
        ).length;
        if (dayIndex >= 5) {
          assert.equal(workerCount, 1);
        } else {
          assert.ok(workerCount >= 1 && workerCount <= 2);
        }
      }
    }

    previousWeekAssignments = result.assignments;
  }
});
