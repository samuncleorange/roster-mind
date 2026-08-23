"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client-api";
import type { UserRecord } from "@/lib/data";

const restrictionLabels = {
  ANY: "白夜班均可",
  DAY_ONLY: "只上白班",
  NIGHT_ONLY: "只上夜班",
};

const preferenceLabels = {
  NONE: "无特别偏好",
  CONSECUTIVE: "优先连休",
  WEEKEND: "优先周末休",
  WEEKDAY: "优先工作日休",
  SCATTERED: "优先散休",
};

function EmployeeCard({ employee }: { employee: UserRecord }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest(`/api/users/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          active: form.get("active") === "on",
          shiftRestriction: form.get("shiftRestriction"),
          restPreference: form.get("restPreference"),
          rotationOrder: Number(form.get("rotationOrder")),
          ...(form.get("password") ? { password: form.get("password") } : {}),
        }),
      });
      setMessage("已保存");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`employee-card ${employee.active ? "" : "inactive"}`} onSubmit={save}>
      <header>
        <div className="avatar large">{employee.name.slice(0, 1)}</div>
        <div><strong>{employee.name}</strong><span>@{employee.username}</span></div>
        <label className="switch"><input name="active" type="checkbox" defaultChecked={employee.active} /><span /></label>
      </header>
      <div className="two-column-fields">
        <div className="form-field"><label>姓名</label><input name="name" defaultValue={employee.name} required /></div>
        <div className="form-field"><label>轮换顺序</label><input name="rotationOrder" type="number" min="0" defaultValue={employee.rotationOrder} required /></div>
      </div>
      <div className="form-field"><label>班次限制</label><select name="shiftRestriction" defaultValue={employee.shiftRestriction}>{Object.entries(restrictionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="form-field"><label>休息偏好</label><select name="restPreference" defaultValue={employee.restPreference}>{Object.entries(preferenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="form-field"><label>重置密码（可选）</label><input name="password" type="password" minLength={8} placeholder="留空则不修改" /></div>
      <footer>
        <span className={error ? "inline-error" : "inline-success"}>{error || message}</span>
        <button className="secondary-button" disabled={saving}>{saving ? "保存中…" : "保存设置"}</button>
      </footer>
    </form>
  );
}

export function EmployeeManager({ employees }: { employees: UserRecord[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function createEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          name: form.get("name"),
          password: form.get("password"),
          shiftRestriction: form.get("shiftRestriction"),
          restPreference: form.get("restPreference"),
        }),
      });
      event.currentTarget.reset();
      setMessage("员工账户已创建");
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="content-card add-employee-card">
        <div className="section-heading"><div><span className="eyebrow">管理员操作</span><h2>添加员工账户</h2></div><Icon name="plus" /></div>
        <form onSubmit={createEmployee}>
          <div className="form-grid-four">
            <div className="form-field"><label>姓名</label><input name="name" placeholder="员工姓名" required /></div>
            <div className="form-field"><label>用户名</label><input name="username" placeholder="例如 zhangsan" required /></div>
            <div className="form-field"><label>初始密码</label><input name="password" type="password" minLength={8} placeholder="至少 8 个字符" required /></div>
            <div className="form-field"><label>班次限制</label><select name="shiftRestriction" defaultValue="ANY">{Object.entries(restrictionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="form-field"><label>休息偏好</label><select name="restPreference" defaultValue="NONE">{Object.entries(preferenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <div className="form-footer"><span className={error ? "inline-error" : "inline-success"}>{error || message}</span><button className="primary-button" disabled={creating}><Icon name="plus" />{creating ? "正在创建…" : "创建员工"}</button></div>
        </form>
      </section>

      <section className="employee-grid">
        {employees.map((employee) => <EmployeeCard key={employee.id} employee={employee} />)}
      </section>
    </>
  );
}
