import {notFound} from 'next/navigation';
import {createWebServerClient} from '../../../lib/tenant-database';
import {InvoiceCase} from '../../../components/invoice-case';
import {day,invoiceDisplayStatus,localWorkspace,money,percent,poNumber,vendorName,type InvoiceRow,type VendorRow,type PORow,type ValidationRow,type ExtractionRow,type ReviewRow,type Workspace} from '../../../lib/data';

export const dynamic='force-dynamic';
export default async function InvoiceCasePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!localWorkspace()||!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const db=await createWebServerClient();
  const invoiceResult=await db.from('invoices').select('id,invoice_number,vendor_id,po_id,invoice_date,due_date,currency,subtotal,tax,total,extraction_confidence,status,decision,source,received_at,current_extraction_id,document_path').eq('id',id).is('archived_at',null).maybeSingle();
  if(invoiceResult.error)throw new Error(`Invoice could not be loaded: ${invoiceResult.error.message}`);
  if(!invoiceResult.data)notFound();
  const invoice=invoiceResult.data as InvoiceRow;
  const [validationResult,extractionResult,reviewResult,vendorResult,runResult,linesResult,documentResult,decisionResult]=await Promise.all([
    db.from('invoice_validation_runs').select('id,invoice_id,status,engine_version,result,created_at,run_id').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1),
    db.from('invoice_extractions').select('id,invoice_id,status,overall_confidence,normalized_output,provider,model,created_at').eq('invoice_id',id).eq('is_canonical',true).order('created_at',{ascending:false}).limit(1),
    db.from('review_cases').select('id,invoice_id,status,reason,reason_code,priority,created_at').eq('invoice_id',id).order('created_at',{ascending:false}).limit(10),
    invoice.vendor_id?db.from('vendors').select('id,vendor_code,legal_name,display_name,gstin,currency,status').eq('id',invoice.vendor_id).maybeSingle():Promise.resolve({data:null,error:null}),
    db.from('processing_runs').select('id,invoice_id,status,agent_version,started_at,completed_at,duration_ms,error_code,created_at').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1),
    db.from('invoice_lines').select('id,description,sku,quantity,unit_price,amount').eq('invoice_id',id).order('line_number'),
    db.from('invoice_documents').select('id,filename,page_count').eq('invoice_id',id).limit(1),
    db.from('agent_decisions').select('decision,reason_code,summary,policy_version,evidence,blockers,warnings,recommended_action,created_at,validation_run_id').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(validationResult.error||extractionResult.error||reviewResult.error||vendorResult.error||runResult.error||linesResult.error||documentResult.error||decisionResult.error)throw new Error('Invoice detail could not be loaded');
  const validations=(validationResult.data??[]) as ValidationRow[];
  const extractions=(extractionResult.data??[]) as ExtractionRow[];
  const vendors=(vendorResult.data?[vendorResult.data]:[]) as VendorRow[];
  const validation=validations[0]?.result??null;
  const poId=validation?.purchaseOrder.poId??invoice.po_id;
  const [poResult,stepsResult]=await Promise.all([
    poId?db.from('purchase_orders').select('id,po_number,vendor_id,currency,status,po_date,total,subtotal,tax').eq('id',poId).maybeSingle():Promise.resolve({data:null,error:null}),
    runResult.data?.[0]?db.from('agent_steps').select('id,name,step_type,status,duration_ms,run_id').eq('run_id',runResult.data[0].id).order('step_number').limit(30):Promise.resolve({data:[],error:null}),
  ]);
  if(poResult.error||stepsResult.error)throw new Error('Invoice matching details could not be loaded');
  const matchedPO=poResult.data as PORow|null;
  const poVendor=matchedPO&&matchedPO.vendor_id!==invoice.vendor_id?await db.from('vendors').select('id,vendor_code,legal_name,display_name,gstin,currency,status').eq('id',matchedPO.vendor_id).maybeSingle():null;
  if(poVendor?.error)throw new Error('Purchase-order vendor could not be loaded');
  const allVendors=[...vendors,...(poVendor?.data?[poVendor.data as VendorRow]:[])];
  const [poLinesResult,receiptsResult]=await Promise.all([
    matchedPO?db.from('purchase_order_lines').select('id,description,sku,quantity,unit_price,amount,received_quantity').eq('po_id',matchedPO.id).order('line_number'):Promise.resolve({data:[],error:null}),
    matchedPO?db.from('goods_receipts').select('id,grn_number,receipt_date,status').eq('po_id',matchedPO.id).order('receipt_date',{ascending:false}):Promise.resolve({data:[],error:null})
  ]);
  if(poLinesResult.error||receiptsResult.error)throw new Error('Invoice receipt data could not be loaded');
  const w={enabled:true,invoices:[invoice],vendors:allVendors,purchaseOrders:matchedPO?[matchedPO]:[],validations,decisions:[],extractions,audits:[],runs:runResult.data??[],agentRuns:[],reviews:(reviewResult.data??[]) as ReviewRow[]} as Workspace;
  const receiptIds=(receiptsResult.data??[]).map(receipt=>receipt.id);
  const receiptLinesResult=receiptIds.length?await db.from('goods_receipt_lines').select('goods_receipt_id,po_line_id,accepted_quantity').in('goods_receipt_id',receiptIds):{data:[],error:null};
  if(receiptLinesResult.error)throw new Error('Receipt lines could not be loaded');
  return <InvoiceCase invoiceId={id} number={invoice.invoice_number??`Invoice ${id.slice(0,8)}`} vendor={vendorName(w,invoice)} po={poNumber(w,invoice)??'—'} amount={money(invoice.total,invoice.currency)} subtotal={money(invoice.subtotal,invoice.currency)} tax={money(invoice.tax,invoice.currency)} currency={invoice.currency} date={day(invoice.invoice_date)} dueDate={day(invoice.due_date)} createdAt={invoice.received_at} confidence={percent(invoice.extraction_confidence)} status={invoiceDisplayStatus(w,invoice)} decision={invoice.decision} policyDecision={decisionResult.data} validation={validation} lines={linesResult.data??[]} poLines={poLinesResult.data??[]} purchaseOrder={matchedPO??null} purchaseOrderVendor={w.vendors.find(v=>v.id===matchedPO?.vendor_id)?.display_name??null} receipts={receiptsResult.data??[]} receiptLines={receiptLinesResult.data??[]} steps={stepsResult.data??[]} document={documentResult.data?.[0]??null} extractionStatus={w.extractions.find(e=>e.invoice_id===id)?.status??null}/>;
}
