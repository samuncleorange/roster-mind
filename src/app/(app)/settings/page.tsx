import { SettingsForm } from "@/components/settings-form";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const metadata = { title: "排班设置" };

export default async function SettingsPage() {
  await requireAdminPage();
  const settings = await getSettings();
  return (
    <div className="page-shell">
      <header className="page-header"><div><span className="eyebrow">全局规则</span><h1>排班设置</h1><p>设置倒班周期与时区。固定安全规则不会被员工偏好覆盖。</p></div></header>
      <SettingsForm settings={settings} />
    </div>
  );
}
