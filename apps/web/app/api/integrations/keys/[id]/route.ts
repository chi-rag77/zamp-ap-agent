import {hasTrustedOrigin} from '../../../../../lib/request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {objectContext,requireAdmin,WorkspaceError} from '../../../../../lib/objects';
import {validId} from '../../../../../lib/agent-api';

export const runtime='nodejs';
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  if(!hasTrustedOrigin(request))throw new WorkspaceError('Request origin is not allowed.',403);
  const {id}=await params;if(!validId(id))throw new WorkspaceError('Invalid API key ID.',400);
  const context=await objectContext();requireAdmin(context);
  const {data,error}=await createServerClient().from('integration_api_keys').update({revoked_at:new Date().toISOString()}).eq('organization_id',context.organizationId).eq('id',id).is('revoked_at',null).select('id').maybeSingle();
  if(error)throw new WorkspaceError('API key could not be revoked.',503);
  if(!data)throw new WorkspaceError('Active API key not found.',404);
  return NextResponse.json({revoked:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const status=error instanceof WorkspaceError?error.status:500;
  return NextResponse.json({error:status<500&&error instanceof Error?error.message:'API key could not be revoked.'},{status});
 }
}
