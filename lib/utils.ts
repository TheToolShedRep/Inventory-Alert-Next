// lib/utils.ts
export function prettifyText(input: string) {
  return (input || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function isSameUTCDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function nowISO() {
  return new Date().toISOString();
}

// in-memory cooldown (MVP)
const cooldownMap = new Map<string, number>();

export function isCoolingDown(key: string, cooldownMs: number) {
  const last = cooldownMap.get(key);
  if (!last) return false;
  return Date.now() - last < cooldownMs;
}

export function markCooldown(key: string) {
  cooldownMap.set(key, Date.now());
}
