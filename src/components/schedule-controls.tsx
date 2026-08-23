"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client-api";

export function ScheduleControls({
  weekStart,
  scheduleId,
  status,
}: {
  weekStart: string;
  scheduleId?: string;
  status?: "DRAFT" | "PUBLISHED";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"generate" | "publish" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setLoading("generate");
    setMessage("");
    setError("");
    try {
      const result = await apiRequest<{ warnings?: string[] }>("/api/schedules/generate", {
        method: "POST",
        body: JSON.stringify({ weekStart }),
      });
      setMessage(result.warnings?.length ? `已生成；${result.warnings.join("；")}` : "排班草稿已生成");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败");
    } finally {
      setLoading(null);
    }
  }

  async function publish() {
    if (!scheduleId) return;
    setLoading("publish");
    setMessage("");
    setError("");
    try {
      await apiRequest(`/api/schedules/${scheduleId}/publish`, { method: "POST" });
      setMessage("排班已经发布，员工现在可以查看");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "发布失败");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="schedule-controls">
      <button className="secondary-button" onClick={generate} disabled={loading !== null || status === "PUBLISHED"}>
        <Icon name="sparkles" />
        {loading === "generate" ? "正在计算…" : scheduleId ? "重新生成草稿" : "智能生成排班"}
      </button>
      {scheduleId && status === "DRAFT" ? (
        <button className="primary-button" onClick={publish} disabled={loading !== null}>
          <Icon name="check" />
          {loading === "publish" ? "正在发布…" : "确认并发布"}
        </button>
      ) : null}
      {message ? <span className="inline-success">{message}</span> : null}
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
