export function fmtTs(timestamp: number | null | undefined): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("ko-KR");
}

export function fmtNumber(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
