import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{const {data,error}=await createServerClient().from('audit_events').select('id,event_type,description,metadata,actor_type,created_at').eq('agent_run_id',runId).order('created_at',{ascending:true}).limit(500);if(error)throw error;return NextResponse.json({events:data??[]})}catch(error){return failed(error)}}
