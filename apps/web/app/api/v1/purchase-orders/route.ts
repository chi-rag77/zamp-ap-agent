import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@zamp/database';
import {applyMappings,type IntegrationMapping} from '../../../../../../packages/objects/src/mapping';
import {hashIntegrationApiKey,integrationApiKeyFromRequest} from '../../../../../../packages/integrations/src/api-key';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const money=z.number().finite().nonnegative().max(1_000_000_000_000);
const lineSchema=z.object({
 sku:z.string().trim().max(120).nullable().optional(),
 description:z.string().trim().min(1).max(1000),
 quantity:z.number().finite().positive().max(1_000_000_000),
 unit_price:money,
 tax_rate:z.number().finite().nonnegative().max(100).nullable().optional(),
 amount:money,
}).strict();
const bodySchema=z.object({
 po_number:z.string().trim().min(1).max(120),
 vendor_id:z.string().uuid(),
 currency:z.string().regex(/^[A-Z]{3}$/),
 po_date:z.string().date(),
 valid_until:z.string().date().nullable().optional(),
 subtotal:money,
 tax:money,
 total:money,
 lines:z.array(lineSchema).min(1).max(500),
}).strict();
const moneyEqual=(a:number,b:number)=>Math.abs(Math.round((a-b)*100)/100)<=0.01;

export async function POST(request:NextRequest){
 const started=Date.now();
 const key=integrationApiKeyFromRequest(request);
 if(!key)return NextResponse.json({error:'A valid Zamp API key is required. Send it as a Bearer token or X-API-Key header.'},{status:401,headers:{'WWW-Authenticate':'Bearer realm="Zamp API"','Cache-Control':'no-store'}});
 const service=createServerClient();
 const lookup=await service.from('integration_api_keys').select('id,organization_id').eq('key_hash',hashIntegrationApiKey(key)).is('revoked_at',null).maybeSingle();
 if(lookup.error)return NextResponse.json({error:'API authentication is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!lookup.data)return NextResponse.json({error:'The API key is invalid or has been revoked.'},{status:401,headers:{'WWW-Authenticate':'Bearer realm="Zamp API"','Cache-Control':'no-store'}});
 const auth=lookup.data;

 const respond=async(status:number,result:Record<string,unknown>)=>{
  const usedAt=new Date().toISOString();
  const [updated,logged]=await Promise.all([
   service.from('integration_api_keys').update({last_used_at:usedAt}).eq('id',auth.id),
   service.from('integration_api_requests').insert({organization_id:auth.organization_id,api_key_id:auth.id,method:'POST',path:'/api/v1/purchase-orders',status_code:status,duration_ms:Date.now()-started}),
  ]);
  if(updated.error||logged.error)console.error('Integration API usage could not be recorded', {keyId:auth.id,updateFailed:!!updated.error,logFailed:!!logged.error});
  return NextResponse.json(result,{status,headers:{'Cache-Control':'no-store'}});
 };

 try{
  const raw=await request.text();
  if(raw.length>250_000)return respond(413,{error:'Request exceeds 250 KB.'});
  let parsed:unknown;try{parsed=JSON.parse(raw)}catch{return respond(400,{error:'Request body must be valid JSON.'})}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return respond(400,{error:'Request body must be a JSON object.'});
  let mappedPayload=parsed as Record<string,unknown>;
  const integrationId=request.headers.get('x-zamp-integration-id')?.trim();
  if(integrationId){
   if(!z.string().uuid().safeParse(integrationId).success)return respond(400,{error:'X-Zamp-Integration-ID must be a valid integration id.'});
   const integration=await service.from('integrations').select('id').eq('organization_id',auth.organization_id).eq('id',integrationId).maybeSingle();
   if(integration.error)return respond(503,{error:'Integration configuration could not be checked.'});
   if(!integration.data)return respond(403,{error:'Integration does not belong to the API key organization.'});
   const configured=await service.from('integration_field_mappings').select('source_field,target_field,transformation,required').eq('organization_id',auth.organization_id).eq('integration_id',integrationId).eq('object_type','purchase_order').eq('direction','INBOUND');
   if(configured.error)return respond(503,{error:'Purchase order field mappings could not be loaded.'});
   if(configured.data?.length){
    const mappings=configured.data as IntegrationMapping[];
    const mapped=applyMappings(mappedPayload,mappings);
    if(mapped.errors.length)return respond(400,{error:`Field mapping failed: ${mapped.errors.join('; ')}`});
    mappedPayload={...mappedPayload,...mapped.values};
    for(const mapping of mappings)delete mappedPayload[mapping.source_field];
    mappedPayload={...mappedPayload,...mapped.values};
   }
  }
  const body=bodySchema.safeParse(mappedPayload);
  if(!body.success)return respond(400,{error:body.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')});
  const po=body.data;
  if(po.valid_until&&po.valid_until<po.po_date)return respond(400,{error:'valid_until cannot be before po_date.'});
  const calculatedSubtotal=po.lines.reduce((sum,line)=>sum+line.amount,0);
  const calculatedTax=po.lines.reduce((sum,line)=>sum+line.amount*(line.tax_rate??0)/100,0);
  if(po.lines.some(line=>!moneyEqual(line.amount,line.quantity*line.unit_price)))return respond(400,{error:'Each line amount must equal quantity × unit_price.'});
  if(!moneyEqual(po.subtotal,calculatedSubtotal)||!moneyEqual(po.tax,calculatedTax)||!moneyEqual(po.total,po.subtotal+po.tax))return respond(400,{error:'Subtotal, tax and total must match the line amounts and tax rates.'});

  const vendor=await service.from('vendors').select('id,currency,status').eq('organization_id',auth.organization_id).eq('id',po.vendor_id).is('archived_at',null).maybeSingle();
  if(vendor.error)return respond(503,{error:'Vendor availability could not be checked.'});
  if(!vendor.data||vendor.data.status!=='ACTIVE')return respond(422,{error:'vendor_id must identify an active vendor in the API key organization.'});
  if(vendor.data.currency!==po.currency)return respond(422,{error:`Purchase order currency must match the vendor currency (${vendor.data.currency}).`});

  const {data,error}=await service.rpc('create_integration_purchase_order',{
   p_organization_id:auth.organization_id,
   p_api_key_id:auth.id,
   p_purchase_order:{po_number:po.po_number,vendor_id:po.vendor_id,currency:po.currency,po_date:po.po_date,valid_until:po.valid_until??null,subtotal:po.subtotal,tax:po.tax,total:po.total},
   p_lines:po.lines,
  });
  if(error){
   if(error.code==='23505')return respond(409,{error:'A purchase order with this number already exists in the organization.'});
   if(error.code==='23503')return respond(422,{error:'The vendor is no longer active in this organization.'});
   console.error('Integration PO creation failed',{code:error.code,message:error.message});
   return respond(503,{error:'Purchase order could not be created. No partial PO was saved; retry with the same PO number.'});
  }
  const id=String(data);
  return respond(201,{id,po_number:po.po_number,status:'OPEN',organization_id:auth.organization_id,created:true,href:`/objects/purchase_order/${id}`});
 }catch(error){
  console.error('Integration PO request failed',error);
  return respond(500,{error:'Purchase order request could not be completed.'});
 }
}
