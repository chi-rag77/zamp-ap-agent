export const ACTIVE_RUN_POLL_MS=3_000;
export const PAGE_POLL_MS=30_000;

/** Pause background polling when a tab is hidden; keep only active runs fast. */
export function livePollDelay(pathname:string,visible:boolean,activeRun=true):number|null{
  if(!visible)return null;
  return activeRun&&/^\/agent\/runs\/[^/]+$/.test(pathname)?ACTIVE_RUN_POLL_MS:PAGE_POLL_MS;
}
