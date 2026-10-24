import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../../lib/tenant-database';
import {allowed,denied,failed,invalid,validId} from '../../../../../lib/agent-api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){if(!allowed(request))return denied();const {id}=await params;if(!validId(id))return invalid();try{const {data,error}=await (await createWebServerClient()).from('processing_events').select('id,sequence,event_type,invoice_id,run_id,step_name,status,message,metadata,created_at').eq('run_id',id).order('sequence',{ascending:true}).limit(500);if(error)throw error;return NextResponse.json({events:data??[]},{headers:{'Cache-Control':'no-store'}})}catch(error){return failed(error)}}
