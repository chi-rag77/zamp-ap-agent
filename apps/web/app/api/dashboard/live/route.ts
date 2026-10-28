import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../lib/tenant-database';
import {allowed,denied,failed} from '../../../../lib/agent-api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(!allowed(request))return denied();
 try{
  const db=await createWebServerClient(),since=new Date(Date.now()-30*86400000).toISOString(),today=new Date();today.setHours(0,0,0,0);const todayIso=today.toISOString();
  const activeInvoices=await db.from('invoices').select('id').is('archived_at',null);
  if(activeInvoices.error)throw activeInvoices.error;
  const invoiceIds=(activeInvoices.data??[]).map(invoice=>invoice.id);
  if(!invoiceIds.length)return NextResponse.json({processingNow:0,queued:0,needsReview:0,invoicesToday:0,approvedToday:0,rejectedToday:0,reviewToday:0,successRate:0,failureRate:0,averageProcessingTimeMs:null,p95ProcessingTimeMs:null,lastSuccessfulRunAt:null},{headers:{'Cache-Control':'no-store'}});
  const [active,queued,review,invoicesToday,approvedToday,rejectedToday,reviewToday,history,lastSuccess]=await Promise.all([
   db.from('agent_runs').select('id',{count:'exact',head:true}).in('invoice_id',invoiceIds).in('status',['QUEUED','RUNNING']),
   db.from('agent_runs').select('id',{count:'exact',head:true}).in('invoice_id',invoiceIds).eq('status','QUEUED'),
   db.from('review_cases').select('id',{count:'exact',head:true}).in('invoice_id',invoiceIds).in('status',['OPEN','IN_PROGRESS']),
   db.from('invoices').select('id',{count:'exact',head:true}).in('id',invoiceIds).gte('received_at',todayIso),
   db.from('agent_runs').select('id',{count:'exact',head:true}).in('invoice_id',invoiceIds).gte('created_at',todayIso).eq('final_decision','AUTO_APPROVED'),
   db.from('agent_runs').select('id',{count:'exact',head:true}).in('invoice_id',invoiceIds).gte('created_at',todayIso).eq('final_decision','AUTO_REJECTED'),
   db.from('agent_runs').select('id',{count:'exact',head:true}).in('invoice_id',invoiceIds).gte('created_at',todayIso).eq('final_decision','NEEDS_REVIEW'),
   db.from('agent_runs').select('status,duration_ms,created_at,error_class').in('invoice_id',invoiceIds).gte('created_at',since).order('created_at',{ascending:false}).limit(1000),
   db.from('agent_runs').select('completed_at').in('invoice_id',invoiceIds).eq('status','COMPLETED').order('completed_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  for(const result of [active,queued,review,invoicesToday,approvedToday,rejectedToday,reviewToday,history,lastSuccess])if(result.error)throw result.error;
  const historyRows=history.data??[],terminal=historyRows.filter(row=>['COMPLETED','FAILED'].includes(row.status)),success=terminal.filter(row=>row.status==='COMPLETED').length,failedCount=terminal.length-success,durations=historyRows.map(row=>row.duration_ms).filter((value):value is number=>typeof value==='number').sort((a,b)=>a-b);
  return NextResponse.json({processingNow:active.count??0,queued:queued.count??0,needsReview:review.count??0,invoicesToday:invoicesToday.count??0,approvedToday:approvedToday.count??0,rejectedToday:rejectedToday.count??0,reviewToday:reviewToday.count??0,successRate:terminal.length?Math.round(success/terminal.length*1000)/10:0,failureRate:terminal.length?Math.round(failedCount/terminal.length*1000)/10:0,averageProcessingTimeMs:durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):null,p95ProcessingTimeMs:durations.length?durations[Math.min(durations.length-1,Math.ceil(durations.length*.95)-1)]:null,lastSuccessfulRunAt:lastSuccess.data?.completed_at??null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failed(error)}
}
