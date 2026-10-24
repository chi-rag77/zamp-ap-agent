import {createServerClient} from '@zamp/database';
import type {AgentContext,AgentState} from './types';
import {AGENT_VERSION} from './types';
import {agentDecision} from './decisions';
import {AgentError,errorCode} from './errors';
import {executeTool} from './tool-executor';
import {initializeContext} from './context';
import {assertTransition} from './state-machine';
import {getRun} from './run-manager';
import {isTransient} from './retry';

type Job={id:string;run_id:string;invoice_id:string;step_key:string;attempt:number;max_attempts:number};
const db=()=>createServerClient();

/** Claims and executes exactly one durable stage. The next stage is committed atomically with its checkpoint. */
export async function processNextAgentJob(){
 const {error:recoveryError}=await db().rpc('recover_stale_agent_runs',{p_stale_seconds:180});
 if(recoveryError)throw new AgentError('QUEUE_RECOVERY_FAILED',recoveryError.message);
 const {data:jobs,error:claimError}=await db().rpc('claim_agent_job',{p_lease_seconds:240});
 if(claimError)throw new AgentError('QUEUE_CLAIM_FAILED',claimError.message);
 const job=(jobs as Job[]|null)?.[0];
 if(!job)return {claimed:false as const};
 const started=Date.now();
 try{
  const run=await getRun(job.run_id);
  if(['CANCELLED','COMPLETED','FAILED'].includes(run.status)){
   await db().from('agent_jobs').update({status:'CANCELLED',processed_at:new Date().toISOString(),lease_expires_at:null}).eq('id',job.id).eq('status','PROCESSING');
   return {claimed:true as const,runId:job.run_id,step:job.step_key,status:run.status};
  }
  const context=restoreContext(run,job);
  const result=await advance(context,job.step_key);
  const durationMs=Date.now()-started;
  const {data,error}=await db().rpc('complete_agent_job',{
   p_job_id:job.id,p_context:serializeContext(context),p_state:context.state,p_step_count:context.stepCount,
   p_current_step:result.nextStep,p_run_status:result.runStatus,p_next_step:result.nextStep,
   p_final_decision:result.decision??null,p_summary:result.summary??null,p_reason_code:result.reasonCode??null,
   p_action_executed:result.actionExecuted??null,p_verification_status:result.verificationStatus??null
  });
  if(error)throw new AgentError('CHECKPOINT_FAILED',error.message);
  if(data!==true)throw new AgentError('STALE_JOB','Job lease was lost before its checkpoint was saved');
  return {claimed:true as const,runId:job.run_id,step:job.step_key,status:result.runStatus,durationMs};
 }catch(error){
  const code=errorCode(error,'AGENT_STEP_FAILED');
  const retryable=isTransient(error)&&!['ACTION_VERIFICATION_FAILED','ACTION_NOT_ALLOWED','STALE_DECISION','INVOICE_NOT_PROCESSABLE'].includes(code);
  const delays=[2,5,15];
  const base=delays[Math.max(0,Math.min(job.attempt-1,delays.length-1))]??30;
  const delay=Math.round(base*(0.8+Math.random()*0.4));
  const {data:failureError}=await db().rpc('fail_agent_job',{p_job_id:job.id,p_error_code:code,p_error_message:error instanceof Error?error.message:'Unknown agent failure',p_retryable:retryable,p_delay_seconds:delay});
  if(failureError)throw new AggregateError([error,failureError],'Agent stage failed and failure could not be recorded');
  return {claimed:true as const,runId:job.run_id,step:job.step_key,status:'FAILED' as const,errorCode:code,retryable,retryAfterSeconds:retryable?delay:undefined};
 }
}

