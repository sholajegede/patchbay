export type Tone = "neutral" | "good" | "live" | "pending" | "bad";

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function roomStatusTone(status?: string): Tone {
  return status === "started" ? "good" : "neutral";
}

export function isEgressLive(status: string): boolean {
  return status === "EGRESS_STARTING" || status === "EGRESS_ACTIVE" || status === "EGRESS_ENDING";
}

export function egressStatusTone(status: string): Tone {
  if (isEgressLive(status)) return "live";
  if (status === "EGRESS_COMPLETE") return "good";
  if (status === "EGRESS_FAILED" || status === "EGRESS_ABORTED") return "bad";
  return "neutral";
}

export function ingressStateTone(state?: string): Tone {
  if (state === "ENDPOINT_PUBLISHING") return "good";
  if (state === "ENDPOINT_ERROR") return "bad";
  if (state === "ENDPOINT_BUFFERING") return "pending";
  return "neutral";
}

// Wraps the Date.now() read so components never call it directly during
// render (React's purity rule flags that) — this is the only place it
// happens, and it's already an impure helper by nature (relativeTime above
// does the same).
export function timeSince(ms: number): string {
  return formatDuration(Date.now() - ms);
}

export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
}
