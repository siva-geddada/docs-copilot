const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

const visitors = new Map<string, number[]>();

/** A simple in-memory limit. It works for one server, and resets when the server restarts. */
export function allow(key: string, now = Date.now()) {
  const recent = (visitors.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    visitors.set(key, recent);
    return false;
  }
  recent.push(now);
  visitors.set(key, recent);
  return true;
}
