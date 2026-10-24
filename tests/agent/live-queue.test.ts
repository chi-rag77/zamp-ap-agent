import {describe,expect,it,vi} from 'vitest';
const mockStart=vi.hoisted(()=>vi.fn());
vi.mock('../../packages/agent/src/run-manager',()=>({startAgentRun:mockStart,setVersion:vi.fn(),transition:vi.fn()}));
import {runAgent} from '../../packages/agent/src/runtime';

describe('live agent trigger',()=>{
 it('returns after atomically queuing a run instead of executing stages in the request',async()=>{
  mockStart.mockResolvedValue('run-queued');
  await expect(runAgent('invoice-1')).resolves.toMatchObject({runId:'run-queued',status:'QUEUED',verificationStatus:'NOT_APPLICABLE'});
  expect(mockStart).toHaveBeenCalledWith('invoice-1');
 });
});
