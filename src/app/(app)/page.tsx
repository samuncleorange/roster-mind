import Link from "next/link";

import { Icon } from "@/components/icons";
import { WeekSchedule } from "@/components/week-schedule";
import { requireCurrentUser } from "@/lib/auth";
import {
  getScheduleForWeek,
  getSettings,
  listActiveEmployees,
  listLeaveRequests,
  listNotifications,
  listSwapRequests,
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

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const settings = await getSettings();
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
