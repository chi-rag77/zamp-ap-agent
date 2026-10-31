import {describe,expect,it} from 'vitest';
import {ACTIVE_RUN_POLL_MS,livePollDelay,PAGE_POLL_MS} from '../../packages/realtime/src/polling';

describe('live update polling cadence',()=>{
  it('pauses when the tab is hidden',()=>expect(livePollDelay('/invoices',false)).toBeNull());
  it('keeps a visible active run responsive',()=>expect(livePollDelay('/agent/runs/run-123',true)).toBe(ACTIVE_RUN_POLL_MS));
  it('uses a low frequency for ordinary pages and completed runs',()=>{
    expect(livePollDelay('/invoices',true)).toBe(PAGE_POLL_MS);
    expect(livePollDelay('/agent/runs/run-123',true,false)).toBe(PAGE_POLL_MS);
  });
});
