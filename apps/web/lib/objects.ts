import 'server-only';
import {withAuth} from '@workos-inc/authkit-nextjs';
import {createServerClient} from '@zamp/database';
import {createTenantDatabase} from './tenant-database';
import {workosAuthConfigured} from './workos-auth';
import {canConfigure,canWrite,emptyConfiguration,lineTables,tables,type ObjectType} from '../../../packages/objects/src/schema';
export class WorkspaceError extends Error {constructor(message:string,public status=400){super(message)}}
export async function objectContext(){
 if(workosAuthConfigured()){
  let auth:Awaited<ReturnType<typeof withAuth>>;
  try{auth=await withAuth()}catch{if(process.env.NODE_ENV==='production')throw new WorkspaceError('Your organization session could not be verified. Sign in again.',401);auth=null as never}
  if(auth?.user){if(!auth.organizationId)throw new WorkspaceError('Choose an organization to continue.',403);
  let tenant;try{tenant=await createTenantDatabase(auth)}catch(error){if(error instanceof Error&&error.message.includes('membership in this organization is suspended'))throw new WorkspaceError(error.message,403);throw error}
  const db=createServerClient();
  const {data,error}=await db.from('organization_memberships').select('role,email').eq('organization_id',tenant.organizationId).eq('workos_user_id',auth.user.id).eq('status','ACTIVE').single();
  if(error||!data)throw new WorkspaceError('Active organization membership required.',403);
  return {db,organizationId:tenant.organizationId,userId:auth.user.id,name:[auth.user.firstName,auth.user.lastName].filter(Boolean).join(' ')||auth.user.email,role:data.role as string};
  }
 }
 if(process.env.NODE_ENV==='production')throw new WorkspaceError('Sign in to your organization to continue.',401);
 const db=createServerClient();
 const {data,error}=await db.from('organizations').select('id').eq('workos_organization_id','org_01M5Q9NAY3G32HHD27FTJ8TGSG').single();
 if(error||!data)throw new WorkspaceError('Local organization is not configured.',503);
 return {db,organizationId:data.id as string,userId:'local-admin',name:'Local administrator',role:'ADMIN'};
}
export type ObjectContext=Awaited<ReturnType<typeof objectContext>>;
export function requireAdmin(c:ObjectContext){if(!canConfigure(c.role))throw new WorkspaceError('Only organization admins can change configuration.',403)}
export function requireWriter(c:ObjectContext){if(!canWrite(c.role))throw new WorkspaceError('Your role has read-only access.',403)}
export async function objectRecord(c:ObjectContext,type:ObjectType,id:string){
 const {data,error}=await c.db.from(tables[type]).select('*').eq('organization_id',c.organizationId).eq('id',id).maybeSingle();
 if(error)throw new WorkspaceError('The object could not be loaded.',503);if(!data)throw new WorkspaceError('Object not found in your organization.',404);return data as Record<string,unknown> & {id:string};
}
export async function activeSchema(c:ObjectContext,type:ObjectType){
 const {data,error}=await c.db.from('object_schema_versions').select('id,version,configuration,created_at,change_summary').eq('organization_id',c.organizationId).eq('object_type',type).order('version',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new WorkspaceError('Data Model is unavailable. Check that the workspace migration is installed.',503);
 return data??{id:null,version:0,configuration:emptyConfiguration(type),change_summary:'No custom configuration published',created_at:null};
}
export async function members(c:ObjectContext){const {data,error}=await c.db.from('organization_memberships').select('workos_user_id,email,role').eq('organization_id',c.organizationId).eq('status','ACTIVE').limit(200);if(error)throw new WorkspaceError('Members could not be loaded.',503);return data??[]}
export async function ensureMembers(c:ObjectContext,ids:string[]){const allowed=new Set((await members(c)).map(m=>m.workos_user_id));if(ids.some(id=>!allowed.has(id)))throw new WorkspaceError('Select active members of this organization.')}
export async function objectDetail(c:ObjectContext,type:ObjectType,id:string){
 const object=await objectRecord(c,type,id);const line=lineTables[type];
 const result=await Promise.all([
  line?c.db.from(line.table).select('*').eq('organization_id',c.organizationId).eq(line.parent,id).limit(500):Promise.resolve({data:[],error:null}),
  c.db.from('object_field_values').select('*').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).maybeSingle(),
  c.db.from('object_messages').select('*').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).order('created_at').limit(200),
  c.db.from('object_assignments').select('*').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).maybeSingle(),
  c.db.from('object_attachments').select('id,filename,mime_type,size_bytes,created_at,message_id,created_by').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).order('created_at',{ascending:false}).limit(100),
  c.db.from('audit_events').select('id,event_type,description,created_at,actor_id,metadata').eq('organization_id',c.organizationId).contains('metadata',{objectType:type,objectId:id}).order('created_at',{ascending:false}).limit(50),
  c.db.from('object_reactions').select('id,message_id,emoji,created_by').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).limit(500),
 ]);
 if(result.some(r=>r.error))throw new WorkspaceError('Object workspace could not be loaded. Retry or check the workspace migration.',503);
 const [lines,values,messages,assignment,attachments,activity,reactions]=result;
 const schema=values.data?.schema_id?await c.db.from('object_schema_versions').select('id,version,configuration').eq('organization_id',c.organizationId).eq('id',values.data.schema_id).single():{data:await activeSchema(c,type),error:null};
 if(schema.error)throw new WorkspaceError('The saved schema version could not be loaded.',503);
 const related:{type:ObjectType;id:string;label:string;status:string}[]=[];
 const add=async(t:ObjectType,column:string,value:unknown)=>{if(!value)return;const r=await c.db.from(tables[t]).select('*').eq('organization_id',c.organizationId).eq(column,value).limit(30);if(r.error)throw new WorkspaceError('Relationships could not be loaded.',503);for(const row of r.data??[])related.push({type:t,id:row.id,label:String(row.invoice_number??row.po_number??row.grn_number??row.display_name??row.payment_number??row.id),status:row.status})};
 await Promise.all([add('vendor','id',object.vendor_id),add('purchase_order','id',object.po_id),add('invoice','id',object.invoice_id),...(type==='vendor'?[add('invoice','vendor_id',id),add('purchase_order','vendor_id',id),add('goods_receipt','vendor_id',id),add('payment','vendor_id',id)]:[]),...(type==='purchase_order'?[add('invoice','po_id',id),add('goods_receipt','po_id',id)]:[]),...(type==='invoice'?[add('payment','invoice_id',id),add('goods_receipt','po_id',object.po_id)]:[])]);
 let evidence:Record<string,unknown>={};
 if(type==='invoice'){
  const [extraction,validation,decision,events,documents,runs]=await Promise.all([
   c.db.from('invoice_extractions').select('id,status,normalized_output,overall_confidence,model,prompt_version,schema_version,created_at').eq('organization_id',c.organizationId).eq('invoice_id',id).order('created_at',{ascending:false}).limit(1),
   c.db.from('invoice_validation_runs').select('id,status,result,created_at').eq('organization_id',c.organizationId).eq('invoice_id',id).order('created_at',{ascending:false}).limit(1),
   c.db.from('agent_decisions').select('id,decision,summary,policy_version,evidence,blockers,warnings,created_at').eq('organization_id',c.organizationId).eq('invoice_id',id).order('created_at',{ascending:false}).limit(1),
   c.db.from('audit_events').select('id,event_type,description,created_at,actor_id').eq('organization_id',c.organizationId).eq('invoice_id',id).order('created_at',{ascending:false}).limit(50),
   c.db.from('invoice_documents').select('id,filename,mime_type,size_bytes').eq('organization_id',c.organizationId).eq('invoice_id',id).limit(10),
   c.db.from('agent_runs').select('id,status,agent_version,created_at').eq('organization_id',c.organizationId).eq('invoice_id',id).order('created_at',{ascending:false}).limit(5),
  ]);
  if([extraction,validation,decision,events,documents,runs].some(r=>r.error))throw new WorkspaceError('Invoice evidence could not be loaded.',503);
  evidence={extraction:extraction.data?.[0],validation:validation.data?.[0],decision:decision.data?.[0],events:events.data,documents:documents.data,runs:runs.data};
 }
 return {object,type,lines:lines.data??[],fields:values.data,schema:schema.data,messages:messages.data??[],assignment:assignment.data,attachments:attachments.data??[],activity:activity.data??[],reactions:reactions.data??[],related,evidence,userId:c.userId,canEdit:canWrite(c.role),canConfigure:canConfigure(c.role)};
}
