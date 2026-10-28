import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {objectContext,WorkspaceError} from '../../../../lib/objects';
import {requirePermission} from '../../../../lib/access-control';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const inputSchema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(6000)})).min(1).max(12)}).strict();
const toolSpecs=[
 {type:'function',function:{name:'get_invoice',description:'Find one invoice by its invoice number or UUID and retrieve its latest validation and processing decision.',parameters:{type:'object',properties:{reference:{type:'string',description:'Invoice number or UUID'}},required:['reference'],additionalProperties:false}}},
 {type:'function',function:{name:'get_purchase_order',description:'Find one purchase order by PO number or UUID and retrieve vendor, totals, status, and line items.',parameters:{type:'object',properties:{reference:{type:'string',description:'PO number or UUID'}},required:['reference'],additionalProperties:false}}},
 {type:'function',function:{name:'find_vendors',description:'Search active organization vendors by name, vendor code, or email domain.',parameters:{type:'object',properties:{query:{type:'string',description:'Vendor name, code, or email domain'}},required:['query'],additionalProperties:false}}},
 {type:'function',function:{name:'invoice_queue_summary',description:'Get invoice totals and counts by status for the active organization.',parameters:{type:'object',properties:{},additionalProperties:false}}},
] as const;
type ToolCall={id:string;type:'function';function:{name:string;arguments:string}};
type Message={role:'system'|'user'|'assistant'|'tool';content:string|null;tool_calls?:ToolCall[];tool_call_id?:string};
const uuid=z.string().uuid();
const recordQuestion=/\b(invoice|invoices|purchase order|\bpo\b|vendor|approval|approver|reject(?:ed|ion)?|exception|matching|queue|amount|payable|tax|policy|decision|review|paid)\b/i;

