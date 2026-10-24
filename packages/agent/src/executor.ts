import {createServerClient} from '@zamp/database';
import type {AgentContext} from './types';
import {AgentError} from './errors';
import {actionKey,assertActionGuard} from './action-guard';
import {reviewPriority,reviewRoute} from './decisions';
import {audit} from './run-manager';
export async function executeFinancialAction(context:AgentContext,action:'APPROVE'|'REJECT'){
 assertActionGuard(context,action);await audit(context,'ACTION_REQUESTED',`${action} requested`,{decisionId:context.decisionId});
 const {data,error}=await createServerClient().rpc('execute_agent_action',{p_run_id:context.runId,p_decision_id:context.decisionId,p_action:action,p_key:actionKey(context,action)});
 if(error)throw new AgentError(/ACTION_NOT_ALLOWED|STALE_DECISION|DUPLICATE_ACTION/.exec(error.message)?.[0]??'ACTION_EXECUTION_FAILED',error.message);
 context.actionsExecuted.push(action);return data as Record<string,unknown>;
}
export async function executeReviewAction(context:AgentContext,reasonCode:string,summary:string){
 assertActionGuard(context,'CREATE_REVIEW');await audit(context,'ACTION_REQUESTED','Review requested',{reasonCode});
 const systemFailure=context.state==='CANNOT_DECIDE'&&context.policyDecision?.decision!=='CANNOT_DECIDE';
 const {data,error}=await createServerClient().rpc('execute_agent_review',{p_run_id:context.runId,p_decision_id:systemFailure?null:context.decisionId??null,p_key:actionKey(context,'CREATE_REVIEW'),p_reason:reasonCode,p_title:reasonCode.replaceAll('_',' '),p_summary:summary,p_priority:systemFailure?'HIGH':reviewPriority(context.policyDecision??'CANNOT_DECIDE'),p_team:reviewRoute(reasonCode),p_evidence:systemFailure?[]:context.policyDecision?.evidence??[]});
 if(error)throw new AgentError(/ACTION_NOT_ALLOWED|DUPLICATE_ACTION/.exec(error.message)?.[0]??'ACTION_EXECUTION_FAILED',error.message);
 context.actionsExecuted.push('CREATE_REVIEW');context.reviewCase=data as Record<string,unknown>;return data as Record<string,unknown>;
}
