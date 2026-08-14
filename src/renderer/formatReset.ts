export function formatReset(
  value: string | undefined,
  language: string,
  unknown: string,
  now = Date.now(),
): string {
  if (!value) return unknown;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknown;
  const diff = date.getTime() - now;
  const absolute = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(date);
  if (diff <= 0) return absolute;

  const minutes = Math.ceil(diff / 60_000);
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return `${days}d${hours ? ` ${hours}h` : ''} · ${absolute}`;
  }
  const minuteUnit = language.toLowerCase().startsWith('tr') ? 'dk' : 'm';
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}${minuteUnit}` : `${minutes}${minuteUnit}`} · ${absolute}`;
}
