import {PageHeading,LocalNotice} from '../../components/ui';
import {InvoiceTable,type InvoiceView} from '../../components/invoice-table';
import {WorkspaceBrief} from '../../components/workspace-brief';
import {UploadButton} from '../../components/upload-button';
import {day,invoiceDisplayStatus,latestDecision,latestValidation,loadWorkspace,money,percent,poNumber,vendorName} from '../../lib/data';

export const dynamic='force-dynamic';
export default async function ExceptionsPage(){
  const w=await loadWorkspace();
  const rows:InvoiceView[]=w.invoices.filter(invoice=>['FAIL','INCOMPLETE','ERROR'].includes(latestValidation(w,invoice.id)?.status??'')||invoice.status==='NEEDS_REVIEW').map(invoice=>{
    const validation=latestValidation(w,invoice.id),policy=latestDecision(w,invoice.id);
    const price=validation?.result?.checks.find(check=>check.check==='PRICE_MATCH'&&check.status==='FAIL');
    return {id:invoice.id,number:invoice.invoice_number??`Pending · ${invoice.id.slice(0,8)}`,vendor:vendorName(w,invoice),po:poNumber(w,invoice)??'—',date:day(invoice.invoice_date),amount:money(invoice.total,invoice.currency),status:invoiceDisplayStatus(w,invoice),variance:price?.variancePercent!=null?`${price.variancePercent>0?'+':''}${price.variancePercent}%`:validation?.status==='PASS'?'0.00%':'—',confidence:percent(invoice.extraction_confidence),received:day(invoice.received_at),decision:invoice.decision?.replaceAll('_',' ')??(policy?`Policy: ${policy.decision.replaceAll('_',' ')}`:'Pending')};
  });
  const summary=rows.length?`${rows.length} invoice ${rows.length===1?'case is':'cases are'} waiting for human review.`:'No invoice cases currently need a human review.';
  return <><PageHeading title="Exceptions" subtitle="Invoices the AP Agent escalated for human judgment"/><LocalNotice enabled={w.enabled}/><WorkspaceBrief summary={summary} stats={[["in queue",w.invoices.length],["need review",rows.length],["low confidence",rows.filter(row=>row.confidence!=='—'&&Number.parseFloat(row.confidence)<90).length]]}/><InvoiceTable rows={rows} initialTab="All" compactUploadAction={<UploadButton compact/>} uploadAction={<UploadButton/>}/></>;
}
