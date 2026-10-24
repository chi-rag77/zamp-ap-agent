import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed,invalid,validId} from '../../../../../lib/agent-api';
import {tenantCanAccess} from '../../../../../lib/tenant-database';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!allowed(request,true))return denied();const {id}=await params;if(!validId(id))return invalid();
  try{if(!await tenantCanAccess('notifications',id))return NextResponse.json({error:'Notification not found'},{status:404});const {data,error}=await createServerClient().from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).is('user_id',null).select('id').maybeSingle();if(error)throw error;if(!data)return NextResponse.json({error:'Notification not found'},{status:404});return NextResponse.json({read:true})}catch(error){return failed(error)}
}
