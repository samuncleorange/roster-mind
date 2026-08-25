import Link from "next/link";

import { Icon } from "@/components/icons";
import { LiveClock } from "@/components/live-clock";
import { WeekSchedule } from "@/components/week-schedule";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import {
  getScheduleForWeek,
  getSettings,
  listActiveEmployees,
  listLeaveRequests,
  listNotifications,
  listSwapRequests,
  type AppSettings,
  type AssignmentRecord,
  type ScheduleRecord,
} from "@/lib/data";
import {
  addDays,
  currentDateInTimeZone,
  currentMinutesInTimeZone,
  startOfMondayWeek,
} from "@/lib/dates";

export const metadata = { title: "首页" };

function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatWeekRange(weekStart: string): string {
  const format = (date: string) => {
    const [, month, day] = date.split("-");
    return `${Number(month)}月${Number(day)}日`;
  };
  return `${format(weekStart)}－${format(addDays(weekStart, 6))}`;
}

function workerNames(workers: AssignmentRecord[]): string {
  return workers.map((worker) => worker.employeeName).join("、");
}

function PublicDashboard({
  settings,
  currentDate,
  currentWeekStart,
  currentShiftType,
  weekSchedule,
  currentWorkers,
  nextWorkers,
  nextShiftType,
}: {
  settings: AppSettings;
  currentDate: string;
  currentWeekStart: string;
  currentShiftType: "DAY" | "NIGHT";
  weekSchedule: ScheduleRecord | null;
  currentWorkers: AssignmentRecord[];
  nextWorkers: AssignmentRecord[];
  nextShiftType: "DAY" | "NIGHT";
}) {
  const hasPublishedSchedule = Boolean(weekSchedule);
  const currentNames = workerNames(currentWorkers);
  const nextNames = workerNames(nextWorkers);

  return (
    <main className="public-home">
      <nav className="public-nav" aria-label="公开首页导航">
        <Link href="/" className="brand">
          <span className="brand-mark"><Icon name="sparkles" /></span>
          <span><strong>RosterMind</strong><small>温和而科学的智排班</small></span>
        </Link>
        <div className="public-nav-actions">
          <span className="public-organization">{settings.organizationName}</span>
          <Link href="/login" className="public-login-button"><Icon name="team" />员工登录</Link>
        </div>
      </nav>

      <div className="public-main">
        <section className="public-hero">
          <div className="public-hero-copy">
            <span className="public-kicker"><i />全年连续值守 · 实时排班看板</span>
            <h1>这一刻，谁在<br /><em>守护现场？</em></h1>
            <p>无需登录，即可快速确认当前值班人员和本周白夜班安排。</p>
            <div className="public-time-panel">
              <div>
                <small>{formatLongDate(currentDate)}</small>
                <LiveClock timeZone={settings.timezone} initialIso={new Date().toISOString()} />
              </div>
              <span>{settings.timezone}</span>
            </div>
          </div>

          <article className={`public-duty-card ${currentShiftType === "DAY" ? "day" : "night"}`}>
            <div className="public-duty-card-top">
              <span className="status-dot">当前值班中</span>
              <strong>{currentShiftType === "DAY" ? `${settings.dayStart}–${settings.dayEnd}` : `${settings.nightStart}–次日 ${settings.nightEnd}`}</strong>
            </div>
            <div className="public-duty-symbol"><Icon name={currentShiftType === "DAY" ? "sun" : "moon"} /></div>
            <div className="public-duty-content">
              <small>{currentShiftType === "DAY" ? "白班在岗人员" : "夜班在岗人员"}</small>
              <h2>{currentNames || "排班尚未发布"}</h2>
              <p>{currentWorkers.length > 1 ? "两位同事共同值班，现场保持双人覆盖。" : currentWorkers.length === 1 ? "当前由一位同事独立值班，下一班将准时接替。" : "管理员发布本周排班后，这里会自动显示在岗人员。"}</p>
            </div>
            <div className="public-next-duty">
              <span><Icon name="clock" />下一班 · {nextShiftType === "DAY" ? "白班" : "夜班"}</span>
              <strong>{nextNames || "待安排"}</strong>
            </div>
          </article>
        </section>

        <section className="content-card public-week-section">
          <div className="public-week-heading">
            <div>
              <span className="eyebrow">本周公开排班</span>
              <h2>{formatWeekRange(currentWeekStart)}</h2>
              <p>白班 {settings.dayStart}–{settings.dayEnd} · 夜班 {settings.nightStart}–次日 {settings.nightEnd}</p>
            </div>
            <span className={`public-publish-status ${hasPublishedSchedule ? "published" : "empty"}`}>
              <Icon name={hasPublishedSchedule ? "check" : "clock"} />
              {hasPublishedSchedule ? "已发布" : "等待发布"}
            </span>
          </div>
          {!hasPublishedSchedule ? (
            <div className="public-schedule-notice">
              <Icon name="calendar" />
              <div><strong>本周排班暂未公开</strong><p>管理员发布后，白班和夜班人员会自动出现在下方表格中。</p></div>
            </div>
          ) : null}
          <WeekSchedule schedule={weekSchedule} weekStart={currentWeekStart} currentDate={currentDate} />
        </section>

        <section className="public-rule-grid" aria-label="排班规则概览">
          <article><span><Icon name="shield" /></span><div><strong>每天持续覆盖</strong><p>白班与夜班每天至少各有一人在岗。</p></div></article>
          <article><span><Icon name="calendar" /></span><div><strong>每周充分休息</strong><p>正常每人工作五天、休息两天。</p></div></article>
          <article><span><Icon name="sparkles" /></span><div><strong>周末友好安排</strong><p>默认每人至少拥有一天周末休息。</p></div></article>
        </section>

        <footer className="public-footer">
          <span>RosterMind · 让每一次值班都安排得刚刚好</span>
          <span><Icon name="shield" />公开页仅展示已发布排班，个人申请与管理操作需登录</span>
        </footer>
      </div>
    </main>
  );
}

