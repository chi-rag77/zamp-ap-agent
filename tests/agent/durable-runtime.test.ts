import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({rpc:vi.fn(),getRun:vi.fn(),executeTool:vi.fn()}));
vi.mock('@zamp/database',()=>({createServerClient:()=>({rpc:mocks.rpc,from:()=>({update:()=>({eq:async()=>({error:null})}),select:()=>({eq:()=>({limit:async()=>({data:[],error:null})})})})})}));
vi.mock('../../packages/agent/src/run-manager',()=>({getRun:mocks.getRun}));
vi.mock('../../packages/agent/src/tool-executor',()=>({executeTool:mocks.executeTool}));
import {processNextAgentJob} from '../../packages/agent/src/durable-runtime';

describe('durable agent worker',()=>{
 beforeEach(()=>{mocks.rpc.mockReset();mocks.getRun.mockReset();mocks.executeTool.mockReset()});
 it('claims and checkpoints one stage, then leaves the next stage queued',async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>{
   if(name==='recover_stale_agent_runs')return {data:0,error:null};
   if(name==='claim_agent_job')return {data:[{id:'job-1',run_id:'run-1',invoice_id:'invoice-1',step_key:'LOAD_INVOICE',attempt:1,max_attempts:3}],error:null};
   if(name==='complete_agent_job')return {data:true,error:null};
   throw new Error(`Unexpected RPC ${name}`);
  });
  mocks.getRun.mockResolvedValue({id:'run-1',invoice_id:'invoice-1',status:'RUNNING',current_state:'RECEIVED',current_step:'LOAD_INVOICE',step_count:0,agent_version:'1.0.0',started_at:new Date().toISOString(),context:{}});
  mocks.executeTool.mockResolvedValue({id:'invoice-1',status:'RECEIVED',current_extraction_id:null,invoice_number:'INV-1',total:100});
  const result=await processNextAgentJob();
  expect(result).toMatchObject({claimed:true,step:'LOAD_INVOICE',status:'RUNNING'});
  expect(mocks.executeTool).toHaveBeenCalledTimes(1);
  expect(mocks.executeTool.mock.calls[0][1]).toBe('getInvoice');
  const checkpoint=mocks.rpc.mock.calls.find(call=>call[0]==='complete_agent_job')?.[1];
  expect(checkpoint).toMatchObject({p_state:'RESOLVING_VENDOR',p_next_step:'RESOLVE_VENDOR_PO',p_run_status:'RUNNING'});
 });
 it('returns without executing work when the queue is empty',async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>name==='recover_stale_agent_runs'?{data:0,error:null}:{data:[],error:null});
  await expect(processNextAgentJob()).resolves.toEqual({claimed:false});
  expect(mocks.executeTool).not.toHaveBeenCalled();
 });
});
