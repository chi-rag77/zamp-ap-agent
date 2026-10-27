import type {InvoiceValidationResult} from '@zamp/matching';
import type {InvoicePolicy,PolicyDecision} from '@zamp/policy';
export const AGENT_VERSION='1.0.0';
export const MAX_AGENT_STEPS=20;
export const MAX_AGENT_RUNTIME_MS=120000;
export type AgentExecutionMode='LIVE'|'SIMULATION';
export type AgentState='RECEIVED'|'INITIALIZING'|'LOADING_CONTEXT'|'EXTRACTING'|'RESOLVING_VENDOR'|'RESOLVING_PO'|'VALIDATING'|'EVALUATING_POLICY'|'DECISION_READY'|'ACTION_GUARD'|'EXECUTING'|'VERIFYING'|'COMPLETED'|'NEEDS_REVIEW'|'CANNOT_DECIDE'|'FAILED'|'CANCELLED';
export type AgentDecision='AUTO_APPROVED'|'AUTO_REJECTED'|'NEEDS_REVIEW'|'CANNOT_DECIDE'|'PENDING_APPROVAL';
export type AgentRunStatus='QUEUED'|'RUNNING'|'WAITING'|'COMPLETED'|'FAILED'|'CANCELLED'|'NEEDS_REVIEW'|'CANNOT_DECIDE';
export interface AgentRunResult {runId:string;invoiceId:string;status:AgentRunStatus;decision:AgentDecision;summary:string;reasonCode?:string;durationMs:number;stepCount:number;actionExecuted?:string;verificationStatus?:'VERIFIED'|'FAILED'|'NOT_APPLICABLE';agentVersion:string;policyVersion?:string;matchingEngineVersion?:string;extractionVersion?:string;simulatedAction?:{actionType:string;wouldExecute:boolean;reason:string;evidence:unknown[]}}
export interface AgentContext {runId:string;invoiceId:string;mode:AgentExecutionMode;invoice?:Record<string,unknown>;extraction?:Record<string,unknown>;vendor?:Record<string,unknown>;purchaseOrder?:Record<string,unknown>;goodsReceipts?:Record<string,unknown>[];validation?:InvoiceValidationResult;policy?:InvoicePolicy;policyLoaded:boolean;policyDecision?:PolicyDecision;decisionId?:string;reviewCase?:Record<string,unknown>;actionsExecuted:string[];warnings:string[];metadata:{agentVersion:string;startedAt:string;executionModel?:'DURABLE'|'SINGLE'};stepCount:number;state:AgentState}
export interface AgentPlanStep {stepId:string;sequence:number;type:'READ'|'COMPUTE'|'DECISION'|'ACTION'|'VERIFY';tool:string;reason:string;status:'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'|'SKIPPED'}
