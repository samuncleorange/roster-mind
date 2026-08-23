import { RequestCenter } from "@/components/request-center";
import { requireCurrentUser } from "@/lib/auth";
import {
  getSettings,
  listLeaveRequests,
  listPublishedAssignmentsBetween,
  listSwapRequests,
} from "@/lib/data";
import { addDays, currentDateInTimeZone } from "@/lib/dates";

export const metadata = { title: "申请中心" };

export default async function RequestsPage() {
  const user = await requireCurrentUser();
  const settings = await getSettings();
  const currentDate = currentDateInTimeZone(settings.timezone);
  const [assignments, leaveRequests, swapRequests] = await Promise.all([
    listPublishedAssignmentsBetween(currentDate, addDays(currentDate, 35)),
    listLeaveRequests(user.role === "EMPLOYEE" ? user.id : undefined),
    listSwapRequests(user.role === "EMPLOYEE" ? user.id : undefined),
  ]);

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <span className="eyebrow">有事提前说，安排更从容</span>
          <h1>{user.role === "ADMIN" ? "申请审批" : "请假与换班"}</h1>
          <p>{user.role === "ADMIN" ? "处理员工请假，并查看换班协同记录。" : "请假由管理员审批，换班在对方同意并通过规则校验后生效。"}</p>
        </div>
      </header>
      <RequestCenter
        role={user.role}
        currentUserId={user.id}
        currentPreference={user.restPreference}
        assignments={assignments}
        leaveRequests={leaveRequests}
        swapRequests={swapRequests}
      />
    </div>
  );
}
