"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client-api";
import type { AppSettings } from "@/lib/data";

export function SettingsForm({ settings }: { settings: AppSettings }) {
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
      await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          organizationName: form.get("organizationName"),
          timezone: form.get("timezone"),
          rotationWeeks: Number(form.get("rotationWeeks")),
          rotationAnchorDate: form.get("rotationAnchorDate"),
        }),
      });
      setMessage("设置已保存");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-layout" onSubmit={save}>
      <section className="content-card form-card">
        <div className="section-heading"><div><span className="eyebrow">基础信息</span><h2>排班空间</h2></div><Icon name="settings" /></div>
        <div className="form-field"><label>组织名称</label><input name="organizationName" defaultValue={settings.organizationName} required /></div>
        <div className="form-field"><label>时区</label><select name="timezone" defaultValue={settings.timezone}><option value="Asia/Shanghai">Asia/Shanghai（中国标准时间）</option><option value="America/Los_Angeles">America/Los_Angeles（美国太平洋时间）</option><option value="UTC">UTC</option></select></div>
      </section>
      <section className="content-card form-card">
        <div className="section-heading"><div><span className="eyebrow">轮换策略</span><h2>倒班周期</h2></div><Icon name="sparkles" /></div>
        <div className="form-field"><label>每几周轮换一次</label><select name="rotationWeeks" defaultValue={settings.rotationWeeks}>{[2, 3, 4, 5].map((weeks) => <option key={weeks} value={weeks}>{weeks} 周</option>)}</select></div>
        <div className="form-field"><label>轮换锚点（周一）</label><input name="rotationAnchorDate" type="date" defaultValue={settings.rotationAnchorDate} required /><small className="field-help">系统会自动换算到该日期所在周的周一。</small></div>
      </section>
      <section className="content-card fixed-rules-card">
        <div className="section-heading"><div><span className="eyebrow">安全硬规则</span><h2>固定班次时间</h2></div><Icon name="shield" /></div>
        <div className="fixed-rule"><span className="shift-label day"><Icon name="sun" />白班</span><strong>{settings.dayStart}–{settings.dayEnd}</strong></div>
        <div className="fixed-rule"><span className="shift-label night"><Icon name="moon" />夜班</span><strong>{settings.nightStart}–次日 {settings.nightEnd}</strong></div>
        <ul><li>每人正常每周工作 5 天、休息 2 天</li><li>除明确优先工作日休外，每人至少休 1 天周末</li><li>同组两人的休息日不重叠</li><li>任何一天白班、夜班至少各有 1 人</li><li>夜班结束后不能立即衔接白班</li></ul>
      </section>
      <div className="settings-submit"><span className={error ? "inline-error" : "inline-success"}>{error || message}</span><button className="primary-button" disabled={saving}><Icon name="check" />{saving ? "正在保存…" : "保存全部设置"}</button></div>
    </form>
  );
}
