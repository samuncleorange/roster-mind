import Link from "next/link";
import { redirect } from "next/navigation";

import { Icon } from "@/components/icons";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "登录" };

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-visual">
          <div className="login-brand-mark"><Icon name="sparkles" /></div>
          <span className="eyebrow">智能 · 公平 · 有温度</span>
          <h1>让每一次值班，<br />都安排得刚刚好。</h1>
          <p>为四人白夜班团队打造的科学排班工具，兼顾现场覆盖、充分休息与个人偏好。</p>
          <div className="login-feature-list">
            <span><Icon name="check" /> 每周工作 5 天、休息 2 天</span>
            <span><Icon name="check" /> 白夜班自动轮换与安全衔接</span>
            <span><Icon name="check" /> 请假、换班在线协同</span>
          </div>
        </div>
        <div className="login-panel">
          <div>
            <span className="brand-title">RosterMind</span>
            <h2>欢迎回来</h2>
            <p>登录后申请请假、协商换班或管理团队排班。</p>
          </div>
          <LoginForm />
          <Link href="/" className="login-public-link"><Icon name="arrowLeft" />返回公开值班看板</Link>
          <small className="login-note"><Icon name="shield" /> 账户由管理员统一创建和管理</small>
        </div>
      </section>
    </main>
  );
}
