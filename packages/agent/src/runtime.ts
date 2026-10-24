import {randomUUID} from 'node:crypto';
import {createServerClient} from '@zamp/database';
import {initializeContext} from './context';
import type {AgentContext,AgentExecutionMode,AgentRunResult,AgentState} from './types';
import {AGENT_VERSION} from './types';
import {agentDecision} from './decisions';
import {AgentError,errorCode} from './errors';
import {executeTool} from './tool-executor';
import {determineNextStep} from './planner';
import {setVersion,startAgentRun,transition} from './run-manager';

export interface RunOptions {mode?:AgentExecutionMode;runId?:string}
/** Live execution only creates a durable queue run. Simulation remains synchronous and side-effect free. */
export async function runAgent(invoiceId:string,options:RunOptions={}):Promise<AgentRunResult>{
 const mode=options.mode??'LIVE';
 if(mode==='LIVE'){
  const runId=options.runId??await startAgentRun(invoiceId);
  return {runId,invoiceId,status:'QUEUED',decision:'CANNOT_DECIDE',summary:'Agent run queued for durable background processing.',durationMs:0,stepCount:0,agentVersion:AGENT_VERSION,verificationStatus:'NOT_APPLICABLE'};
 }
 const context=initializeContext(randomUUID(),invoiceId,mode);
 try{
  await transition(context,'INITIALIZING');await transition(context,'LOADING_CONTEXT','getInvoice');
  const invoice=await executePlanned<Record<string,unknown>>(context,{invoiceId},'READ');
  if(invoice.archived_at||['APPROVED','REJECTED'].includes(String(invoice.status)))throw new AgentError('INVOICE_NOT_PROCESSABLE');
  if(invoice.current_extraction_id){const {data}=await createServerClient().from('invoice_extractions').select('model,provider').eq('id',invoice.current_extraction_id).maybeSingle();if(data){context.extraction=data;await setVersion(context,{extraction_version:`${data.provider}:${data.model}`})}}
  await transition(context,'VALIDATING','validateInvoice');await executePlanned(context,{invoiceId},'VALIDATION');
  await setVersion(context,{matching_engine_version:context.validation?.engineVersion});
  await transition(context,'EVALUATING_POLICY','evaluateInvoicePolicy');await executePlanned(context,{},'READ');await executePlanned(context,{invoiceId},'POLICY');
  await setVersion(context,{policy_version:context.policyDecision?.policyVersion??undefined});await transition(context,'DECISION_READY');
  const decision=context.policyDecision;if(!decision)throw new AgentError('POLICY_EVALUATION_FAILED');
  const action=decision.decision==='AUTO_APPROVE'?'APPROVE':decision.decision==='AUTO_REJECT'?'REJECT':'CREATE_REVIEW';
  const state:AgentState=decision.decision==='NEEDS_REVIEW'?'NEEDS_REVIEW':decision.decision==='CANNOT_DECIDE'?'CANNOT_DECIDE':'COMPLETED';
  if(state==='COMPLETED'){await transition(context,'ACTION_GUARD');await transition(context,'EXECUTING');await transition(context,'VERIFYING')}
  await transition(context,state);
  return result(context,state,decision.summary,decision.reasonCode,undefined,'NOT_APPLICABLE',{actionType:action,wouldExecute:false,reason:decision.summary,evidence:decision.evidence});
 }catch(error){
  const code=errorCode(error,context.state==='VALIDATING'?'VALIDATION_FAILED':context.state==='EVALUATING_POLICY'?'POLICY_EVALUATION_FAILED':'SYSTEM_ERROR');
  const cancelled=code==='CANCELLED';const reason=cancelled?'Agent run was cancelled.':`${code}: ${error instanceof Error?error.message:'Unknown error'}`;
  if(context.state!=='CANNOT_DECIDE'&&context.state!=='CANCELLED'){try{await transition(context,cancelled?'CANCELLED':'FAILED')}catch{context.state=cancelled?'CANCELLED':'FAILED'}}
  return result(context,cancelled?'CANCELLED':context.state==='CANNOT_DECIDE'?'CANNOT_DECIDE':'FAILED',reason,code,undefined,'NOT_APPLICABLE');
 }
}
async function executePlanned<T=unknown>(context:AgentContext,input:unknown,stepType:'READ'|'VALIDATION'|'POLICY'):Promise<T>{const step=determineNextStep(context);if(!step)throw new AgentError('MAX_ITERATIONS_EXCEEDED','No permitted next step');return executeTool<T>(context,step.tool,input,stepType)}
function result(context:AgentContext,status:AgentRunResult['status'],summary:string,reasonCode?:string,actionExecuted?:string,verificationStatus?:AgentRunResult['verificationStatus'],simulatedAction?:AgentRunResult['simulatedAction']):AgentRunResult{return {runId:context.runId,invoiceId:context.invoiceId,status,decision:status==='FAILED'||status==='CANCELLED'||status==='CANNOT_DECIDE'?'CANNOT_DECIDE':context.policyDecision?agentDecision(context.policyDecision.decision):'CANNOT_DECIDE',summary,reasonCode,durationMs:Date.now()-new Date(context.metadata.startedAt).getTime(),stepCount:context.stepCount,actionExecuted,verificationStatus,agentVersion:AGENT_VERSION,policyVersion:context.policyDecision?.policyVersion??undefined,matchingEngineVersion:context.validation?.engineVersion,extractionVersion:context.extraction?`${context.extraction.provider}:${context.extraction.model}`:undefined,simulatedAction}}
