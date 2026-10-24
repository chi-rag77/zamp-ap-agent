import {describe,expect,it} from 'vitest';
import {isAgentWorkerAuthorized} from '../../apps/web/lib/agent-worker-auth';

describe('agent worker authorization',()=>{
  const secrets=['worker-secret','cron-secret'];
  it('accepts either the internal dispatch secret or Vercel cron secret',()=>{
    expect(isAgentWorkerAuthorized('Bearer worker-secret',secrets)).toBe(true);
    expect(isAgentWorkerAuthorized('Bearer cron-secret',secrets)).toBe(true);
  });
  it('rejects missing, malformed, or incorrect credentials',()=>{
    expect(isAgentWorkerAuthorized(null,secrets)).toBe(false);
    expect(isAgentWorkerAuthorized('worker-secret',secrets)).toBe(false);
    expect(isAgentWorkerAuthorized('Bearer wrong-secret',secrets)).toBe(false);
  });
});
