import {hasTrustedOrigin} from '../../../../lib/request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@zamp/database';
import {objectContext,requireAdmin,WorkspaceError} from '../../../../lib/objects';
import {createIntegrationApiKey} from '../../../../../../packages/integrations/src/api-key';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const createSchema=z.object({name:z.string().trim().min(2).max(80)}).strict();
const availableModules=[
 {key:'invoice',label:'Invoices'},
 {key:'purchase_order',label:'Purchase orders'},
 {key:'goods_receipt',label:'Goods receipts'},
 {key:'vendor',label:'Vendors'},
 {key:'payment',label:'Payments'},
] as const;

function fail(error:unknown){
 const status=error instanceof WorkspaceError?error.status:500;
 return NextResponse.json({error:status<500&&error instanceof Error?error.message:'Integrations could not be loaded.'},{status});
}

export async function GET(){
 try{
  const context=await objectContext();requireAdmin(context);
  const service=createServerClient();
  const [keys,requests,mappings,integrations,vendors]=await Promise.all([
   service.from('integration_api_keys').select('id,name,key_prefix,created_by,created_at,last_used_at,revoked_at').eq('organization_id',context.organizationId).order('created_at',{ascending:false}).limit(100),
   service.from('integration_api_requests').select('id,api_key_id,method,path,status_code,duration_ms,created_at').eq('organization_id',context.organizationId).order('created_at',{ascending:false}).limit(100),
   service.from('integration_field_mappings').select('integration_id,object_type,source_field,target_field,direction,transformation,required').eq('organization_id',context.organizationId).limit(500),
   service.from('integrations').select('id,name,provider,status').eq('organization_id',context.organizationId).limit(100),
   service.from('vendors').select('id,vendor_code,display_name,currency').eq('organization_id',context.organizationId).eq('status','ACTIVE').is('archived_at',null).order('display_name').limit(100),
  ]);
  if(mappings.error||integrations.error||vendors.error)throw new WorkspaceError('Integration modules could not be loaded.',503);
  const integrationById=new Map((integrations.data??[]).map(integration=>[integration.id,integration]));
  const modules=availableModules.map(module=>{
   const moduleMappings=(mappings.data??[]).filter(mapping=>mapping.object_type===module.key);
   const integration=moduleMappings.map(mapping=>integrationById.get(mapping.integration_id)).find(Boolean)??null;
   return {key:module.key,label:module.label,integration:integration?{id:integration.id,name:integration.name,provider:integration.provider,status:integration.status}:null,mappings:moduleMappings.map(mapping=>({source_field:mapping.source_field,target_field:mapping.target_field,direction:mapping.direction,transformation:mapping.transformation,required:mapping.required}))};
  });
  const activeVendors=vendors.data??[];
  if(keys.error||requests.error)return NextResponse.json({keys:[],requests:[],modules,vendors:activeVendors,error:'API key storage is not ready yet. Apply the integrations API key migration, then retry.'},{headers:{'Cache-Control':'no-store'}});
  const names=new Map((keys.data??[]).map(key=>[key.id,key.name]));
  const counts=new Map<string,number>();for(const request of requests.data??[])if(request.api_key_id)counts.set(request.api_key_id,(counts.get(request.api_key_id)??0)+1);
  return NextResponse.json({keys:(keys.data??[]).map(({key_prefix,...key})=>({...key,prefix:key_prefix,request_count:counts.get(key.id)??0})),requests:(requests.data??[]).map(request=>({...request,key_name:request.api_key_id?names.get(request.api_key_id)??'Revoked key':'Unknown key'})),modules,vendors:activeVendors},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error)}
}

export async function POST(request:NextRequest){
 try{
  if(!hasTrustedOrigin(request))throw new WorkspaceError('Request origin is not allowed.',403);
  const context=await objectContext();requireAdmin(context);
  const body=createSchema.parse(await request.json());
  const {key,prefix,hash}=createIntegrationApiKey();
  const {error}=await createServerClient().from('integration_api_keys').insert({organization_id:context.organizationId,name:body.name,key_prefix:prefix,key_hash:hash,created_by:context.userId});
  if(error)throw new WorkspaceError('API key could not be created. Retry once; if it persists, check database availability.',503);
  return NextResponse.json({key,prefix},{status:201,headers:{'Cache-Control':'no-store','Pragma':'no-cache'}});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')},{status:400});
  return fail(error);
 }
}
