import {hasTrustedOrigin} from '../../../../lib/request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {objectContext,objectRecord,objectDetail,activeSchema,members,ensureMembers,requireAdmin,requireWriter,WorkspaceError,type ObjectContext} from '../../../../lib/objects';
import {objectTypeSchema,objectTypes,coreFields,tables,lineTables,configurationSchema,validateValues,compatibleSchema,type ObjectType,type ObjectConfiguration} from '../../../../../../packages/objects/src/schema';
import {importRequest} from '../../../../lib/object-imports';
import {applyMappings,type IntegrationMapping} from '../../../../../../packages/objects/src/mapping';
import {attachmentRequest} from '../../../../lib/object-attachments';
import {sendWorkspaceActionEmails} from '../../../../lib/resend-notifications';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=z.string().uuid();
const documentBody=z.object({schemaId:uuid,revision:z.number().int().min(0),values:z.record(z.string(),z.unknown()),lines:z.record(z.string(),z.record(z.string(),z.unknown()))}).strict();
async function json(request:NextRequest){const text=await request.text();if(text.length>250000)throw new WorkspaceError('Request exceeds 250 KB.',413);try{return JSON.parse(text)}catch{throw new WorkspaceError('Invalid JSON')}}
async function run(request:NextRequest,paths:string[]){
 const write=request.method!=='GET';if(write&&!hasTrustedOrigin(request))throw new WorkspaceError('Request origin is not allowed.',403);
 const c=await objectContext();if(write)requireWriter(c);
 const [area,typeOrId,id,action]=paths;
 if(area==='members')return {members:await members(c),userId:c.userId,role:c.role};
 if(area==='organization'){
  if(write){requireAdmin(c);const input=z.object({settings:z.object({logo_data_url:z.string().max(220000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/).nullable(),time_zone:z.string().min(1).max(100),date_format:z.enum(['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD']),clock_format:z.enum(['12-hour','24-hour']),number_locale:z.enum(['en-GB','en-US','en-IN']),number_format:z.enum(['western','indian']),currency:z.string().regex(/^[A-Z]{3}$/),language:z.enum(['en','hi','fr','de','es']),decimal_precision:z.object({price:z.number().int().min(0).max(6),number:z.number().int().min(0).max(6),percentage:z.number().int().min(0).max(6)}),exchange_source:z.enum(['open_exchange_rates','manual']),allow_free_text_items:z.boolean(),email_approvals:z.boolean(),show_item_specifications:z.boolean()}).strict()}).strict().parse(await json(request));const saved=await c.db.from('organizations').update({settings:input.settings,updated_at:new Date().toISOString()}).eq('id',c.organizationId).select('id,name,slug,status,plan,settings,updated_at').single();if(saved.error)throw new WorkspaceError('Organization settings could not be saved.',503);return {organization:saved.data,role:c.role,saved:true}}
  const org=await c.db.from('organizations').select('id,name,slug,status,plan,settings,updated_at').eq('id',c.organizationId).single();if(org.error)throw org.error;
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
  if(type==='invoice'&&action==='document'){
   const party=z.object({name:z.string().trim().max(300),address:z.string().trim().max(1200),tax_id:z.string().trim().max(80)}).strict();
   const input=z.object({expectedUpdatedAt:z.string().refine(value=>Number.isFinite(Date.parse(value)),{message:'Invalid ISO datetime'}),invoice:z.object({invoice_number:z.string().trim().min(1).max(120),invoice_date:z.string().date().nullable(),due_date:z.string().date().nullable(),currency:z.string().regex(/^[A-Z]{3}$/),subtotal:z.number().finite().nonnegative().max(1e12).nullable(),tax:z.number().finite().nonnegative().max(1e12).nullable(),total:z.number().finite().nonnegative().max(1e12).nullable(),vendor_id:uuid.nullable(),po_id:uuid.nullable(),bill_to:party,ship_to:party}),lines:z.array(z.object({id:uuid,sku:z.string().trim().max(120).nullable(),description:z.string().trim().min(1).max(1000),quantity:z.number().finite().positive().max(1e9),unit_price:z.number().finite().nonnegative().max(1e12),amount:z.number().finite().nonnegative().max(1e12)})).max(500)}).strict().parse(await json(request));
   if(input.invoice.vendor_id)await objectRecord(c,'vendor',input.invoice.vendor_id);
   if(input.invoice.po_id){const po=await objectRecord(c,'purchase_order',input.invoice.po_id);if(input.invoice.vendor_id&&po.vendor_id!==input.invoice.vendor_id)throw new WorkspaceError('The selected purchase order belongs to a different vendor. Choose the matching vendor or purchase order.',409)}
   if(['APPROVED','AUTO_APPROVED','REJECTED','AUTO_REJECTED','PAID'].includes(String(object.status)))throw new WorkspaceError('A completed invoice is locked. Reopen it through the review workflow before editing.',409);
   if(object.status==='PENDING_APPROVAL')throw new WorkspaceError('This invoice is awaiting approval. Cancel its approval request before editing the document.',409);
   const currentLines=await c.db.from('invoice_lines').select('id').eq('organization_id',c.organizationId).eq('invoice_id',id);if(currentLines.error)throw currentLines.error;
   const known=new Set((currentLines.data??[]).map(line=>line.id));if(input.lines.length!==known.size||input.lines.some(line=>!known.has(line.id)))throw new WorkspaceError('Invoice lines changed in another session. Reload before saving.',409);
   const current=await c.db.from('invoices').select('updated_at,bill_to,ship_to,po_id,vendor_id').eq('organization_id',c.organizationId).eq('id',id).single();if(current.error||current.data.updated_at!==input.expectedUpdatedAt)throw new WorkspaceError('This invoice changed in another session. Reload before saving.',409);
   const before={invoice:object,parties:{bill_to:current.data.bill_to,ship_to:current.data.ship_to,po_id:current.data.po_id},lines:currentLines.data};
   const updated=await c.db.from('invoices').update({...input.invoice,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('id',id).eq('updated_at',input.expectedUpdatedAt).select('updated_at').maybeSingle();if(updated.error)throw updated.error;if(!updated.data)throw new WorkspaceError('This invoice changed in another session. Reload before saving.',409);
   for(const line of input.lines){const result=await c.db.from('invoice_lines').update({sku:line.sku,description:line.description,quantity:line.quantity,unit_price:line.unit_price,amount:line.amount,updated_at:new Date().toISOString()}).eq('organization_id',c.organizationId).eq('invoice_id',id).eq('id',line.id);if(result.error)throw new WorkspaceError('Invoice details were saved, but a line item could not be updated. Reload the invoice and check its saved values.',503)}
   const audit=await c.db.from('audit_events').insert({organization_id:c.organizationId,invoice_id:id,actor_type:'HUMAN',actor_id:c.userId,event_type:'INVOICE_DOCUMENT_EDITED',description:'Invoice document fields edited by an organization member',metadata:{before,after:{invoice:input.invoice,lines:input.lines}}});if(audit.error)throw new WorkspaceError('Invoice changes were saved, but the audit event could not be recorded. Contact your organization admin.',503);
   return {updatedAt:updated.data.updated_at,validationRequired:true};
  }
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
   let parentAuthor:string|null=null;if(input.parentId){const p=await c.db.from('object_messages').select('id,created_by').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',id).eq('id',input.parentId).is('parent_id',null).single();if(p.error)throw new WorkspaceError('Reply thread was not found.');parentAuthor=p.data.created_by;}
   const {data,error}=await c.db.from('object_messages').insert({organization_id:c.organizationId,object_type:type,object_id:id,parent_id:input.parentId,body:input.body,mentions:input.mentions,created_by:c.userId,author_name:c.name}).select('id').single();if(error)throw error;
   await sendWorkspaceActionEmails({db:c.db,organizationId:c.organizationId,actorId:c.userId,recipientIds:[...input.mentions,...(parentAuthor?[parentAuthor]:[])],objectType:type,objectId:id,eventId:data.id,title:input.parentId?'Discussion updated':'You were mentioned',message:input.body.slice(0,500)});
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
   const assignmentAt=new Date().toISOString();
   await sendWorkspaceActionEmails({db:c.db,organizationId:c.organizationId,actorId:c.userId,recipientIds:[input.assignee,input.waiting_on].filter((value):value is string=>!!value),objectType:type,objectId:id,eventId:assignmentAt,title:'Work assigned to you',message:input.reason||'A record requires your attention.'});
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
  const [assigned,notices,reviews,imports,runs,approvalRequests,member]=await Promise.all([
   c.db.from('object_assignments').select('*').eq('organization_id',c.organizationId).or(`assignee.eq.${c.userId},waiting_on.eq.${c.userId}`).order('updated_at',{ascending:false}).limit(100),
   c.db.from('object_notifications').select('*').eq('organization_id',c.organizationId).eq('recipient',c.userId).is('read_at',null).limit(50),
   c.db.from('review_cases').select('id,invoice_id,status,created_at').eq('organization_id',c.organizationId).eq('status','OPEN').limit(50),
   c.db.from('data_import_jobs').select('id,filename,status,created_at').eq('organization_id',c.organizationId).eq('created_by',c.userId).order('created_at',{ascending:false}).limit(20),
   c.db.from('agent_runs').select('id,invoice_id,status,created_at').eq('organization_id',c.organizationId).eq('status','FAILED').order('created_at',{ascending:false}).limit(20),
   c.db.from('approval_requests').select('id,invoice_id,rule_name,status,current_step,requested_at,due_at,requested_by,evidence,invoice_updated_at').eq('organization_id',c.organizationId).eq('status','PENDING').order('requested_at',{ascending:false}).limit(100),
   c.db.from('organization_memberships').select('role').eq('organization_id',c.organizationId).eq('workos_user_id',c.userId).eq('status','ACTIVE').single(),
  ]);if([assigned,notices,reviews,imports,runs,approvalRequests,member].some(r=>r.error))throw new WorkspaceError('My Work could not be loaded.',503);
  const pendingIds=(approvalRequests.data??[]).map(item=>item.id);const pendingInvoiceIds=[...new Set((approvalRequests.data??[]).map(item=>item.invoice_id))];
  const [approvalSteps,approvalInvoices]=await Promise.all([
   pendingIds.length?c.db.from('approval_steps').select('request_id,step_number,approver_user_id,approver_role,approval_mode,status,authority_limit').eq('organization_id',c.organizationId).in('request_id',pendingIds).eq('status','PENDING'):Promise.resolve({data:[],error:null}),
   pendingInvoiceIds.length?c.db.from('invoices').select('id,invoice_number,total,currency,status,updated_at,vendor_id').eq('organization_id',c.organizationId).in('id',pendingInvoiceIds):Promise.resolve({data:[],error:null})
  ]);if(approvalSteps.error||approvalInvoices.error)throw new WorkspaceError('Pending approvals could not be loaded.',503);
  const currentSteps=approvalSteps.data??[];const requestById=new Map((approvalRequests.data??[]).map(item=>[item.id,item]));const eligibleRequests=new Set(currentSteps.filter(step=>step.step_number===requestById.get(step.request_id)?.current_step&&(step.approver_user_id===c.userId||step.approver_role===member.data?.role)).map(step=>step.request_id));
  const approvals=(approvalRequests.data??[]).filter(item=>eligibleRequests.has(item.id)).map(item=>({...item,invoice:(approvalInvoices.data??[]).find(invoice=>invoice.id===item.invoice_id)??null}));
  return {assigned:assigned.data,notifications:notices.data,reviews:reviews.data,imports:imports.data,runs:runs.data,approvals,userId:c.userId};
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
 const r=await query.order(allowed.includes(sort)?sort:'created_at',{ascending:params.get('descending')==='false'}).range(page*50,page*50+49);if(r.error)throw new WorkspaceError('Objects could not be loaded.',503);let items=(r.data??[]) as Record<string,unknown>[];
 if(type==='purchase_order'&&items.length){const ids=new Set(items.map(item=>String(item.id)));const events=await c.db.from('audit_events').select('actor_id,metadata').eq('organization_id',c.organizationId).eq('metadata->>objectType','purchase_order').not('actor_id','is',null).in('metadata->>objectId',[...ids]).order('created_at',{ascending:true}).limit(500);if(events.error)throw new WorkspaceError('Purchase-order creators could not be loaded.',503);const creatorByPo=new Map<string,string>();for(const event of events.data??[]){const metadata=event.metadata&&typeof event.metadata==='object'?event.metadata as Record<string,unknown>:{};const poId=String(metadata.objectId??'');if(ids.has(poId)&&event.actor_id&&!creatorByPo.has(poId))creatorByPo.set(poId,String(event.actor_id))}const actors=[...new Set([...creatorByPo.values()])];const memberships=actors.length?await c.db.from('organization_memberships').select('workos_user_id,email').eq('organization_id',c.organizationId).in('workos_user_id',actors):{data:[],error:null};if(memberships.error)throw new WorkspaceError('Purchase-order creators could not be resolved.',503);const nameByActor=new Map((memberships.data??[]).map(member=>[member.workos_user_id,member.email]));items=items.map(item=>({...item,created_by_name:nameByActor.get(creatorByPo.get(String(item.id))??'')??'Not recorded'}))}
 return {items,count:r.count??0,page};
}
async function handler(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){try{const result=await run(request,(await params).path);return result instanceof Response?result:NextResponse.json(result,{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:400});if(error instanceof WorkspaceError)return NextResponse.json({error:error.message},{status:error.status});console.error('Workspace request failed',error instanceof Error?error.message:'Database error');return NextResponse.json({error:'The request could not be completed. Retry or contact your workspace admin.'},{status:503})}}
export const GET=handler;export const POST=handler;export const PATCH=handler;
