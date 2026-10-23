import {PageHeading,LocalNotice} from '../../components/ui';
import {UploadButton} from '../../components/upload-button';
import {InvoiceTable,type InvoiceView} from '../../components/invoice-table';
import {day,invoiceDisplayStatus,latestDecision,latestValidation,loadWorkspace,money,percent,poNumber,vendorName} from '../../lib/data';

export const dynamic='force-dynamic';
export default async function InvoicesPage({searchParams}:{searchParams:Promise<{view?:string}>}){
  const w=await loadWorkspace();
  const view=(await searchParams).view;
  const initialTab=view==='review'?'Needs review':view==='approved'?'Approved':view==='rejected'?'Rejected':'All';
  const rows:InvoiceView[]=w.invoices.map(invoice=>{
    const v=latestValidation(w,invoice.id);const policy=latestDecision(w,invoice.id);
    const price=v?.result?.checks?.find(c=>c.check==='PRICE_MATCH'&&c.status==='FAIL');
    return {id:invoice.id,number:invoice.invoice_number??`Pending · ${invoice.id.slice(0,8)}`,vendor:vendorName(w,invoice),po:poNumber(w,invoice)??'—',date:day(invoice.invoice_date),amount:money(invoice.total,invoice.currency),status:invoiceDisplayStatus(w,invoice),variance:price?.variancePercent!=null?`${price.variancePercent>0?'+':''}${price.variancePercent}%`:v?.status==='PASS'?'0.00%':'—',confidence:percent(invoice.extraction_confidence),received:day(invoice.received_at),decision:invoice.decision?.replaceAll('_',' ')??(policy?`Policy: ${policy.decision.replaceAll('_',' ')}`:'Pending')};
  });
  return <><PageHeading title="Invoices" subtitle="Every invoice recorded and checked by the AP workspace" actions={<UploadButton/>}/><LocalNotice enabled={w.enabled}/><InvoiceTable key={initialTab} rows={rows} initialTab={initialTab}/></>;
}
