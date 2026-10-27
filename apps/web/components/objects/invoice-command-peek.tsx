'use client';
import {useState} from 'react';
import type {Detail,PeekContext} from './object-workspace';

type ValidationCheck={check?:string;status?:string;actual?:unknown;expected?:unknown;reason?:string;variancePercent?:number|null};
const text=(value:unknown,fallback='—')=>value===null||value===undefined||value===''?fallback:String(value);
const human=(value:unknown)=>text(value,'Not recorded').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const extractedText=(value:unknown)=>{if(value===null||value===undefined)return null;if(typeof value==='object'){const v=record(value);return text(v.name??v.displayName??v.value??v.number,'—')}return String(value)};
const date=(value:unknown,includeTime=false)=>{if(typeof value!=='string'||!value)return '—';const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))return String(value);return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',...(includeTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(parsed)};
const money=(value:unknown,currency:unknown)=>{if(value===null||value===undefined||value==='')return '—';try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:text(currency,'INR'),maximumFractionDigits:2}).format(Number(value))}catch{return String(value)}};
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'?value as Record<string,unknown>:{};}
function resultTone(status:unknown){const s=String(status??'').toUpperCase();return s==='PASS'||s==='MATCHED'||s==='APPROVED'||s==='AUTO_APPROVED'||s==='NO_DUPLICATE'?'good':s==='FAIL'||s==='NOT_MATCHED'||s==='REJECTED'||s==='AUTO_REJECTED'?'bad':'warn'}
function Checkpoint({label,status,detail}:{label:string;status:unknown;detail?:string}){const tone=resultTone(status);return <div className="icp-checkpoint"><span className={`icp-check ${tone}`}>{tone==='good'?'✓':tone==='bad'?'×':'!'}</span><span><strong>{label}</strong>{detail&&<small>{detail}</small>}</span><em className={tone}>{human(status)}</em></div>}

