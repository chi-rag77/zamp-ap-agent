import {NextRequest,NextResponse} from 'next/server';
import {getRun} from '@zamp/agent';
import {allowed,denied,failed,invalid,validId} from '../../../../../lib/agent-api';
import {tenantCanAccess} from '../../../../../lib/tenant-database';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{if(!await tenantCanAccess('agent_runs',runId))return NextResponse.json({error:'Run not found'},{status:404});const run=await getRun(runId);return NextResponse.json({runId:run.id,invoiceId:run.invoice_id,status:run.status,currentState:run.current_state,currentStep:run.current_step,stepCount:run.step_count,decision:run.final_decision,summary:run.summary,reasonCode:run.reason_code,errorCode:run.error_code,durationMs:run.duration_ms,actionExecuted:run.action_executed,verificationStatus:run.verification_status,agentVersion:run.agent_version,policyVersion:run.policy_version,matchingEngineVersion:run.matching_engine_version,extractionVersion:run.extraction_version})}catch(error){return failed(error)}}
