import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{const db=createServerClient();const link=await db.from('agent_run_decisions').select('decision_id').eq('agent_run_id',runId).maybeSingle();if(link.error)throw link.error;if(!link.data)return NextResponse.json({decision:null});const {data,error}=await db.from('agent_decisions').select('id,invoice_id,decision,reason_code,summary,evidence,blockers,warnings,policy_version,created_at').eq('id',link.data.decision_id).single();if(error)throw error;return NextResponse.json({decision:data})}catch(error){return failed(error)}}
