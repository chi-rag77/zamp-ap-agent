import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{const {data,error}=await createServerClient().from('processing_events').select('id,sequence,event_type,status,message,step_name,metadata,created_at').eq('run_id',runId).order('sequence',{ascending:true}).limit(500);if(error)throw error;return NextResponse.json({events:data??[]},{headers:{'Cache-Control':'no-store'}})}catch(error){return failed(error)}}
