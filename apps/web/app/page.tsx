import Link from 'next/link';
import {createWebServerClient} from '../lib/tenant-database';
import {Badge,Empty,LocalNotice} from '../components/ui';
import {Icon} from '../components/shell';
import {UploadButton} from '../components/upload-button';
import {DashboardVolumeChart} from '../components/dashboard-volume-chart';
import {DashboardLiveMetrics} from '../components/realtime/dashboard-live-metrics';
import {loadWorkspace,latestDecision,latestValidation,vendorName,money,shortDate,invoiceDisplayStatus,localWorkspace} from '../lib/data';
import './dashboard.css';

export const dynamic='force-dynamic';
const words=(value:string)=>value.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const activityIcon=(value:string)=>{const type=value.toLowerCase();if(/approv|reject|decision/.test(type))return 'check';if(/invoice|extract|document/.test(type))return 'invoice';if(/policy|validat|match/.test(type))return 'shield';if(/integrat|mapping|webhook/.test(type))return 'integrations';return 'agent'};
const pct=(value:number)=>`${Math.round(value*10)/10}%`;
function compactDuration(ms:number){if(!ms)return '—';const seconds=Math.round(ms/1000);return seconds>=60?`${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`:`${seconds}s`}
function timeAgo(date:string){const diff=Math.max(0,Date.now()-new Date(date).getTime());if(diff<3600000)return `${Math.max(1,Math.round(diff/60000))} min ago`;if(diff<86400000)return `${Math.round(diff/3600000)} hr ago`;return `${Math.round(diff/86400000)} day ago`}
function barRate(value:number){return `${Math.max(0,Math.min(100,value))}%`}

