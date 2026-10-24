import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../lib/tenant-database';
import {allowed,denied,failed} from '../../../lib/agent-api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){if(!allowed(request))return denied();try{const status=request.nextUrl.searchParams.get('status');let query=(await createWebServerClient()).from('agent_runs').select('id,invoice_id,status,current_state,current_step,step_count,retry_count,final_decision,started_at,completed_at,duration_ms,error_code,error_class,agent_version,policy_version').order('created_at',{ascending:false}).limit(100);if(status&&['QUEUED','RUNNING','WAITING','COMPLETED','FAILED','CANCELLED'].includes(status))query=query.eq('status',status);const {data,error}=await query;if(error)throw error;return NextResponse.json({runs:data??[]},{headers:{'Cache-Control':'no-store'}})}catch(error){return failed(error)}}