export function InvoiceCommandPeek({data,id,context,members}:{data:Detail;id:string;context?:PeekContext;members:{workos_user_id:string;email:string}[]}){
 const [active,setActive]=useState('document');
 const invoice=data.object,extraction=record(data.evidence.extraction),normalized=record(extraction.normalized_output),validation=record(data.evidence.validation),match=record(validation.result),po=record(match.purchaseOrder),vendor=record(match.vendor),decision=record(data.evidence.decision);
 const checks=Array.isArray(match.checks)?match.checks as ValidationCheck[]:[];
 const lines=data.lines;
 const poNumber=text(context?.po??po.poNumber??normalized.poNumber, 'No PO identified');
 const decisionStatus=text(context?.decision??decision.decision??invoice.decision,'Not evaluated');
 const decisionSummary=text(decision.summary??decision.reason??(Array.isArray(match.blockers)?(match.blockers as unknown[]).join(', '):null),'No saved policy explanation is available yet.');
 const original=Array.isArray(data.evidence.documents)?record((data.evidence.documents as unknown[])[0]):{};
 const sourceDocument=text(original.filename,'Original document unavailable');
 const navigate=(section:string)=>{setActive(section);document.getElementById(`invoice-peek-${section}`)?.scrollIntoView({behavior:'smooth',block:'start'})};
 const decisionIsFinal=['AUTO_APPROVED','APPROVED','AUTO_REJECTED','REJECTED'].includes(decisionStatus.toUpperCase());
 return <div className="icp-shell">
  <header className="icp-header">
   <div className="icp-objectline"><span className="icp-label">INVOICE</span><span className={`icp-state ${resultTone(decisionStatus)}`}>{human(decisionStatus)}</span></div>
   <h2>{text(invoice.invoice_number,'Invoice')}</h2>
   <div className="icp-subject">{context?.vendor??'Vendor not identified'} <span>·</span> {money(invoice.total,invoice.currency)} <span>·</span> {poNumber}</div>
   <div className="icp-meta">Invoice {date(invoice.invoice_date)} <span>·</span> Received {date(invoice.received_at,true)}</div>
  </header>
  <nav className="icp-rail" aria-label="Invoice peek sections">{[['document','01','Document'],['match','02','Match & verify'],['decision','03','Decision']].map(([key,n,label])=><button type="button" key={key} className={active===key?'active':''} onClick={()=>navigate(key)}><span>{n}</span>{label}</button>)}</nav>
  <div className="icp-sections">
   <section id="invoice-peek-document" className="icp-section" onMouseEnter={()=>setActive('document')}>
    <div className="icp-section-title"><span>01</span><div><h3>Document</h3><p>Structured invoice details</p></div><span className="icp-ai-tag">{extraction.status?'AI EXTRACTED':'SOURCE RECORD'}</span></div>
    <article className="icp-paper" aria-label="Structured invoice document">
     <header><div><strong>{context?.vendor??'Vendor not identified'}</strong><small>Supplier invoice</small></div><div><span>INVOICE</span><strong>{text(invoice.invoice_number,'—')}</strong></div></header>
     <div className="icp-paper-dates"><div><small>INVOICE DATE</small><strong>{date(invoice.invoice_date)}</strong></div><div><small>DUE DATE</small><strong>{date(invoice.due_date)}</strong></div><div><small>PURCHASE ORDER</small><strong>{poNumber}</strong></div></div>
     <div className="icp-paper-lines"><div className="icp-paper-head"><span>DESCRIPTION</span><span>QTY</span><span>UNIT PRICE</span><span>AMOUNT</span></div>
      {lines.slice(0,6).map((line,index)=><div className="icp-paper-line" key={String(line.id??index)}><strong>{text(line.description??line.item_code,`Line ${index+1}`)}</strong><span>{text(line.quantity)}</span><span>{money(line.unit_price,invoice.currency)}</span><b>{money(line.amount??line.line_total,invoice.currency)}</b></div>)}
      {!lines.length&&<p className="icp-paper-empty">No invoice lines are stored for this record.</p>}
      {lines.length>6&&<p className="icp-paper-empty">+ {lines.length-6} more lines</p>}
     </div>
     <dl className="icp-paper-totals"><div><dt>Subtotal</dt><dd>{money(invoice.subtotal,invoice.currency)}</dd></div><div><dt>Tax</dt><dd>{money(invoice.tax,invoice.currency)}</dd></div><div className="total"><dt>Total</dt><dd>{money(invoice.total,invoice.currency)}</dd></div></dl>
    </article>
    <div className="icp-source"><span><strong>Original document</strong><small>{sourceDocument} · Immutable source file</small></span>{original.id?<a href={`/api/invoices/${id}/document`} target="_blank" rel="noreferrer">View original ↗</a>:<span className="icp-muted">Unavailable</span>}</div>
    <div className="icp-extraction"><div><strong>Extraction</strong><span className="icp-ai-tag">AI</span></div><p>{extraction.overall_confidence!==undefined?`${(Number(extraction.overall_confidence)<=1?Number(extraction.overall_confidence)*100:Number(extraction.overall_confidence)).toFixed(1)}% confidence`:text(context?.confidence,'Confidence not recorded')}</p><div className="icp-extraction-fields">{[['Vendor',normalized.vendorName??normalized.vendor],['PO',normalized.poNumber],['Invoice date',normalized.invoiceDate],['Total',normalized.total]].filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=><span key={String(k)}><small>{String(k)}</small><strong>{extractedText(v)}</strong></span>)}</div></div>
   </section>
   <section id="invoice-peek-match" className="icp-section" onMouseEnter={()=>setActive('match')}>
    <div className="icp-section-title"><span>02</span><div><h3>Match & verify</h3><p>Saved deterministic checks and linked records</p></div><span className={`icp-state ${resultTone(match.status)}`}>{human(match.status)}</span></div>
    <div className="icp-relationship"><div><small>INVOICE</small><strong>{text(invoice.invoice_number,'Invoice')}</strong><b>{money(invoice.total,invoice.currency)}</b></div><span aria-hidden="true">→</span><div><small>PURCHASE ORDER</small><strong>{poNumber}</strong><b>{data.related.find(r=>r.type==='purchase_order')?.label===poNumber?'Linked record':po.status?human(po.status):'Unlinked reference'}</b></div><span aria-hidden="true">→</span><div><small>GOODS RECEIPT</small><strong>{data.related.filter(r=>r.type==='goods_receipt').map(r=>r.label).join(', ')||'Not linked'}</strong><b>{data.related.some(r=>r.type==='goods_receipt')?'Linked record':'No receipt found'}</b></div></div>
    <div className="icp-checklist">{checks.length?checks.slice(0,10).map((check,index)=><Checkpoint key={`${check.check}-${index}`} label={human(check.check)} status={check.status} detail={check.reason??(check.variancePercent!==undefined&&check.variancePercent!==null?`${check.variancePercent}% variance`:undefined)}/>):<p className="icp-empty">No saved validation checks. Matching evidence will appear here after evaluation.</p>}</div>
    {vendor.status!==undefined&&vendor.status!==null&&vendor.status!==''&&<div className="icp-inline-note"><strong>Vendor match</strong><span className={`icp-state ${resultTone(vendor.status)}`}>{human(vendor.status)}</span>{vendor.reason!==undefined&&vendor.reason!==null&&<small>{String(vendor.reason)}</small>}</div>}
   </section>
   <section id="invoice-peek-decision" className="icp-section" onMouseEnter={()=>setActive('decision')}>
    <div className="icp-section-title"><span>03</span><div><h3>Decision</h3><p>Policy outcome and next step</p></div></div>
    <div className={`icp-decision ${resultTone(decisionStatus)}`}><span className="icp-decision-mark">{resultTone(decisionStatus)==='good'?'✓':resultTone(decisionStatus)==='bad'?'×':decisionIsFinal?'!':'…'}</span><div><span className="icp-label">{decisionIsFinal?'POLICY EVALUATED':'HUMAN INPUT'}</span><h4>{human(decisionStatus)}</h4><p>{decisionSummary}</p></div></div>
    <div className="icp-decision-meta"><span><small>POLICY VERSION</small><strong>{text(decision.policy_version,'Not recorded')}</strong></span><span><small>RESPONSIBLE</small><strong>{members.find(member=>member.workos_user_id===data.assignment?.assignee)?.email??(data.assignment?.assignee?'Assigned':'Unassigned')}</strong></span></div>
    <div className="icp-truth"><span>Source document</span><i>→</i><span>Extracted data</span><i>→</i><span>Verified controls</span><i>→</i><strong>Policy decision</strong></div>
   </section>
  </div>
  <footer className="icp-footer"><span>{human(decisionStatus)} <small>· {text(data.assignment?.assignee,'No owner')}</small></span><a className="button primary" href={`/invoices/${id}`}>Open full invoice 360 ↗</a></footer>
 </div>
}
