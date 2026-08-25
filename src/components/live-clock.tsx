"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function LiveClock({
  timeZone,
  initialIso,
}: {
  timeZone: string;
  initialIso: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(initialIso));
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [timeZone],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [router]);

  return <time dateTime={now.toISOString()}>{formatter.format(now)}</time>;
}
