import {describe,expect,it} from 'vitest';
import {matchesRunFilter} from '../../apps/web/lib/run-filters';

describe('live run filters',()=>{
  it('separates explicit retries from background worker attempts',()=>{
    expect(matchesRunFilter('retrying',{status:'QUEUED',retry_count:0,run_type:'RETRY'})).toBe(true);
    expect(matchesRunFilter('retrying',{status:'RUNNING',retry_count:2,run_type:'FULL_PROCESSING'})).toBe(false);
    expect(matchesRunFilter('retrying',{status:'COMPLETED',retry_count:0,run_type:'RETRY'})).toBe(false);
  });
});
