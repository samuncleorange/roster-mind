"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client-api";

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="username">用户名</label>
        <input id="username" name="username" autoComplete="username" placeholder="请输入用户名" required />
      </div>
      <div className="form-field">
        <label htmlFor="password">密码</label>
        <input id="password" name="password" type="password" autoComplete="current-password" placeholder="请输入密码" required />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button login-button" type="submit" disabled={loading}>
        <Icon name="sparkles" />
        {loading ? "正在登录…" : "进入排班空间"}
      </button>
    </form>
  );
}
