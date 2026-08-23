"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import type { CurrentUser } from "@/lib/auth";
import { apiRequest } from "@/lib/client-api";

interface AppShellProps {
  user: CurrentUser;
  organizationName: string;
  children: ReactNode;
}

const commonNavigation: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/schedule", label: "排班", icon: "calendar" },
  { href: "/requests", label: "申请", icon: "requests" },
];

export function AppShell({ user, organizationName, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const navigation = [
    ...commonNavigation,
    ...(user.role === "ADMIN"
      ? [
          { href: "/team", label: "员工", icon: "team" as const },
          { href: "/settings", label: "设置", icon: "settings" as const },
        ]
      : []),
  ];

  async function logout() {
    setLoggingOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark"><Icon name="sparkles" /></span>
          <span>
            <strong>RosterMind</strong>
            <small>智排班</small>
          </span>
        </Link>

        <div className="organization-chip">{organizationName}</div>

        <nav className="sidebar-nav" aria-label="主导航">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.role === "ADMIN" ? "管理员" : "员工"}</span>
          </div>
          <button onClick={logout} disabled={loggingOut} title="退出登录">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <header className="mobile-topbar">
        <Link href="/" className="brand">
          <span className="brand-mark"><Icon name="sparkles" /></span>
          <span><strong>RosterMind</strong><small>{user.name}</small></span>
        </Link>
        <button onClick={logout} disabled={loggingOut} aria-label="退出登录">
          <Icon name="logout" />
        </button>
      </header>

      <main className="app-content">{children}</main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navigation.slice(0, 5).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : ""}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