async function executeTool(name:string,args:unknown,c:Awaited<ReturnType<typeof objectContext>>){
 const parsed= name==='get_invoice'?z.object({reference:z.string().trim().min(1).max(120)}).strict().parse(args)
  :name==='get_purchase_order'?z.object({reference:z.string().trim().min(1).max(120)}).strict().parse(args)
  :name==='find_vendors'?z.object({query:z.string().trim().min(2).max(120)}).strict().parse(args)
  :name==='invoice_queue_summary'?z.object({}).strict().parse(args):null;
 if(!parsed)throw new WorkspaceError('That Copilot action is not available.',400);
 if(name==='get_invoice'){
  await requirePermission(c,'invoices.view');const {reference}=parsed as {reference:string};
  let q=c.db.from('invoices').select('id,invoice_number,vendor_id,po_id,currency,subtotal,tax,total,status,decision,decision_reason,invoice_date,due_date,received_at,extraction_confidence').eq('organization_id',c.organizationId).is('archived_at',null);
  q=uuid.safeParse(reference).success?q.eq('id',reference):q.eq('invoice_number',reference);
  const {data,error}=await q.limit(1).maybeSingle();if(error)throw new WorkspaceError('Invoice records are temporarily unavailable.',503);if(!data)return {found:false,message:'No matching invoice found in this organization.'};
  const [vendor,po,validation,run]=await Promise.all([
   data.vendor_id?c.db.from('vendors').select('display_name,legal_name,vendor_code,status').eq('organization_id',c.organizationId).eq('id',data.vendor_id).maybeSingle():Promise.resolve({data:null,error:null}),
   data.po_id?c.db.from('purchase_orders').select('po_number,status,total,currency').eq('organization_id',c.organizationId).eq('id',data.po_id).maybeSingle():Promise.resolve({data:null,error:null}),
   c.db.from('invoice_validation_runs').select('result,created_at').eq('organization_id',c.organizationId).eq('invoice_id',data.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   c.db.from('agent_runs').select('status,final_decision,summary,created_at').eq('organization_id',c.organizationId).eq('invoice_id',data.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(vendor.error||po.error||validation.error||run.error)throw new WorkspaceError('Invoice evidence is temporarily unavailable.',503);
  return {invoice:data,vendor:vendor.data,purchaseOrder:po.data,latestValidation:validation.data,latestProcessing:run.data};
 }
 if(name==='get_purchase_order'){
  await requirePermission(c,'purchase_orders.view');const {reference}=parsed as {reference:string};let q=c.db.from('purchase_orders').select('id,po_number,vendor_id,status,currency,subtotal,tax,total,po_date,valid_until').eq('organization_id',c.organizationId).is('archived_at',null);
  q=uuid.safeParse(reference).success?q.eq('id',reference):q.eq('po_number',reference);const {data,error}=await q.limit(1).maybeSingle();if(error)throw new WorkspaceError('Purchase orders are temporarily unavailable.',503);if(!data)return {found:false,message:'No matching purchase order found in this organization.'};
  const [vendor,lines]=await Promise.all([c.db.from('vendors').select('display_name,legal_name,vendor_code,status').eq('organization_id',c.organizationId).eq('id',data.vendor_id).maybeSingle(),c.db.from('purchase_order_lines').select('line_number,sku,description,quantity,unit_price,tax_rate,amount,received_quantity').eq('po_id',data.id).order('line_number').limit(100)]);
  if(vendor.error||lines.error)throw new WorkspaceError('Purchase order evidence is temporarily unavailable.',503);return {purchaseOrder:data,vendor:vendor.data,lines:lines.data??[]};
 }
 if(name==='find_vendors'){
  await requirePermission(c,'vendors.view');const {query}=parsed as {query:string};const pattern=`%${query.replace(/[%_]/g,' ')}%`;const columns='id,vendor_code,display_name,legal_name,gstin,tax_id,email_domain,currency,status,address';const results=await Promise.all(['display_name','legal_name','vendor_code','email_domain'].map(column=>c.db.from('vendors').select(columns).eq('organization_id',c.organizationId).is('archived_at',null).ilike(column,pattern).limit(8)));
  if(results.some(result=>result.error))throw new WorkspaceError('Vendor records are temporarily unavailable.',503);const unique=new Map<string,unknown>();for(const result of results)for(const vendor of result.data??[])unique.set(vendor.id,vendor);return {vendors:[...unique.values()].slice(0,8)};
 }
 await requirePermission(c,'invoices.view');
 const statuses=['RECEIVED','PROCESSING','NEEDS_REVIEW','APPROVED','REJECTED','FAILED'] as const;
 const results=await Promise.all(statuses.map(async status=>{const result=await c.db.from('invoices').select('id',{count:'exact',head:true}).eq('organization_id',c.organizationId).eq('status',status).is('archived_at',null);if(result.error)throw new WorkspaceError('Invoice summary is temporarily unavailable.',503);return {status,count:result.count??0}}));
 return {total:results.reduce((n,r)=>n+r.count,0),byStatus:results};
}

export async function POST(request:NextRequest){
 try{
  if(request.headers.get('origin')!==request.nextUrl.origin)throw new WorkspaceError('Request origin is not allowed.',403);
  const c=await objectContext();await requirePermission(c,'invoices.view');const input=inputSchema.parse(await request.json());
  const apiKey=process.env.NVIDIA_API_KEY;const model=process.env.NVIDIA_COPILOT_MODEL;const base=(process.env.NVIDIA_BASE_URL??'https://integrate.api.nvidia.com/v1').replace(/\/$/,'');
  if(!apiKey||!model)return NextResponse.json({error:'Copilot is not configured yet. Invoice processing and approvals are still available.'},{status:503});
  if(!base.startsWith('https://'))throw new WorkspaceError('Copilot provider must use a secure endpoint.',503);
  const messages:Message[]=[{role:'system',content:`You are Zamp AP Copilot for the user's active organization. Answer concisely and clearly using only retrieved tool evidence. Never guess missing facts; say when data is unavailable. Use tools for questions about records, status, policy decisions, or counts. Explain financial outcomes from saved deterministic evidence; do not calculate or authorize financial actions. You are read-only and cannot approve, reject, edit, or trigger workflows. Never request or reveal another organization's data. Format amounts with currency from evidence. Do not emit HTML.`},...input.messages.map(m=>({role:m.role,content:m.content} as Message))];
  const trace:{stage:string;status:'complete';detail:string}[]=[{stage:'Organization access',status:'complete',detail:'Active organization and invoice-view permission verified.'},{stage:'Model routing',status:'complete',detail:`Using configured Copilot model: ${model}.`}];
  let toolLookupCount=0;
  for(let round=0;round<4;round++){
   const response=await fetch(`${base}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model,messages,tools:toolSpecs,tool_choice:'auto',parallel_tool_calls:false,temperature:0.1,max_tokens:700,stream:false})});
   if(!response.ok){console.error('NVIDIA Copilot request failed',{status:response.status});throw new WorkspaceError('Copilot could not reach its model service. Try again shortly.',503)}
   const body=await response.json() as {choices?:{message?:Message;finish_reason?:string}[]};const message=body.choices?.[0]?.message;if(!message)throw new WorkspaceError('Copilot returned an incomplete response. Try again.',503);
   if(!message.tool_calls?.length){const answer=typeof message.content==='string'?message.content.trim():'';if(!answer)throw new WorkspaceError('Copilot returned an empty response. Try again.',503);if(recordQuestion.test(input.messages.at(-1)?.content??'')&&!toolLookupCount)throw new WorkspaceError('I couldn’t verify that from your organization’s records. Try including an invoice number, PO number, or vendor name.',503);trace.push({stage:'Answer',status:'complete',detail:toolLookupCount?'Response grounded in the active organization’s retrieved records.':'General product guidance; no organization record was accessed.'});return NextResponse.json({answer,trace,model},{headers:{'Cache-Control':'no-store'}})}
   if(message.tool_calls.length>1)throw new WorkspaceError('Copilot returned more than one data lookup at a time. Try again with a more focused question.',400);
   messages.push(message);
   for(const call of message.tool_calls){if(call.type!=='function')throw new WorkspaceError('Unsupported Copilot action.',400);let args:unknown;try{args=JSON.parse(call.function.arguments)}catch{throw new WorkspaceError('Copilot requested an invalid data lookup.',400)}
    const result=await executeTool(call.function.name,args,c);toolLookupCount++;trace.push({stage:'Secure data lookup',status:'complete',detail:`Retrieved ${call.function.name.replaceAll('_',' ')} evidence from the active organization.`});messages.push({role:'tool',content:JSON.stringify(result),tool_call_id:call.id});
   }
  }
  throw new WorkspaceError('Copilot could not finish within the allowed lookup steps. Try a more specific question.',503);
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(i=>i.message).join('; ')},{status:400});const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;return NextResponse.json({error:status>=400&&status<500&&error instanceof Error?error.message:status===503&&error instanceof Error?error.message:'Copilot is temporarily unavailable.'},{status:status>=400&&status<600?status:500})}
}
