/**
 * E7: structured scheduling logs (stdout; forward to APM/log drains in production).
 */
export function logSchedulingEvent(event: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    channel: "SCHEDULING",
    ...event,
  });
  console.info(line);
}