async function AuthenticatedDashboard({
  user,
  settings,
  currentDate,
  currentWeekStart,
  currentShiftType,
  currentShiftDate,
  currentShiftWeek,
  nextShiftType,
  nextShiftDate,
  nextShiftWeek,
}: {
  user: CurrentUser;
  settings: AppSettings;
  currentDate: string;
  currentWeekStart: string;
  currentShiftType: "DAY" | "NIGHT";
  currentShiftDate: string;
  currentShiftWeek: string;
  nextShiftType: "DAY" | "NIGHT";
  nextShiftDate: string;
  nextShiftWeek: string;
}) {
  const [weekSchedule, dutySchedule, nextSchedule, employees, leaves, swaps, notifications] = await Promise.all([
    getScheduleForWeek(currentWeekStart, user.role !== "ADMIN"),
    getScheduleForWeek(currentShiftWeek, true),
    nextShiftWeek === currentShiftWeek
      ? getScheduleForWeek(currentShiftWeek, true)
      : getScheduleForWeek(nextShiftWeek, true),
    listActiveEmployees(),
    listLeaveRequests(user.role === "EMPLOYEE" ? user.id : undefined),
    listSwapRequests(user.role === "EMPLOYEE" ? user.id : undefined),
    listNotifications(user.id),
  ]);

  const currentWorkers = dutySchedule?.assignments.filter(
    (assignment) => assignment.date === currentShiftDate && assignment.shiftType === currentShiftType,
  ) ?? [];
  const nextWorkers = nextSchedule?.assignments.filter(
    (assignment) => assignment.date === nextShiftDate && assignment.shiftType === nextShiftType,
  ) ?? [];
  const myWorkDays = new Set(
    weekSchedule?.assignments
      .filter((assignment) => assignment.employeeId === user.id)
      .map((assignment) => assignment.date) ?? [],
  ).size;
  const pendingRequests =
    leaves.filter((request) => request.status === "PENDING").length +
    swaps.filter((request) => request.status === "PENDING").length;

  return (
    <div className="page-shell">
      <header className="page-header dashboard-header">
        <div>
          <span className="eyebrow">{formatLongDate(currentDate)}</span>
          <h1>{user.name}，今天也辛苦了</h1>
          <p>这里是团队当前值班状态和本周排班概览。</p>
        </div>
        <Link href="/schedule" className="secondary-button"><Icon name="calendar" />查看完整排班</Link>
      </header>

      <section className="dashboard-hero-grid">
        <article className={`duty-hero ${currentShiftType === "DAY" ? "day" : "night"}`}>
          <div className="duty-hero-top">
            <span className="status-dot">现场值班中</span>
            <span>{currentShiftType === "DAY" ? "09:00–23:00" : "23:00–09:00"}</span>
          </div>
          <div className="duty-icon"><Icon name={currentShiftType === "DAY" ? "sun" : "moon"} /></div>
          <div>
            <small>当前在岗</small>
            <h2>{currentWorkers.length ? currentWorkers.map((worker) => worker.employeeName).join("、") : "尚未发布排班"}</h2>
            <p>{currentWorkers.length > 1 ? "今天由两位同事共同值班" : currentWorkers.length === 1 ? "今天由一位同事独立值班" : "管理员发布排班后会显示在岗人员"}</p>
          </div>
          <div className="next-duty">
            <Icon name="clock" />
            <span>下一班：{nextWorkers.length ? nextWorkers.map((worker) => worker.employeeName).join("、") : "待安排"}</span>
            <strong>{nextShiftType === "DAY" ? "白班" : "夜班"}</strong>
          </div>
        </article>

        <div className="metric-grid">
          <article className="metric-card lavender">
            <span><Icon name="calendar" /></span>
            <small>{user.role === "ADMIN" ? "在岗员工" : "本周我的值班"}</small>
            <strong>{user.role === "ADMIN" ? `${employees.length} 人` : `${myWorkDays} 天`}</strong>
            <p>{user.role === "ADMIN" ? "当前启用的排班成员" : `本周休息 ${Math.max(0, 7 - myWorkDays)} 天`}</p>
          </article>
          <article className="metric-card mint">
            <span><Icon name="requests" /></span>
            <small>待处理申请</small>
            <strong>{pendingRequests} 项</strong>
            <p>{pendingRequests ? "记得及时处理和确认" : "目前没有待办申请"}</p>
          </article>
          <article className="metric-card peach">
            <span><Icon name="sparkles" /></span>
            <small>倒班周期</small>
            <strong>{settings.rotationWeeks} 周</strong>
            <p>自动平衡白夜班与休息偏好</p>
          </article>
          <article className="metric-card cream">
            <span><Icon name="shield" /></span>
            <small>现场覆盖</small>
            <strong>{weekSchedule ? "正常" : "待排班"}</strong>
            <p>每天白班、夜班至少一人</p>
          </article>
        </div>
      </section>

      <section className="content-card schedule-overview">
        <div className="section-heading">
          <div>
            <span className="eyebrow">本周安排</span>
            <h2>{currentWeekStart} 开始的一周</h2>
          </div>
          {weekSchedule ? <span className={`status-badge ${weekSchedule.status.toLowerCase()}`}>{weekSchedule.status === "PUBLISHED" ? "已发布" : "草稿"}</span> : null}
        </div>
        <WeekSchedule schedule={weekSchedule} weekStart={currentWeekStart} currentDate={currentDate} highlightUserId={user.role === "EMPLOYEE" ? user.id : undefined} />
      </section>

      <section className="dashboard-bottom-grid">
        <article className="content-card rule-card">
          <div className="section-heading"><div><span className="eyebrow">排班原则</span><h2>科学，但不冰冷</h2></div><Icon name="sparkles" /></div>
          <ul>
            <li><span>01</span><div><strong>充分休息</strong><p>每人每周工作 5 天、休息 2 天。</p></div></li>
            <li><span>02</span><div><strong>稳定覆盖</strong><p>休息日错开，任何班次都不会无人值守。</p></div></li>
            <li><span>03</span><div><strong>尊重偏好</strong><p>在硬性规则满足后，尽量匹配每个人的休息偏好。</p></div></li>
          </ul>
        </article>
        <article className="content-card notification-card">
          <div className="section-heading"><div><span className="eyebrow">最新动态</span><h2>通知与提醒</h2></div><Icon name="bell" /></div>
          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <Link key={notification.id} href={notification.link ?? "/"}>
                  <i className={notification.readAt ? "read" : ""} />
                  <div><strong>{notification.title}</strong><p>{notification.message}</p></div>
                </Link>
              ))}
            </div>
          ) : <div className="empty-state compact">暂无新通知，今天也会是顺利的一天。</div>}
        </article>
      </section>
    </div>
  );
}

