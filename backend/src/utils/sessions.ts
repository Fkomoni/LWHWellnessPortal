/** Sun 00:00:00 UTC → Sat 23:59:59.999 UTC boundaries for a given date */
export function getWeekBoundaries(now = new Date()): { start: Date; end: Date } {
  const day = now.getUTCDay(); // 0 = Sunday
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** Next Sunday 00:00:00 UTC (start of next week = reset time) */
export function getNextWeekStart(now = new Date()): Date {
  const { end } = getWeekBoundaries(now);
  const next = new Date(end);
  next.setUTCMilliseconds(next.getUTCMilliseconds() + 1);
  return next;
}

/**
 * Weekly session limit derived from an annual Prognosis figure.
 * monthly = floor(annual / 12), weekly = round(monthly / 4), min 1.
 * e.g. 208 annual → 17 monthly → round(4.25) = 4 weekly.
 */
export function calculateWeeklyLimit(annualSessions: number): number {
  if (annualSessions <= 0) return 1;
  const monthly = Math.floor(annualSessions / 12);
  return Math.max(1, Math.round(monthly / 4));
}
