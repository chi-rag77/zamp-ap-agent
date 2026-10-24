import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../lib/tenant-database';
import {allowed,denied,failed} from '../../../lib/agent-api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  if(!allowed(request))return denied();
  try{const {data,error}=await (await createWebServerClient()).from('notifications').select('id,type,title,message,invoice_id,run_id,read_at,created_at').is('user_id',null).order('created_at',{ascending:false}).limit(25);if(error)throw error;return NextResponse.json({notifications:data??[]},{headers:{'Cache-Control':'no-store'}})}catch(error){return failed(error)}
}
