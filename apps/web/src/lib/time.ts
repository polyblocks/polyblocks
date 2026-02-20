/**
 * ET (Eastern Time) timezone utilities
 * Uses America/New_York IANA timezone for proper DST handling
 */

const ET_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function getEtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

export function getEtToday(): { month: number; day: number; year: number } {
  const parts = ET_DATE_FORMATTER.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
  };
}

export function toEtDate(iso: string): Date {
  return new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }));
}

/** Format ET time as readable string */
export function formatEtTime(iso: string): string {
  const d = toEtDate(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Format ET time (short) */
export function formatEtTimeShort(iso: string): string {
  const d = toEtDate(iso);
  return d.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgoEt(iso: string): string {
  const nowEt = getEtNow().getTime();
  const thenEt = toEtDate(iso).getTime();
  const ms = nowEt - thenEt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
