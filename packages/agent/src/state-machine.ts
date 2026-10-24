import type {AgentState} from './types';
import {AgentError} from './errors';
const terminal=new Set<AgentState>(['COMPLETED','NEEDS_REVIEW','CANNOT_DECIDE','FAILED','CANCELLED']);
const transitions:Record<AgentState,AgentState[]>={RECEIVED:['INITIALIZING'],INITIALIZING:['LOADING_CONTEXT'],LOADING_CONTEXT:['EXTRACTING','RESOLVING_VENDOR','VALIDATING'],EXTRACTING:['RESOLVING_VENDOR','VALIDATING'],RESOLVING_VENDOR:['RESOLVING_PO','VALIDATING'],RESOLVING_PO:['VALIDATING'],VALIDATING:['EVALUATING_POLICY'],EVALUATING_POLICY:['DECISION_READY'],DECISION_READY:['ACTION_GUARD','NEEDS_REVIEW','CANNOT_DECIDE'],ACTION_GUARD:['EXECUTING','CANNOT_DECIDE'],EXECUTING:['VERIFYING','CANNOT_DECIDE'],VERIFYING:['COMPLETED','NEEDS_REVIEW','CANNOT_DECIDE'],COMPLETED:[],NEEDS_REVIEW:[],CANNOT_DECIDE:[],FAILED:[],CANCELLED:[]};
export function assertTransition(from:AgentState,to:AgentState){if(!terminal.has(from)&&(to==='FAILED'||to==='CANNOT_DECIDE'||to==='CANCELLED'))return;if(!transitions[from].includes(to))throw new AgentError('INVALID_STATE_TRANSITION',`${from} → ${to}`)}
export const isTerminal=(state:AgentState)=>terminal.has(state);