export default async function Home(){
  const db=localWorkspace()?await createWebServerClient():null;
  const [w,policyResult]=await Promise.all([loadWorkspace('dashboard',db??undefined),db?db.from('policies').select('name,version,configuration').eq('status','ACTIVE').limit(1).maybeSingle():Promise.resolve({data:null,error:null})]);
  const config=(policyResult.data?.configuration??{}) as {autoApproval?:Record<string,unknown>;rejection?:Record<string,unknown>};
  const auto=config.autoApproval??{};
  const invoices=w.invoices;
  const invoiceIds=new Set(invoices.map(invoice=>invoice.id));
  const validations=w.validations.filter(item=>invoiceIds.has(item.invoice_id));
  const decisions=w.decisions.filter(item=>invoiceIds.has(item.invoice_id));
  const reviews=w.reviews.filter(item=>invoiceIds.has(item.invoice_id));
  const invoiceRuns=w.runs.filter(item=>invoiceIds.has(item.invoice_id));
  const agentRuns=w.agentRuns.filter(item=>invoiceIds.has(item.invoice_id));
  const extractions=w.extractions.filter(item=>invoiceIds.has(item.invoice_id));
  const audits=w.audits.filter(item=>item.invoice_id===null||invoiceIds.has(item.invoice_id));
  const thirtyDaysAgo=Date.now()-30*86400000;
  const recentDecisionsByInvoice=new Map<string,typeof decisions[number]>();
  for(const item of decisions)if(new Date(item.created_at).getTime()>=thirtyDaysAgo&&!recentDecisionsByInvoice.has(item.invoice_id))recentDecisionsByInvoice.set(item.invoice_id,item);
  const recentDecisions=[...recentDecisionsByInvoice.values()];
  const approved=recentDecisions.filter(item=>item.decision==='AUTO_APPROVED').length;
  const reviewCount=recentDecisions.filter(item=>item.decision==='NEEDS_REVIEW').length;
  const rejected=recentDecisions.filter(item=>item.decision==='AUTO_REJECTED').length;
  const approvalRate=recentDecisions.length?approved/recentDecisions.length*100:0;
  const issues=invoices.filter(invoice=>['FAIL','INCOMPLETE','ERROR'].includes(latestValidation(w,invoice.id)?.status??'')||reviews.some(review=>review.invoice_id===invoice.id&&review.status==='OPEN')).sort((a,b)=>Number(b.total??0)-Number(a.total??0));
  const exposedAmount=issues.reduce((sum,invoice)=>sum+Number(invoice.total??0),0);
  const runs=invoiceRuns.filter(run=>run.duration_ms!==null);
  const sortedDurations=runs.map(run=>run.duration_ms??0).sort((a,b)=>a-b);
  const medianDuration=sortedDurations.length?sortedDurations[Math.floor((sortedDurations.length-1)/2)]:0;
  const totalRunDuration=runs.reduce((sum,run)=>sum+(run.duration_ms??0),0);
  const latestRun=invoiceRuns[0];
  const latestAgentRun=agentRuns[0];
  const latestRunInvoice=invoices.find(invoice=>invoice.id===(latestAgentRun?.invoice_id??latestRun?.invoice_id));
  const receivedDays=Array.from({length:14},(_,index)=>{const date=new Date();date.setDate(date.getDate()-13+index);return date.toISOString().slice(0,10)});
  const series={dates:receivedDays.map(shortDate),received:receivedDays.map(date=>invoices.filter(invoice=>invoice.received_at.startsWith(date)).length),processed:receivedDays.map(date=>new Set(invoiceRuns.filter(run=>run.completed_at?.startsWith(date)).map(run=>run.invoice_id)).size),exceptions:receivedDays.map(date=>new Set(validations.filter(validation=>validation.created_at.startsWith(date)&&validation.status!=='PASS').map(validation=>validation.invoice_id)).size)};
  const extractionConfidence=extractions.map(item=>Number(item.overall_confidence)).filter(Number.isFinite);
  const performance=[
    ['Approval eligibility',pct(approvalRate),approvalRate],
    ['Policy decisions without review',pct(recentDecisions.length?(approved+rejected)/recentDecisions.length*100:0),recentDecisions.length?(approved+rejected)/recentDecisions.length*100:0],
    ['Exception rate',pct(validations.length?validations.filter(item=>item.status!=='PASS').length/validations.length*100:0),validations.length?validations.filter(item=>item.status!=='PASS').length/validations.length*100:0],
    ['Average processing time',compactDuration(runs.length?totalRunDuration/runs.length:0),null],
    ['Extraction confidence',extractionConfidence.length?pct(extractionConfidence.reduce((sum,value)=>sum+value,0)/extractionConfidence.length*100):'—',extractionConfidence.length?extractionConfidence.reduce((sum,value)=>sum+value,0)/extractionConfidence.length*100:0],
    ['PO match rate',pct(validations.length?validations.filter(item=>item.result?.purchaseOrder?.status==='MATCHED').length/validations.length*100:0),validations.length?validations.filter(item=>item.result?.purchaseOrder?.status==='MATCHED').length/validations.length*100:0]
  ] as const;
  const limits=[
    [auto.requiresPo?'A purchase order is required before approval.':'Purchase order exceptions require review.',`Policy v${policyResult.data?.version??'—'} · blocking`,'po'],
    [`Price variance above ${auto.maxPriceVariancePercent??'—'}% requires review.`,`Policy v${policyResult.data?.version??'—'} · tolerance`,'invoice'],
    [`Extraction confidence below ${Number(auto.minExtractionConfidence??0)*100}% stops automatic approval.`,`Policy v${policyResult.data?.version??'—'} · confidence`,'agent'],
    [config.rejection?.confirmedDuplicate?'Confirmed duplicate invoices are rejected.':'Duplicate invoices require a recorded review.','Duplicate control','invoice'],
    ['Every policy evaluation records its version and evidence.','Audit trail','audit']
  ];
  const csv=['invoice_number,vendor,status,amount,currency',...invoices.map(invoice=>[invoice.invoice_number??'',vendorName(w,invoice),invoiceDisplayStatus(w,invoice),invoice.total??'',invoice.currency].map(value=>`"${String(value).replaceAll('"','""')}"`).join(','))].join('\n');
  return <div className="ap-dashboard"><header className="ap-page-head"><h1>Accounts Payable</h1><p>Your agent owns intake, matching and every decision. This is what it handled alone — and what it needs from you.</p><div className="ap-toolbar"><span className="ap-online" title="Agent health is checked after the page loads"><span className="online-dot"/> Agent status in sidebar</span><button className="ap-toolbar-button" type="button" title="Showing the last 30 days">▦ &nbsp;Last 30 days</button><a className="ap-toolbar-button" download="zamp-invoices.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}><Icon name="download" size={15}/> Export</a><button className="ap-toolbar-button" disabled title="Agent pause is not configured in this workspace"><span>Ⅱ</span> Pause agent</button><UploadButton/></div></header><LocalNotice enabled={w.enabled}/><DashboardLiveMetrics/>
    <section className="ap-hero"><div className="ap-hero-body"><div className="ap-hero-eyebrow"><span className="ap-hero-spark">✧</span><strong>AP Invoice Processing Agent</strong><span className="ap-working">● WORKING NOW</span></div><p className="ap-run-meta">{latestAgentRun?`LATEST RUN · ${latestAgentRun.step_count} STEPS · ${compactDuration(latestAgentRun.duration_ms??0)}`:'INVOICE INTAKE · EXTRACTION · MATCHING · POLICY DECISION'}</p><h2>{recentDecisions.length} of {invoices.length} available invoices evaluated in the last 30 days.</h2><p className="ap-hero-lead">{issues.length} {issues.length===1?'case needs':'cases need'} review — {money(exposedAmount)} await a human decision.</p><p className="ap-hero-proof"><span>♧</span> Every evaluation cites the policy version and its evidence.</p><div className="ap-hero-actions"><Link className="ap-blue-button" href="/exceptions">Review {issues.length} {issues.length===1?'case':'cases'} <Icon name="arrow" size={14}/></Link><Link className="ap-white-button" href="/agent/runs">⌁ &nbsp;Watch live run</Link></div><Link className="ap-run-strip" href={latestRunInvoice?`/invoices/${latestRunInvoice.id}`:'/agent/runs'}><span className="ap-blue-dot"/><strong>{latestRunInvoice?.invoice_number??'No run yet'}</strong><span>{latestAgentRun?(latestAgentRun.current_step??words(latestAgentRun.current_state)):'Awaiting first run'}</span><b>{latestAgentRun?`${latestAgentRun.step_count} steps`:'—'}</b><Icon name="arrow" size={13}/></Link><div className="ap-hero-stats"><div className="ap-ring-area"><div className="ap-ring" style={{background:`conic-gradient(#3c70df ${barRate(approvalRate)},#edf2f7 0)`}}><span><strong>{pct(approvalRate)}</strong><small>ELIGIBLE</small></span></div><p>Eligible under policy</p></div><div className="ap-stat-grid"><div><strong>{approved}</strong><small>APPROVAL ELIGIBLE</small></div><div><strong>{issues.length}</strong><small>WAITING ON YOU</small></div><div><strong>{compactDuration(medianDuration)}</strong><small>MEDIAN RUN</small></div><div><strong>{compactDuration(totalRunDuration)}</strong><small>TIME IN RUNS</small></div></div></div></div><div className="ap-hero-footer"><div className="ap-hero-footer-head"><span>AVAILABLE INVOICE DECISIONS · LAST 30 DAYS</span><span><i className="ap-key approved"/> Approval eligible&nbsp; {approved} &nbsp; <i className="ap-key review"/> Escalated&nbsp; {reviewCount} &nbsp; <i className="ap-key rejected"/> Rejection eligible&nbsp; {rejected}</span></div><div className="ap-decision-bars">{Array.from({length:128},(_,index)=>{const item=recentDecisions[index];return <span key={index} className={item?item.decision==='AUTO_APPROVED'?'approved':item.decision==='AUTO_REJECTED'?'rejected':'review':'empty'} title={item?`${words(item.decision)} · ${item.reason_code??''}`:'No recorded decision'}/>})}</div><div className="ap-hero-footer-axis"><span>30 days ago</span><span>Today</span></div></div></section>
    <section className="ap-card ap-attention"><div className="ap-card-head"><div><h2>Waiting on you</h2><p>{issues.length} cases requiring review · ranked by exposure</p></div><Link href="/exceptions">All exceptions <Icon name="arrow" size={13}/></Link></div>{issues.length?issues.slice(0,5).map(invoice=>{const validation=latestValidation(w,invoice.id)?.result;const first=validation?.checks.find(check=>check.status==='FAIL');const review=reviews.find(item=>item.invoice_id===invoice.id&&item.status==='OPEN');const decision=latestDecision(w,invoice.id);const reason=first?.reason??review?.reason??'Validation needs review before an invoice action.';const code=first?.code??review?.reason_code??validation?.blockers[0]??'REVIEW REQUIRED';const facts=[validation?`${validation.summary.failed} checks failed`:'Validation pending',validation?.purchaseOrder.poNumber?`PO ${validation.purchaseOrder.poNumber}`:invoice.po_id?'PO linked':'PO unresolved',invoice.extraction_confidence?`Extraction ${pct(Number(invoice.extraction_confidence)*100)}%`:'Confidence unavailable'];return <article className={`ap-case ${code.includes('VENDOR')?'danger':'warning'}`} key={invoice.id}><div className="ap-case-top"><div><Link href={`/invoices/${invoice.id}`} className="ap-case-number">{invoice.invoice_number??`Invoice ${invoice.id.slice(0,8)}`}</Link><span className="ap-case-vendor">{vendorName(w,invoice)}</span><Badge label={words(code)}/></div><div className="ap-case-amount"><strong>{money(invoice.total,invoice.currency)}</strong><small>{timeAgo(invoice.received_at)}</small></div></div><p className="ap-case-reason">{reason}</p><div className="ap-case-call">✧ &nbsp;<strong>My call:</strong>&nbsp; {decision?.decision==='NEEDS_REVIEW'?decision.summary:'Review the failed evidence before approving or paying this invoice.'}</div><div className="ap-case-bottom"><span>{facts.map((fact,index)=><small key={index}>· {fact}</small>)}</span><Link href={`/invoices/${invoice.id}`}>Open case <Icon name="arrow" size={13}/></Link></div></article>}):<Empty title="No cases waiting" message="Cases requiring review will appear here."/>}</section>
    <div className="ap-insights-grid">
      <DashboardVolumeChart series={series}/>
      <section className="ap-card ap-performance"><div className="ap-card-head"><div><h2>Agent performance</h2><p>Last 30 days</p></div><span className="ap-live-badge">LIVE DATA</span></div><div className="ap-performance-list">{performance.map(([name,value,rate])=><div className="ap-performance-row" key={name}><div><span>{name}</span><strong>{value}</strong></div>{rate!==null&&<div className="ap-performance-track" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rate)}><span style={{width:barRate(rate)}}/></div>}</div>)}</div></section>
    </div>
    <div className="ap-activity-grid">
      <section className="ap-card ap-activity"><div className="ap-card-head"><div><h2>Recent agent activity</h2><p>Autonomous actions recorded for available invoices</p></div><Link href="/audit">Audit log <Icon name="arrow" size={13}/></Link></div>{audits.length?<ol>{audits.slice(0,6).map(event=><li key={event.id}><time dateTime={event.created_at}>{new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(event.created_at))}</time><span className="ap-activity-icon"><Icon name={activityIcon(event.event_type)} size={13}/></span><div><strong>{event.description}</strong><small>{words(event.event_type)}</small></div></li>)}</ol>:<Empty title="No activity yet" message="Recorded agent actions will appear here."/>}</section>
      <section className="ap-card ap-limits"><div className="ap-card-head"><div><h2>Hard limits</h2><p>What the agent will never do without you</p></div></div><ul>{limits.map(([title,detail,icon])=><li key={title}><span className="ap-limit-icon"><Icon name={icon} size={14}/></span><div>{title}<small>{detail}</small></div></li>)}</ul><Link className="ap-limits-link" href="/rules">Edit the policy it obeys <Icon name="arrow" size={13}/></Link></section>
    </div>
  </div>;
}
