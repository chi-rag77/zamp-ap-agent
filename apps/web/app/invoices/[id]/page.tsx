import {notFound} from 'next/navigation';
import {createServerClient} from '@zamp/database';
import {InvoiceCase} from '../../../components/invoice-case';
import {day,invoiceDisplayStatus,latestValidation,loadWorkspace,localWorkspace,money,percent,poNumber,vendorName} from '../../../lib/data';

export const dynamic='force-dynamic';
export default async function InvoiceCasePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!localWorkspace()||!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const w=await loadWorkspace(),invoice=w.invoices.find(i=>i.id===id);
  if(!invoice)notFound();
  const db=createServerClient();
  const validation=latestValidation(w,id)?.result??null;
  const matchedPO=w.purchaseOrders.find(p=>p.id===(validation?.purchaseOrder.poId??invoice.po_id));
  const [linesResult,documentResult,stepsResult,decisionResult,poLinesResult,receiptsResult]=await Promise.all([
    db.from('invoice_lines').select('id,description,sku,quantity,unit_price,amount').eq('invoice_id',id).order('line_number'),
    db.from('invoice_documents').select('id,filename,page_count').eq('invoice_id',id).limit(1),
    db.from('agent_steps').select('id,name,step_type,status,duration_ms,run_id').eq('run_id',w.runs.find(r=>r.invoice_id===id)?.id??'00000000-0000-0000-0000-000000000000').order('step_number').limit(30),
    db.from('agent_decisions').select('decision,reason_code,summary,policy_version,evidence,blockers,warnings,recommended_action,created_at,validation_run_id').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    matchedPO?db.from('purchase_order_lines').select('id,description,sku,quantity,unit_price,amount,received_quantity').eq('po_id',matchedPO.id).order('line_number'):Promise.resolve({data:[],error:null}),
    matchedPO?db.from('goods_receipts').select('id,grn_number,receipt_date,status').eq('po_id',matchedPO.id).order('receipt_date',{ascending:false}):Promise.resolve({data:[],error:null})
  ]);
  if(linesResult.error||documentResult.error||stepsResult.error||decisionResult.error||poLinesResult.error||receiptsResult.error)throw new Error('Invoice detail could not be loaded');
  const receiptIds=(receiptsResult.data??[]).map(receipt=>receipt.id);
  const receiptLinesResult=receiptIds.length?await db.from('goods_receipt_lines').select('goods_receipt_id,po_line_id,accepted_quantity').in('goods_receipt_id',receiptIds):{data:[],error:null};
  if(receiptLinesResult.error)throw new Error('Receipt lines could not be loaded');
  return <InvoiceCase invoiceId={id} number={invoice.invoice_number??`Invoice ${id.slice(0,8)}`} vendor={vendorName(w,invoice)} po={poNumber(w,invoice)??'—'} amount={money(invoice.total,invoice.currency)} subtotal={money(invoice.subtotal,invoice.currency)} tax={money(invoice.tax,invoice.currency)} currency={invoice.currency} date={day(invoice.invoice_date)} dueDate={day(invoice.due_date)} createdAt={invoice.received_at} confidence={percent(invoice.extraction_confidence)} status={invoiceDisplayStatus(w,invoice)} decision={invoice.decision} policyDecision={decisionResult.data} validation={validation} lines={linesResult.data??[]} poLines={poLinesResult.data??[]} purchaseOrder={matchedPO??null} purchaseOrderVendor={w.vendors.find(v=>v.id===matchedPO?.vendor_id)?.display_name??null} receipts={receiptsResult.data??[]} receiptLines={receiptLinesResult.data??[]} steps={stepsResult.data??[]} document={documentResult.data?.[0]??null} extractionStatus={w.extractions.find(e=>e.invoice_id===id)?.status??null}/>;
}
