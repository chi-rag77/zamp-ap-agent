import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{const {data,error}=await createServerClient().from('agent_actions').select('id,run_id,action_type,status,guard_result,result,error_code,requested_at,executed_at,verified_at').eq('run_id',runId).order('requested_at');if(error)throw error;return NextResponse.json({actions:data??[]})}catch(error){return failed(error)}}
