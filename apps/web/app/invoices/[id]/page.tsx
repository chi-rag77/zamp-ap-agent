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
  const [linesResult,documentResult,stepsResult,decisionResult]=await Promise.all([
    db.from('invoice_lines').select('id,description,sku,quantity,unit_price,amount').eq('invoice_id',id).order('line_number'),
    db.from('invoice_documents').select('id').eq('invoice_id',id).limit(1),
    db.from('agent_steps').select('id,name,step_type,status,duration_ms,run_id').in('run_id',w.runs.filter(r=>r.invoice_id===id).map(r=>r.id).length?w.runs.filter(r=>r.invoice_id===id).map(r=>r.id):['00000000-0000-0000-0000-000000000000']).order('created_at',{ascending:false}).limit(30),
    db.from('agent_decisions').select('decision,reason_code,summary,policy_version,evidence,blockers,warnings,recommended_action,created_at,validation_run_id').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(linesResult.error||documentResult.error||stepsResult.error||decisionResult.error)throw new Error('Invoice detail could not be loaded');
  const validation=latestValidation(w,id)?.result??null;
  return <InvoiceCase invoiceId={id} number={invoice.invoice_number??`Invoice ${id.slice(0,8)}`} vendor={vendorName(w,invoice)} po={poNumber(w,invoice)??'—'} amount={money(invoice.total,invoice.currency)} currency={invoice.currency} date={day(invoice.invoice_date)} dueDate={day(invoice.due_date)} confidence={percent(invoice.extraction_confidence)} status={invoiceDisplayStatus(w,invoice)} decision={invoice.decision} policyDecision={decisionResult.data} validation={validation} lines={linesResult.data??[]} steps={stepsResult.data??[]} documentExists={Boolean(documentResult.data?.length)} extractionStatus={w.extractions.find(e=>e.invoice_id===id)?.status??null}/>;
}
