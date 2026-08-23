import { Icon } from "@/components/icons";
import { addDays } from "@/lib/dates";
import type { ScheduleRecord } from "@/lib/data";

const weekNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function dateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function peopleFor(schedule: ScheduleRecord | null, date: string, shiftType: "DAY" | "NIGHT") {
  return schedule?.assignments.filter(
    (assignment) => assignment.date === date && assignment.shiftType === shiftType,
  ) ?? [];
}

function People({
  schedule,
  date,
  shiftType,
  highlightUserId,
}: {
  schedule: ScheduleRecord | null;
  date: string;
  shiftType: "DAY" | "NIGHT";
  highlightUserId?: string;
}) {
  const people = peopleFor(schedule, date, shiftType);
  if (!people.length) {
    return <span className="empty-duty">待安排</span>;
  }
  return (
    <div className="people-list">
      {people.map((assignment) => (
        <span
          key={assignment.id}
          className={`person-pill ${assignment.employeeId === highlightUserId ? "is-me" : ""}`}
        >
          <i>{assignment.employeeName.slice(0, 1)}</i>
          {assignment.employeeName}
        </span>
      ))}
    </div>
  );
}

export function WeekSchedule({
  schedule,
  weekStart,
  currentDate,
  highlightUserId,
}: {
  schedule: ScheduleRecord | null;
  weekStart: string;
  currentDate?: string;
  highlightUserId?: string;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  return (
    <>
      <div className="schedule-table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>班次</th>
              {days.map((date, index) => (
                <th key={date} className={date === currentDate ? "today" : ""}>
                  <span>{weekNames[index]}</span>
                  <small>{dateLabel(date)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th><span className="shift-label day"><Icon name="sun" />白班<small>09:00–23:00</small></span></th>
              {days.map((date) => (
                <td key={date} className={date === currentDate ? "today" : ""}>
                  <People schedule={schedule} date={date} shiftType="DAY" highlightUserId={highlightUserId} />
                </td>
              ))}
            </tr>
            <tr>
              <th><span className="shift-label night"><Icon name="moon" />夜班<small>23:00–09:00</small></span></th>
              {days.map((date) => (
                <td key={date} className={date === currentDate ? "today" : ""}>
                  <People schedule={schedule} date={date} shiftType="NIGHT" highlightUserId={highlightUserId} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="schedule-mobile-list">
        {days.map((date, index) => (
          <article key={date} className={`mobile-day-card ${date === currentDate ? "today" : ""}`}>
            <header><strong>{weekNames[index]}</strong><span>{dateLabel(date)}</span></header>
            <div className="mobile-shift-row">
              <span className="shift-label day"><Icon name="sun" />白班<small>09:00–23:00</small></span>
              <People schedule={schedule} date={date} shiftType="DAY" highlightUserId={highlightUserId} />
            </div>
            <div className="mobile-shift-row">
              <span className="shift-label night"><Icon name="moon" />夜班<small>23:00–09:00</small></span>
              <People schedule={schedule} date={date} shiftType="NIGHT" highlightUserId={highlightUserId} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
