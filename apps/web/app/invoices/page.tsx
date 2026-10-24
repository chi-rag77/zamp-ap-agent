import {PageHeading,LocalNotice} from '../../components/ui';
import {UploadButton} from '../../components/upload-button';
import {ExportInvoices,InvoiceTable,type InvoiceView} from '../../components/invoice-table';
import {day,invoiceDisplayStatus,latestDecision,latestValidation,loadWorkspace,money,percent,poNumber,vendorName} from '../../lib/data';
import {WorkspaceBrief} from '../../components/workspace-brief';

export const dynamic='force-dynamic';
export default async function InvoicesPage({searchParams}:{searchParams:Promise<{view?:string;q?:string}>}){
  const w=await loadWorkspace();
  const params=await searchParams;
  const view=params.view;
  const initialSearch=params.q??'';
  const initialTab=view==='review'?'Needs review':view==='approved'?'Approval eligible':view==='rejected'?'Rejection eligible':'All';
  const rows:InvoiceView[]=w.invoices.map(invoice=>{
    const v=latestValidation(w,invoice.id);const policy=latestDecision(w,invoice.id);
    const price=v?.result?.checks?.find(c=>c.check==='PRICE_MATCH'&&c.status==='FAIL');
    return {id:invoice.id,number:invoice.invoice_number??`Pending · ${invoice.id.slice(0,8)}`,vendor:vendorName(w,invoice),po:poNumber(w,invoice)??'—',date:day(invoice.invoice_date),amount:money(invoice.total,invoice.currency),status:invoiceDisplayStatus(w,invoice),variance:price?.variancePercent!=null?`${price.variancePercent>0?'+':''}${price.variancePercent}%`:v?.status==='PASS'?'0.00%':'—',confidence:percent(invoice.extraction_confidence),received:day(invoice.received_at),decision:invoice.decision?.replaceAll('_',' ')??(policy?`Policy: ${policy.decision.replaceAll('_',' ')}`:'Pending')};
  });
  const needsReview=rows.filter(row=>row.status==='NEEDS REVIEW'||row.status==='VALIDATION ISSUE').length;
  const lowConfidence=rows.filter(row=>row.confidence!=='—'&&Number.parseFloat(row.confidence)<90).length;
  const summary=needsReview?`${needsReview} ${needsReview===1?'invoice needs':'invoices need'} your review before the agent can continue.`:'No invoices are currently waiting for a human review.';
  return <><PageHeading title="Invoices" subtitle="Every invoice processed by the AP Agent" actions={<><ExportInvoices rows={rows}/><UploadButton/></>}/><LocalNotice enabled={w.enabled}/><WorkspaceBrief summary={summary} stats={[["in queue",rows.length],["need review",needsReview],["low confidence",lowConfidence]]}/><InvoiceTable key={`${initialTab}-${initialSearch}`} rows={rows} initialTab={initialTab} initialSearch={initialSearch}/></>;
}
