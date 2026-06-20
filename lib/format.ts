import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? parseISO(d) : d;
    return format(date, "dd MMM yyyy");
  } catch {
    return String(d);
  }
}

export function fmtDateShort(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    const date = typeof d === "string" ? parseISO(d) : d;
    return format(date, "dd MMM");
  } catch {
    return String(d);
  }
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return format(d, "yyyy-MM-dd");
}

export function daysBetween(from: string, to: string | Date): number {
  try {
    const a = parseISO(from);
    const b = typeof to === "string" ? parseISO(to) : to;
    return Math.abs(differenceInCalendarDays(b, a));
  } catch {
    return 0;
  }
}

/** ISO week label e.g. "2026-W25" */
export function isoWeek(d: string | Date): string {
  const date = typeof d === "string" ? parseISO(d) : d;
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = tmp.getTime();
  tmp.setUTCMonth(0, 1);
  if (tmp.getUTCDay() !== 4) {
    tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - tmp.getTime()) / (7 * 24 * 3600 * 1000));
  const yr = new Date(firstThursday).getUTCFullYear();
  return `${yr}-W${String(week).padStart(2, "0")}`;
}
