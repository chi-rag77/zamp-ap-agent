import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{const {data,error}=await createServerClient().from('agent_run_steps').select('id,run_id,step_number,step_type,name,tool_name,status,input,output,duration_ms,error_code,started_at,completed_at').eq('run_id',runId).order('step_number');if(error)throw error;return NextResponse.json({steps:data??[]})}catch(error){return failed(error)}}
