import {describe,expect,it} from 'vitest';
import {formatRunElapsed,matchesRunFilter} from '../../apps/web/lib/run-filters';

describe('live run filters',()=>{
  it('keeps retried active runs separate from fresh running jobs',()=>{
    expect(matchesRunFilter('running',{status:'RUNNING',retry_count:0})).toBe(true);
    expect(matchesRunFilter('running',{status:'RUNNING',retry_count:1})).toBe(false);
    expect(matchesRunFilter('retrying',{status:'RUNNING',retry_count:1})).toBe(true);
  });

  it('maps review and terminal states to their own filters',()=>{
    expect(matchesRunFilter('review',{status:'WAITING',retry_count:0})).toBe(true);
    expect(matchesRunFilter('completed',{status:'COMPLETED',retry_count:0})).toBe(true);
    expect(matchesRunFilter('failed',{status:'FAILED',retry_count:2})).toBe(true);
    expect(matchesRunFilter('retrying',{status:'FAILED',retry_count:2})).toBe(false);
  });
});

describe('run elapsed time',()=>{
  it('formats persisted durations and live elapsed time without a fabricated progress ratio',()=>{
    expect(formatRunElapsed('2026-10-24T10:00:00Z',null,null,Date.parse('2026-10-24T10:01:05Z'))).toBe('1m 05s');
    expect(formatRunElapsed('2026-10-24T10:00:00Z','2026-10-24T10:00:02.345Z',2345)).toBe('2.3 s');
  });
});
