const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`无效日期：${value}`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效日期：${value}`);
  }

  return date;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, amount: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateOnly(date);
}

export function daysBetween(start: string, end: string): number {
  const milliseconds = parseDateOnly(end).getTime() - parseDateOnly(start).getTime();
  return Math.round(milliseconds / 86_400_000);
}

export function enumerateDates(start: string, end: string): string[] {
  const totalDays = daysBetween(start, end);
  if (totalDays < 0) {
    return [];
  }

  return Array.from({ length: totalDays + 1 }, (_, index) => addDays(start, index));
}

export function startOfMondayWeek(value: string): string {
  const date = parseDateOnly(value);
  const day = date.getUTCDay();
  const distance = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + distance);
  return formatDateOnly(date);
}

export function currentDateInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function currentMinutesInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}
