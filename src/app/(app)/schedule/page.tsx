import Link from "next/link";

import { Icon } from "@/components/icons";
import { ScheduleControls } from "@/components/schedule-controls";
import { WeekSchedule } from "@/components/week-schedule";
import { requireCurrentUser } from "@/lib/auth";
import { getScheduleForWeek, getSettings } from "@/lib/data";
import { addDays, currentDateInTimeZone, startOfMondayWeek } from "@/lib/dates";

export const metadata = { title: "排班表" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireCurrentUser();
  const settings = await getSettings();
  const currentDate = currentDateInTimeZone(settings.timezone);
  const params = await searchParams;
  const weekStart = startOfMondayWeek(params.week ?? currentDate);
  const schedule = await getScheduleForWeek(weekStart, user.role !== "ADMIN");

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <span className="eyebrow">一周一目了然</span>
          <h1>团队排班表</h1>
          <p>白班 09:00–23:00，夜班 23:00–次日 09:00。</p>
        </div>
        {user.role === "ADMIN" ? (
          <ScheduleControls weekStart={weekStart} scheduleId={schedule?.id} status={schedule?.status} />
        ) : null}
      </header>

      <section className="content-card">
        <div className="schedule-toolbar">
          <Link href={`/schedule?week=${addDays(weekStart, -7)}`} className="icon-button" aria-label="上一周"><Icon name="arrowLeft" /></Link>
          <div>
            <span>{weekStart}</span>
            <strong>至 {addDays(weekStart, 6)}</strong>
          </div>
          <Link href={`/schedule?week=${addDays(weekStart, 7)}`} className="icon-button" aria-label="下一周"><Icon name="arrowRight" /></Link>
          <Link href={`/schedule?week=${startOfMondayWeek(currentDate)}`} className="text-button">回到本周</Link>
          {schedule ? <span className={`status-badge ${schedule.status.toLowerCase()}`}>{schedule.status === "PUBLISHED" ? "已发布" : "草稿"}</span> : <span className="status-badge empty">未生成</span>}
        </div>

        {schedule?.warnings.length ? (
          <div className="notice-box"><Icon name="sparkles" /><div><strong>智能排班提示</strong>{schedule.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>
        ) : null}

        <WeekSchedule schedule={schedule} weekStart={weekStart} currentDate={currentDate} highlightUserId={user.role === "EMPLOYEE" ? user.id : undefined} />
      </section>

      {!schedule ? (
        <section className="empty-state large">
          <span><Icon name="calendar" /></span>
          <h2>这一周还没有排班</h2>
          <p>{user.role === "ADMIN" ? "点击“智能生成排班”，系统会按照四人班组规则自动计算。" : "管理员发布后，你会在这里看到完整安排。"}</p>
        </section>
      ) : null}
    </div>
  );
}