type StageResult={nextStep:string|null;runStatus:'RUNNING'|'WAITING'|'COMPLETED';decision?:string;summary?:string;reasonCode?:string;actionExecuted?:string;verificationStatus?:'VERIFIED'|'FAILED'|'NOT_APPLICABLE'};
async function advance(context:AgentContext,step:string):Promise<StageResult>{
 switch(step){
  case 'LOAD_INVOICE':{
   move(context,'INITIALIZING');move(context,'LOADING_CONTEXT');
   const invoice=await executeTool<Record<string,unknown>>(context,'getInvoice',{invoiceId:context.invoiceId},'READ');
   if(invoice.archived_at||['APPROVED','REJECTED'].includes(String(invoice.status)))throw new AgentError('INVOICE_NOT_PROCESSABLE');
   if(invoice.current_extraction_id){
    const extraction=await db().from('invoice_extractions').select('provider,model,status,overall_confidence').eq('id',String(invoice.current_extraction_id)).maybeSingle();
    if(extraction.error)throw new AgentError('TOOL_EXECUTION_FAILED',extraction.error.message);
    context.extraction=extraction.data??undefined;
    if(extraction.data)await db().from('agent_runs').update({extraction_version:`${extraction.data.provider}:${extraction.data.model}`}).eq('id',context.runId);
    move(context,'RESOLVING_VENDOR');
    return {nextStep:'RESOLVE_VENDOR_PO',runStatus:'RUNNING'};
   }
   const {data:documents,error:documentError}=await db().from('invoice_documents').select('id').eq('invoice_id',context.invoiceId).limit(1);
   if(documentError)throw new AgentError('TOOL_EXECUTION_FAILED',documentError.message);
   if(!documents?.length&&invoice.invoice_number&&invoice.total!=null){context.warnings.push('Source document unavailable; proceeding with saved invoice fields.');move(context,'RESOLVING_VENDOR');return {nextStep:'RESOLVE_VENDOR_PO',runStatus:'RUNNING'}}
   move(context,'EXTRACTING');return {nextStep:'EXTRACT_DOCUMENT',runStatus:'RUNNING'};
  }
  case 'EXTRACT_DOCUMENT':{
   const output=await executeTool<Record<string,unknown>>(context,'extractInvoice',{invoiceId:context.invoiceId},'AI');
   const {data:invoice,error}=await db().from('invoices').select('id,invoice_number,vendor_id,po_id,status,decision,total,currency,extraction_confidence,current_extraction_id,archived_at').eq('id',context.invoiceId).single();
   if(error)throw new AgentError('TOOL_EXECUTION_FAILED',error.message);context.invoice=invoice;
   const version=`${output.provider??'unknown'}:${output.model??'unknown'}`;
   const saved=await db().from('agent_runs').update({extraction_version:version}).eq('id',context.runId);if(saved.error)throw new AgentError('CHECKPOINT_FAILED',saved.error.message);
   move(context,'RESOLVING_VENDOR');return {nextStep:'RESOLVE_VENDOR_PO',runStatus:'RUNNING'};
  }
  case 'RESOLVE_VENDOR_PO':{
   await executeTool(context,'resolveVendorPO',{invoiceId:context.invoiceId},'READ');
   move(context,'RESOLVING_PO');move(context,'VALIDATING');return {nextStep:'VALIDATE_INVOICE',runStatus:'RUNNING'};
  }
  case 'VALIDATE_INVOICE':{
   const output=await executeTool<Record<string,unknown>>(context,'validateInvoice',{invoiceId:context.invoiceId},'VALIDATION');
   if(output.engineVersion){const {error}=await db().from('agent_runs').update({matching_engine_version:output.engineVersion}).eq('id',context.runId);if(error)throw new AgentError('CHECKPOINT_FAILED',error.message)}
   move(context,'EVALUATING_POLICY');return {nextStep:'LOAD_POLICY',runStatus:'RUNNING'};
  }
  case 'LOAD_POLICY':{
   const policy=await executeTool<Record<string,unknown>|null>(context,'getActivePolicy',{},'READ');
   if(policy){const {error}=await db().from('agent_runs').update({policy_version:String(policy.version)}).eq('id',context.runId);if(error)throw new AgentError('CHECKPOINT_FAILED',error.message)}
   return {nextStep:'EVALUATE_POLICY',runStatus:'RUNNING'};
  }
  case 'EVALUATE_POLICY':{
   const output=await executeTool<Record<string,unknown>>(context,'evaluateInvoicePolicy',{invoiceId:context.invoiceId},'POLICY');
   const {data:run,error}=await db().from('agent_runs').select('policy_version').eq('id',context.runId).single();
   if(error)throw new AgentError('CHECKPOINT_FAILED',error.message);
   if(context.policy&&run.policy_version!==context.policy.version)throw new AgentError('STALE_DECISION','Policy changed during evaluation; the decision will not be executed');
   move(context,'DECISION_READY');return {nextStep:'ACTION_GUARD',runStatus:'RUNNING',summary:String(output.summary??'Policy decision evaluated'),reasonCode:String(output.reasonCode??'')};
  }
  case 'ACTION_GUARD':{
   if(!context.policyDecision)throw new AgentError('POLICY_EVALUATION_FAILED','No deterministic policy decision is available');
   move(context,'ACTION_GUARD');
   const action=context.policyDecision.decision;
   if(!['AUTO_APPROVE','AUTO_REJECT','NEEDS_REVIEW','CANNOT_DECIDE'].includes(action))throw new AgentError('POLICY_EVALUATION_FAILED','Unsupported policy decision');
   move(context,'EXECUTING');return {nextStep:'EXECUTE_ACTION',runStatus:'RUNNING'};
  }
  case 'EXECUTE_ACTION':{
   const decision=context.policyDecision?.decision;
   if(!decision)throw new AgentError('POLICY_EVALUATION_FAILED');
   const tool=decision==='AUTO_APPROVE'?'approveInvoice':decision==='AUTO_REJECT'?'rejectInvoice':'createReviewCase';
   const actionInput=tool==='createReviewCase'?{reasonCode:context.policyDecision?.reasonCode??'SYSTEM_ERROR',summary:context.policyDecision?.summary??'Human review is required'}:{};
   const action=await executeTool<Record<string,unknown>>(context,tool,actionInput,'ACTION');
   if(action&&typeof action==='object')context.reviewCase=action;
   move(context,'VERIFYING');return {nextStep:'VERIFY_ACTION',runStatus:'RUNNING'};
  }
  case 'VERIFY_ACTION':{
   const decision=context.policyDecision?.decision;
   if(!decision)throw new AgentError('POLICY_EVALUATION_FAILED');
   const expected=decision==='AUTO_APPROVE'?'APPROVED':decision==='AUTO_REJECT'?'REJECTED':'NEEDS_REVIEW';
   const verification=await executeTool<Record<string,unknown>>(context,'verifyInvoiceState',{expected},'VERIFICATION');
   const state:AgentState=decision==='NEEDS_REVIEW'?'NEEDS_REVIEW':decision==='CANNOT_DECIDE'?'CANNOT_DECIDE':'COMPLETED';
   move(context,state);
   const runStatus=state==='COMPLETED'?'COMPLETED':'WAITING';
   const {error}=await db().from('agent_runs').update({duration_ms:Date.now()-new Date(context.metadata.startedAt).getTime()}).eq('id',context.runId);if(error)throw new AgentError('CHECKPOINT_FAILED',error.message);
   return {nextStep:null,runStatus,decision:agentDecision(decision),summary:context.policyDecision?.summary??'Invoice processing completed',reasonCode:context.policyDecision?.reasonCode,actionExecuted:decision==='AUTO_APPROVE'?'APPROVE':decision==='AUTO_REJECT'?'REJECT':'CREATE_REVIEW',verificationStatus:verification.status==='VERIFIED'?'VERIFIED':'FAILED'};
  }
  default:throw new AgentError('UNKNOWN_AGENT_STEP',step);
 }
}

function move(context:AgentContext,next:AgentState){if(context.state===next)return;assertTransition(context.state,next);context.state=next}
function restoreContext(run:Record<string,unknown>,job:Job):AgentContext{
 const base=initializeContext(job.run_id,job.invoice_id,'LIVE');
 const stored=(run.context&&typeof run.context==='object'?run.context:{}) as Partial<AgentContext>;
 const storedMetadata=stored.metadata??base.metadata;
 const context={...base,...stored,runId:job.run_id,invoiceId:job.invoice_id,mode:'LIVE' as const,state:String(run.current_state??stored.state??'RECEIVED') as AgentState,stepCount:Number(run.step_count??0),metadata:{...base.metadata,...storedMetadata,agentVersion:String(run.agent_version??AGENT_VERSION),startedAt:String(run.started_at??base.metadata.startedAt),executionModel:'DURABLE' as const}};
 if(context.policyDecision)context.policyDecision=context.policyDecision;
 return context;
}
function serializeContext(context:AgentContext){return JSON.parse(JSON.stringify(context)) as Record<string,unknown>}
