import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,validId,invalid} from '../../../../lib/agent-api';
import {createTenantDatabase} from '../../../../lib/tenant-database';
import {workosAuthEnabled} from '../../../../lib/workos-auth';
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!allowed(request,true))return denied();const {id}=await params;if(!validId(id))return invalid();
 const organizationId=workosAuthEnabled()?(await createTenantDatabase()).organizationId:null;
 let query=createServerClient().from('integrations').update({status:'DISCONNECTED',credential_ref:null,last_tested_at:null,last_error:null}).eq('id',id);if(organizationId)query=query.eq('organization_id',organizationId);
 const {data,error}=await query.select('id').single();
 if(error||!data)return NextResponse.json({error:'Connection could not be disconnected'},{status:404});
 return NextResponse.json({disconnected:true});
}
