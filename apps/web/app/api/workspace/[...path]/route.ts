import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {objectContext,objectRecord,objectDetail,activeSchema,members,ensureMembers,requireAdmin,requireWriter,WorkspaceError,type ObjectContext} from '../../../../lib/objects';
import {objectTypeSchema,objectTypes,coreFields,tables,lineTables,configurationSchema,validateValues,compatibleSchema,type ObjectType,type ObjectConfiguration} from '../../../../../../packages/objects/src/schema';
import {importRequest} from '../../../../lib/object-imports';
import {applyMappings,type IntegrationMapping} from '../../../../../../packages/objects/src/mapping';
import {attachmentRequest} from '../../../../lib/object-attachments';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=z.string().uuid();
const documentBody=z.object({schemaId:uuid,revision:z.number().int().min(0),values:z.record(z.string(),z.unknown()),lines:z.record(z.string(),z.record(z.string(),z.unknown()))}).strict();
async function json(request:NextRequest){const text=await request.text();if(text.length>250000)throw new WorkspaceError('Request exceeds 250 KB.',413);try{return JSON.parse(text)}catch{throw new WorkspaceError('Invalid JSON')}}
async function run(request:NextRequest,paths:string[]){
 const write=request.method!=='GET';if(write&&request.headers.get('origin')!==request.nextUrl.origin)throw new WorkspaceError('Request origin is not allowed.',403);
 const c=await objectContext();if(write)requireWriter(c);
 const [area,typeOrId,id,action]=paths;
 if(area==='members')return {members:await members(c),userId:c.userId,role:c.role};
 if(area==='organization'){
  const org=await c.db.from('organizations').select('id,name,slug,status,plan').eq('id',c.organizationId).single();if(org.error)throw org.error;
  return {organization:org.data,role:c.role,members:await members(c),authentication:'WorkOS',tenantIsolation:true,features:{sso:'Managed in WorkOS',scim:'Requires a configured WorkOS directory connection'},api:{workspace:'/api/workspace',authentication:'Signed-in organization session'}};
 }
 if(area==='imports')return importRequest(c,request,typeOrId);
 if(area==='attachments')return attachmentRequest(c,request,typeOrId);
 if(area==='schemas'){
  const type=objectTypeSchema.parse(typeOrId);
  if(!write){const active=await activeSchema(c,type);const history=await c.db.from('object_schema_versions').select('id,version,change_summary,created_at,created_by').eq('organization_id',c.organizationId).eq('object_type',type).order('version',{ascending:false}).limit(50);if(history.error)throw history.error;return {active,history:history.data,canEdit:['ADMIN','OWNER'].includes(c.role)}}
  requireAdmin(c);const input=z.object({configuration:configurationSchema,expectedId:uuid.nullable(),summary:z.string().trim().min(1).max(250)}).parse(await json(request));if(input.configuration.object!==type)throw new WorkspaceError('Object type does not match.');
  const previous=await activeSchema(c,type);const errors=compatibleSchema(previous.configuration as ObjectConfiguration,input.configuration);if(errors.length)throw new WorkspaceError(errors.join('; '));
  const {data,error}=await c.db.rpc('publish_object_schema',{p_org:c.organizationId,p_type:type,p_config:input.configuration,p_actor:c.userId,p_summary:input.summary,p_expected:input.expectedId});if(error)throw new WorkspaceError(error.message.includes('Schema changed')?'Another admin published a change. Reload before publishing.':'Schema could not be published.',409);return {id:data};
 }
 if(area==='objects'){
  const type=objectTypeSchema.parse(typeOrId);
  if(!id)return listObjects(c,type,request);
  uuid.parse(id);const object=await objectRecord(c,type,id);
  if(!write)return objectDetail(c,type,id);
  if(action==='fields'){
   const input=documentBody.parse(await json(request));const s=await c.db.from('object_schema_versions').select('configuration').eq('organization_id',c.organizationId).eq('object_type',type).eq('id',input.schemaId).single();if(s.error)throw new WorkspaceError('Schema not found.');
   const schema=configurationSchema.parse(s.data.configuration);const line=lineTables[type];const lr=line?await c.db.from(line.table).select('id').eq('organization_id',c.organizationId).eq(line.parent,id):{data:[],error:null};if(lr.error)throw lr.error;
   const errors=validateValues(schema,input.values,input.lines,(lr.data??[]).map(l=>l.id));if(errors.length)throw new WorkspaceError(errors.join('; '));
   // References are identifiers, and must resolve inside the same organization.
   for(const f of schema.fields){const values=f.scope==='record'?[input.values[f.key]]:Object.values(input.lines).map(l=>l[f.key]);for(const value of values){if(!value)continue;if(objectTypes.includes(f.type as ObjectType)){await objectRecord(c,f.type as ObjectType,uuid.parse(value))}else if(f.type==='user'){await ensureMembers(c,[z.string().parse(value)])}else if(f.type==='organization'&&value!==c.organizationId)throw new WorkspaceError('Organization references must use the current organization.');else if(f.type==='file'){const file=await c.db.from('object_attachments').select('id').eq('organization_id',c.organizationId).eq('id',uuid.parse(value)).maybeSingle();if(file.error||!file.data)throw new WorkspaceError('File must belong to this organization.')}}}
   const prior=await c.db.from('object_field_values').select('schema_id').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).maybeSingle();if(prior.error)throw prior.error;
   if(prior.data&&prior.data.schema_id!==input.schemaId)throw new WorkspaceError('Existing records retain their saved schema version.',409);
   const payload={organization_id:c.organizationId,object_type:type,object_id:id,schema_id:input.schemaId,record_values:input.values,line_values:input.lines,revision:input.revision+1,updated_by:c.userId,updated_at:new Date().toISOString()};
   const result=input.revision===0?await c.db.from('object_field_values').insert(payload).select('revision').single():await c.db.from('object_field_values').update(payload).eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).eq('revision',input.revision).select('revision').single();if(result.error)throw new WorkspaceError('Fields changed in another session. Reload before saving.',409);return result.data;
  }
  if(action==='messages'){
   const input=z.object({body:z.string().trim().min(1).max(10000),parentId:uuid.nullable().optional(),mentions:z.array(z.string()).max(20).default([])}).parse(await json(request));await ensureMembers(c,input.mentions);
   if(input.parentId){const p=await c.db.from('object_messages').select('id').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).eq('id',input.parentId).is('parent_id',null).single();if(p.error)throw new WorkspaceError('Reply thread was not found.');}
   const {data,error}=await c.db.from('object_messages').insert({organization_id:c.organizationId,object_type:type,object_id:id,parent_id:input.parentId,body:input.body,mentions:input.mentions,created_by:c.userId,author_name:c.name}).select('id').single();if(error)throw error;
   return data;
  }
  if(action==='message'){
   const input=z.object({messageId:uuid,body:z.string().trim().min(1).max(10000).optional(),resolved:z.boolean().optional(),reaction:z.enum(['👍','✅','👀']).optional()}).parse(await json(request));
   const {data:m,error}=await c.db.from('object_messages').select('*').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).eq('id',input.messageId).single();if(error||!m)throw new WorkspaceError('Message not found.',404);
   if(input.reaction){const {error}=await c.db.from('object_reactions').upsert({organization_id:c.organizationId,object_type:type,object_id:id,message_id:m.id,created_by:c.userId,emoji:input.reaction},{onConflict:'message_id,created_by,emoji'});if(error)throw error;return {ok:true}}
   if(m.created_by!==c.userId&&!['ADMIN','OWNER'].includes(c.role))throw new WorkspaceError('Only the author or an admin can change this discussion.',403);
   if(input.body&&m.created_by!==c.userId)throw new WorkspaceError('Only the author can edit a comment.',403);
   const updated=await c.db.from('object_messages').update({...input.body?{body:input.body,edited_at:new Date().toISOString()}:{},...input.resolved!==undefined?{resolved_at:input.resolved?new Date().toISOString():null}:{}}).eq('organization_id',c.organizationId).eq('id',m.id);if(updated.error)throw updated.error;
   return {ok:true};
  }
  if(action==='assign'){
   const input=z.object({assignee:z.string().nullable(),waiting_on:z.string().nullable(),reason:z.string().max(500),due_date:z.string().date().nullable(),tags:z.array(z.string().trim().min(1).max(40)).max(20)}).parse(await json(request));await ensureMembers(c,[input.assignee,input.waiting_on].filter((v):v is string=>!!v));
   const {error}=await c.db.from('object_assignments').upsert({...input,organization_id:c.organizationId,object_type:type,object_id:id,updated_by:c.userId,updated_at:new Date().toISOString()});if(error)throw error;
   return {ok:true};
  }
  void object;
 }
 if(area==='views'){
  const type=objectTypeSchema.parse(typeOrId);
  if(!write){const r=await c.db.from('object_saved_views').select('id,name,configuration').eq('organization_id',c.organizationId).eq('created_by',c.userId).eq('object_type',type);if(r.error)throw r.error;return {views:r.data}}
  const input=z.object({name:z.string().trim().min(1).max(80),configuration:z.object({query:z.string().max(100),status:z.string().max(50),sort:z.string().max(50),descending:z.boolean(),columns:z.array(z.string()).max(30)})}).parse(await json(request));const r=await c.db.from('object_saved_views').upsert({...input,organization_id:c.organizationId,object_type:type,created_by:c.userId},{onConflict:'organization_id,object_type,created_by,name'});if(r.error)throw r.error;return {ok:true};
 }
 if(area==='notifications'){
  if(write){uuid.parse(typeOrId);const r=await c.db.from('object_notifications').update({read_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('recipient',c.userId).eq('id',typeOrId);if(r.error)throw r.error;return {ok:true}}
  const r=await c.db.from('object_notifications').select('*').eq('organization_id',c.organizationId).eq('recipient',c.userId).order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;return {notifications:r.data};
 }
 if(area==='my-work'){
  const [assigned,notices,reviews,imports,runs]=await Promise.all([
   c.db.from('object_assignments').select('*').eq('organization_id',c.organizationId).or(`assignee.eq.${c.userId},waiting_on.eq.${c.userId}`).order('updated_at',{ascending:false}).limit(100),
   c.db.from('object_notifications').select('*').eq('organization_id',c.organizationId).eq('recipient',c.userId).is('read_at',null).limit(50),
   c.db.from('review_cases').select('id,invoice_id,status,created_at').eq('organization_id',c.organizationId).eq('status','OPEN').limit(50),
   c.db.from('data_import_jobs').select('id,filename,status,created_at').eq('organization_id',c.organizationId).eq('created_by',c.userId).order('created_at',{ascending:false}).limit(20),
   c.db.from('agent_runs').select('id,invoice_id,status,created_at').eq('organization_id',c.organizationId).eq('status','FAILED').order('created_at',{ascending:false}).limit(20),
  ]);if([assigned,notices,reviews,imports,runs].some(r=>r.error))throw new WorkspaceError('My Work could not be loaded.',503);return {assigned:assigned.data,notifications:notices.data,reviews:reviews.data,imports:imports.data,runs:runs.data,userId:c.userId};
 }
 if(area==='search'){
  const q=(request.nextUrl.searchParams.get('q')??'').trim();if(q.length<2)return {results:[]};if(q.length>100)throw new WorkspaceError('Search is too long.');
  const results=await Promise.all(objectTypes.map(async type=>{const r=await listObjects(c,type,request);return r.items.map(row=>({type,id:row.id,label:String(row.invoice_number??row.po_number??row.grn_number??row.display_name??row.payment_number??row.id),status:row.status}))}));return {results:results.flat().slice(0,40)};
 }
 if(area==='mapping-preview'){
  if(!write)throw new WorkspaceError('Use POST.',405);requireAdmin(c);const input=z.object({integrationId:uuid,type:objectTypeSchema,direction:z.enum(['INBOUND','OUTBOUND']),sample:z.record(z.string(),z.unknown())}).parse(await json(request));
  const mappings=await c.db.from('integration_field_mappings').select('source_field,target_field,transformation,required').eq('organization_id',c.organizationId).eq('integration_id',input.integrationId).eq('object_type',input.type).eq('direction',input.direction);if(mappings.error)throw mappings.error;return applyMappings(input.sample,mappings.data as IntegrationMapping[]);
 }
 if(area==='mappings'){
  if(!write){const [maps,integrations]=await Promise.all([c.db.from('integration_field_mappings').select('*').eq('organization_id',c.organizationId).limit(200),c.db.from('integrations').select('id,name,status').eq('organization_id',c.organizationId).limit(100)]);if(maps.error||integrations.error)throw new WorkspaceError('Mappings could not be loaded.',503);return {mappings:maps.data,integrations:integrations.data}}
  requireAdmin(c);const input=z.object({integration_id:uuid,object_type:objectTypeSchema,source_field:z.string().min(1).max(100),target_field:z.string().min(1).max(100),direction:z.enum(['INBOUND','OUTBOUND']),transformation:z.enum(['NONE','TRIM','UPPERCASE','LOWERCASE']),required:z.boolean()}).parse(await json(request));
  const config=await activeSchema(c,input.object_type);const canonical=input.direction==='INBOUND'?input.target_field:input.source_field;if(![...coreFields[input.object_type],...(config.configuration as ObjectConfiguration).fields.filter(f=>f.scope==='record').map(f=>`custom.${f.key}`)].includes(canonical))throw new WorkspaceError('Choose a valid canonical field.');
  const integration=await c.db.from('integrations').select('id').eq('organization_id',c.organizationId).eq('id',input.integration_id).single();if(integration.error)throw new WorkspaceError('Integration is not in this organization.');const r=await c.db.from('integration_field_mappings').upsert({...input,organization_id:c.organizationId,created_by:c.userId},{onConflict:'integration_id,object_type,source_field,direction'});if(r.error)throw r.error;return {ok:true};
 }
 throw new WorkspaceError('Workspace action not found.',404);
}
async function listObjects(c:ObjectContext,type:ObjectType,request:NextRequest){
 const params=request.nextUrl.searchParams;const page=Math.max(0,Math.min(10000,Number(params.get('page'))||0));const q=(params.get('q')??'').replace(/[%_,().]/g,' ').trim().slice(0,100);
 const columns:Record<ObjectType,string[]>={invoice:['invoice_number'],purchase_order:['po_number'],goods_receipt:['grn_number'],vendor:['display_name','legal_name','gstin','vendor_code'],payment:['payment_number']};
 let query=c.db.from(tables[type]).select('*',{count:'exact'}).eq('organization_id',c.organizationId);
 if(q){if(uuid.safeParse(q).success)query=query.eq('id',q);else query=query.or(columns[type].map(col=>`${col}.ilike.%${q}%`).join(','));}
 const status=params.get('status');if(status)query=query.eq('status',status);
 const key=params.get('field'),value=params.get('value');if(key&&value!==null){const schema=await activeSchema(c,type);if(!(schema.configuration as ObjectConfiguration).fields.some(f=>f.key===key&&f.scope==='record'&&f.filterable))throw new WorkspaceError('This field is not filterable.');const ids=await c.db.from('object_field_values').select('object_id').eq('organization_id',c.organizationId).eq('object_type',type).eq(`record_values->>${key}`,value).limit(1000);if(ids.error)throw ids.error;query=query.in('id',(ids.data??[]).map(r=>r.object_id));}
 const sort=params.get('sort')??'created_at';const allowed=['created_at','status',...columns[type],...(type==='invoice'||type==='purchase_order'?['total']:[])];
 const r=await query.order(allowed.includes(sort)?sort:'created_at',{ascending:params.get('descending')==='false'}).range(page*50,page*50+49);if(r.error)throw new WorkspaceError('Objects could not be loaded.',503);return {items:(r.data??[]) as Record<string,unknown>[],count:r.count??0,page};
}
async function handler(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){try{const result=await run(request,(await params).path);return result instanceof Response?result:NextResponse.json(result,{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:400});if(error instanceof WorkspaceError)return NextResponse.json({error:error.message},{status:error.status});console.error('Workspace request failed',error instanceof Error?error.message:'Database error');return NextResponse.json({error:'The request could not be completed. Retry or contact your workspace admin.'},{status:503})}}
export const GET=handler;export const POST=handler;export const PATCH=handler;
