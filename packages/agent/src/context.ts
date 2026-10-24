import type {AgentContext,AgentExecutionMode} from './types';
import {AGENT_VERSION} from './types';
export function initializeContext(runId:string,invoiceId:string,mode:AgentExecutionMode):AgentContext{return {runId,invoiceId,mode,policyLoaded:false,actionsExecuted:[],warnings:[],metadata:{agentVersion:AGENT_VERSION,startedAt:new Date().toISOString()},stepCount:0,state:'RECEIVED'}}
