"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import type {
  AssignmentRecord,
  LeaveRequestRecord,
  SwapRequestRecord,
} from "@/lib/data";
import { apiRequest } from "@/lib/client-api";
import type { RestPreference, UserRole } from "@/lib/domain";

const preferenceLabels: Record<RestPreference, string> = {
  NONE: "无特别偏好",
  CONSECUTIVE: "优先连休",
  WEEKEND: "优先周末休",
  WEEKDAY: "优先工作日休",
  SCATTERED: "优先散休",
};

const statusLabels = {
  PENDING: "待处理",
  APPROVED: "已同意",
  REJECTED: "已拒绝",
  CANCELLED: "已撤销",
};

function shiftLabel(shiftType: "DAY" | "NIGHT") {
  return shiftType === "DAY" ? "白班" : "夜班";
}

export function RequestCenter({
  role,
  currentUserId,
  currentPreference,
  assignments,
  leaveRequests,
  swapRequests,
}: {
  role: UserRole;
  currentUserId: string;
  currentPreference: RestPreference;
  assignments: AssignmentRecord[];
  leaveRequests: LeaveRequestRecord[];
  swapRequests: SwapRequestRecord[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sourceAssignmentId, setSourceAssignmentId] = useState("");
  const ownAssignments = assignments.filter((assignment) => assignment.employeeId === currentUserId);
  const selectedSource = ownAssignments.find((assignment) => assignment.id === sourceAssignmentId);
  const targetAssignments = selectedSource
    ? assignments.filter((assignment) => {
      if (
        assignment.employeeId === currentUserId ||
        assignment.scheduleId !== selectedSource.scheduleId ||
        assignment.shiftType !== selectedSource.shiftType ||
        assignment.date === selectedSource.date
      ) {
        return false;
      }
      const targetWorksSourceDate = assignments.some(
        (candidate) =>
          candidate.employeeId === assignment.employeeId &&
          candidate.date === selectedSource.date,
      );
      const requesterWorksTargetDate = assignments.some(
        (candidate) => candidate.employeeId === currentUserId && candidate.date === assignment.date,
      );
      return !targetWorksSourceDate && !requesterWorksTargetDate;
    })
    : [];

  async function perform(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key);
    setMessage("");
    setError("");
    try {
      await operation();
      setMessage(success);
      router.refresh();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  async function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      "leave",
      () =>
        apiRequest("/api/leaves", {
          method: "POST",
          body: JSON.stringify({
            startDate: form.get("startDate"),
            endDate: form.get("endDate"),
            reason: form.get("reason"),
          }),
        }),
      "请假申请已提交",
    );
    event.currentTarget.reset();
  }

  async function submitSwap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      "swap",
      () =>
        apiRequest("/api/swaps", {
          method: "POST",
          body: JSON.stringify({
            sourceAssignmentId: form.get("sourceAssignmentId"),
            targetAssignmentId: form.get("targetAssignmentId"),
            reason: form.get("reason"),
          }),
        }),
      "换班申请已发送给对方",
    );
    setSourceAssignmentId("");
    event.currentTarget.reset();
  }

  async function savePreference(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(
      "preference",
      () =>
        apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ restPreference: form.get("restPreference") }),
        }),
      "休息偏好已保存，下次排班会优先考虑",
    );
  }

  return (
    <>
      {message ? <div className="feedback-banner success">{message}</div> : null}
      {error ? <div className="feedback-banner error">{error}</div> : null}

      {role === "EMPLOYEE" ? (
        <section className="request-form-grid">
          <article className="content-card form-card">
            <div className="section-heading"><div><span className="eyebrow">提前报备</span><h2>申请请假</h2></div><Icon name="calendar" /></div>
            <form onSubmit={submitLeave}>
              <div className="two-column-fields">
                <div className="form-field"><label htmlFor="leave-start">开始日期</label><input id="leave-start" name="startDate" type="date" required /></div>
                <div className="form-field"><label htmlFor="leave-end">结束日期</label><input id="leave-end" name="endDate" type="date" required /></div>
              </div>
              <div className="form-field"><label htmlFor="leave-reason">请假说明</label><textarea id="leave-reason" name="reason" rows={3} placeholder="简单说明原因，方便管理员安排" /></div>
              <button className="primary-button" disabled={busy === "leave"}>{busy === "leave" ? "正在提交…" : "提交请假申请"}</button>
            </form>
          </article>

          <article className="content-card form-card">
            <div className="section-heading"><div><span className="eyebrow">双方确认</span><h2>申请换班</h2></div><Icon name="requests" /></div>
            <form onSubmit={submitSwap}>
              <div className="form-field">
                <label htmlFor="source-assignment">我想换出的值班</label>
                <select id="source-assignment" name="sourceAssignmentId" value={sourceAssignmentId} onChange={(event) => setSourceAssignmentId(event.target.value)} required>
                  <option value="">请选择自己的值班</option>
                  {ownAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.date} · {shiftLabel(assignment.shiftType)}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="target-assignment">希望交换的值班</label>
                <select id="target-assignment" name="targetAssignmentId" disabled={!selectedSource} required>
                  <option value="">{selectedSource ? "请选择对方值班" : "请先选择自己的值班"}</option>
                  {targetAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.date} · {assignment.employeeName} · {shiftLabel(assignment.shiftType)}</option>)}
                </select>
                {selectedSource && !targetAssignments.length ? <small className="field-help">当前没有符合安全规则的可交换班次。</small> : null}
              </div>
              <div className="form-field"><label htmlFor="swap-reason">换班说明</label><textarea id="swap-reason" name="reason" rows={3} placeholder="告诉对方为什么需要换班" /></div>
              <button className="primary-button" disabled={busy === "swap" || !targetAssignments.length}>{busy === "swap" ? "正在发送…" : "发送换班申请"}</button>
            </form>
          </article>

          <article className="content-card preference-card">
            <div className="section-heading"><div><span className="eyebrow">个性化排班</span><h2>我的休息偏好</h2></div><Icon name="sparkles" /></div>
            <p>现场覆盖和每周休息两天是硬规则；系统会在此基础上尽量满足你的偏好。</p>
            <form onSubmit={savePreference}>
              <div className="preference-options">
                {Object.entries(preferenceLabels).map(([value, label]) => (
                  <label key={value}><input type="radio" name="restPreference" value={value} defaultChecked={currentPreference === value} /><span>{label}</span></label>
                ))}
              </div>
              <button className="secondary-button" disabled={busy === "preference"}>{busy === "preference" ? "正在保存…" : "保存偏好"}</button>
            </form>
          </article>
        </section>
      ) : null}

      <section className="request-history-grid">
        <article className="content-card">
          <div className="section-heading"><div><span className="eyebrow">休假记录</span><h2>{role === "ADMIN" ? "员工请假审批" : "我的请假"}</h2></div><span className="count-chip">{leaveRequests.length}</span></div>
          <div className="request-list">
            {leaveRequests.map((leave) => (
              <div className="request-item" key={leave.id}>
                <div className="request-date"><strong>{leave.startDate}</strong><span>至 {leave.endDate}</span></div>
                <div className="request-main"><strong>{leave.userName}</strong><p>{leave.reason || "未填写说明"}</p></div>
                <span className={`request-status ${leave.status.toLowerCase()}`}>{statusLabels[leave.status]}</span>
                {leave.status === "PENDING" ? (
                  <div className="request-actions">
                    {role === "ADMIN" ? <>
                      <button onClick={() => perform(`leave-approve-${leave.id}`, () => apiRequest(`/api/leaves/${leave.id}`, { method: "PATCH", body: JSON.stringify({ status: "APPROVED" }) }), "请假申请已批准")} disabled={busy !== ""}>同意</button>
                      <button className="danger" onClick={() => perform(`leave-reject-${leave.id}`, () => apiRequest(`/api/leaves/${leave.id}`, { method: "PATCH", body: JSON.stringify({ status: "REJECTED" }) }), "请假申请已拒绝")} disabled={busy !== ""}>拒绝</button>
                    </> : leave.userId === currentUserId ? (
                      <button className="muted" onClick={() => perform(`leave-cancel-${leave.id}`, () => apiRequest(`/api/leaves/${leave.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }), "请假申请已撤销")} disabled={busy !== ""}>撤销</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {!leaveRequests.length ? <div className="empty-state compact">暂无请假记录</div> : null}
          </div>
        </article>

        <article className="content-card">
          <div className="section-heading"><div><span className="eyebrow">协同记录</span><h2>{role === "ADMIN" ? "全部换班申请" : "我的换班"}</h2></div><span className="count-chip">{swapRequests.length}</span></div>
          <div className="request-list">
            {swapRequests.map((swap) => (
              <div className="request-item" key={swap.id}>
                <div className="request-date"><strong>{swap.sourceDate}</strong><span>换 {swap.targetDate}</span></div>
                <div className="request-main"><strong>{swap.requesterName} ↔ {swap.targetUserName}</strong><p>{shiftLabel(swap.shiftType)} · {swap.reason || "未填写说明"}</p></div>
                <span className={`request-status ${swap.status.toLowerCase()}`}>{statusLabels[swap.status]}</span>
                {role === "EMPLOYEE" && swap.status === "PENDING" ? (
                  <div className="request-actions">
                    {swap.targetUserId === currentUserId ? <>
                      <button onClick={() => perform(`swap-approve-${swap.id}`, () => apiRequest(`/api/swaps/${swap.id}`, { method: "PATCH", body: JSON.stringify({ status: "APPROVED" }) }), "换班已经生效")} disabled={busy !== ""}>同意</button>
                      <button className="danger" onClick={() => perform(`swap-reject-${swap.id}`, () => apiRequest(`/api/swaps/${swap.id}`, { method: "PATCH", body: JSON.stringify({ status: "REJECTED" }) }), "换班申请已拒绝")} disabled={busy !== ""}>拒绝</button>
                    </> : swap.requesterId === currentUserId ? (
                      <button className="muted" onClick={() => perform(`swap-cancel-${swap.id}`, () => apiRequest(`/api/swaps/${swap.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }), "换班申请已撤销")} disabled={busy !== ""}>撤销</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {!swapRequests.length ? <div className="empty-state compact">暂无换班记录</div> : null}
          </div>
        </article>
      </section>
    </>
  );
}
