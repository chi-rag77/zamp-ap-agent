export const ACTIVE_RUN_POLL_MS=3_000;
// Idle pages only need a background check; active runs keep their faster cadence.
export const PAGE_POLL_MS=60_000;

/** Pause background polling when a tab is hidden; keep only active runs fast. */
export function livePollDelay(pathname:string,visible:boolean,activeRun=true):number|null{
  if(!visible)return null;
  return activeRun&&/^\/agent\/runs\/[^/]+$/.test(pathname)?ACTIVE_RUN_POLL_MS:PAGE_POLL_MS;
}
