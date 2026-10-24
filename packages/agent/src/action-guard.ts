import type {AgentContext} from './types';
import {AgentError} from './errors';
export function assertActionGuard(context:AgentContext,action:'APPROVE'|'REJECT'|'CREATE_REVIEW'){
 if(context.mode!=='LIVE'||!context.invoice||(context.state!=='EXECUTING'&&!(action==='CREATE_REVIEW'&&context.state==='CANNOT_DECIDE')))throw new AgentError('ACTION_NOT_ALLOWED');
 if(action==='APPROVE'&&context.policyDecision?.decision!=='AUTO_APPROVE')throw new AgentError('ACTION_NOT_ALLOWED');
 if(action==='REJECT'&&context.policyDecision?.decision!=='AUTO_REJECT')throw new AgentError('ACTION_NOT_ALLOWED');
 if(action==='CREATE_REVIEW'&&context.state!=='CANNOT_DECIDE'&&context.policyDecision&&!['NEEDS_REVIEW','CANNOT_DECIDE'].includes(context.policyDecision.decision))throw new AgentError('ACTION_NOT_ALLOWED');
 if(action!=='CREATE_REVIEW'&&(!context.decisionId||!context.validation||!context.policy||!context.policyDecision?.evidence.length))throw new AgentError('ACTION_NOT_ALLOWED');
}
export function actionKey(context:AgentContext,action:'APPROVE'|'REJECT'|'CREATE_REVIEW'){return `${action.toLowerCase()}:${context.invoiceId}:${context.runId}`}