export default async function DashboardPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const currentDate = currentDateInTimeZone(settings.timezone);
  const currentMinutes = currentMinutesInTimeZone(settings.timezone);
  const currentWeekStart = startOfMondayWeek(currentDate);
  const isDayShift = currentMinutes >= 9 * 60 && currentMinutes < 23 * 60;
  const currentShiftType = isDayShift ? "DAY" : "NIGHT";
  const currentShiftDate = !isDayShift && currentMinutes < 9 * 60 ? addDays(currentDate, -1) : currentDate;
  const currentShiftWeek = startOfMondayWeek(currentShiftDate);
  const nextShiftType = isDayShift ? "NIGHT" : "DAY";
  const nextShiftDate = isDayShift ? currentDate : addDays(currentShiftDate, 1);
  const nextShiftWeek = startOfMondayWeek(nextShiftDate);

  if (user) {
    return (
      <AuthenticatedDashboard
        user={user}
        settings={settings}
        currentDate={currentDate}
        currentWeekStart={currentWeekStart}
        currentShiftType={currentShiftType}
        currentShiftDate={currentShiftDate}
        currentShiftWeek={currentShiftWeek}
        nextShiftType={nextShiftType}
        nextShiftDate={nextShiftDate}
        nextShiftWeek={nextShiftWeek}
      />
    );
  }

  const [weekSchedule, dutySchedule, nextSchedule] = await Promise.all([
    getScheduleForWeek(currentWeekStart, true),
    getScheduleForWeek(currentShiftWeek, true),
    nextShiftWeek === currentShiftWeek
      ? getScheduleForWeek(currentShiftWeek, true)
      : getScheduleForWeek(nextShiftWeek, true),
  ]);
  const currentWorkers = dutySchedule?.assignments.filter(
    (assignment) => assignment.date === currentShiftDate && assignment.shiftType === currentShiftType,
  ) ?? [];
  const nextWorkers = nextSchedule?.assignments.filter(
    (assignment) => assignment.date === nextShiftDate && assignment.shiftType === nextShiftType,
  ) ?? [];

  return (
    <PublicDashboard
      settings={settings}
      currentDate={currentDate}
      currentWeekStart={currentWeekStart}
      currentShiftType={currentShiftType}
      weekSchedule={weekSchedule}
      currentWorkers={currentWorkers}
      nextWorkers={nextWorkers}
      nextShiftType={nextShiftType}
    />
  );
}
