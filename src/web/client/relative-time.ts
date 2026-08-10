const second = 1_000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;
const month = 30 * day;

export function formatRelativeTime(instant: Date, now = Date.now(), locale?: string): string {
  const difference = instant.getTime() - now;
  const absolute = Math.abs(difference);
  if (absolute < 5 * second) return "just now";
  if (absolute < minute) return relative(wholeUnits(difference, second), "second", locale);
  if (absolute < hour) return relative(wholeUnits(difference, minute), "minute", locale);
  if (absolute < day) return relative(wholeUnits(difference, hour), "hour", locale);
  if (absolute < month) return relative(wholeUnits(difference, day), "day", locale);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: instant.getFullYear() === new Date(now).getFullYear() ? "medium" : "long",
  }).format(instant);
}

export function nextRelativeTimeUpdate(instant: number, now: number): number {
  const age = Math.abs(now - instant);
  const unit = age < minute ? second : age < hour ? minute : age < day ? hour : day;
  return Math.max(250, unit - (age % unit) + 50);
}

function relative(value: number, unit: Intl.RelativeTimeFormatUnit, locale?: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(value, unit);
}

function wholeUnits(difference: number, unit: number): number {
  return difference < 0 ? Math.ceil(difference / unit) : Math.floor(difference / unit);
}
