'use client';
import {useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {Icon} from './shell';
import {AgentRunControls} from './agent-run-controls';
import type {InvoiceValidationResult, ValidationCheck} from '@zamp/matching';
import type {PORow} from '../lib/data';
import './invoice-case.css';
import {InvoiceOverview,InvoicePanel} from './invoice-overview';
import './invoice-overview.css';

export type PolicyDecisionView={decision:string;reason_code:string|null;summary:string;policy_version:string|null;evidence:Array<{check:string;description:string;expected?:unknown;actual?:unknown;threshold?:number;status?:'PASS'|'FAIL'|'WARNING'|'SKIPPED'}>;blockers:string[];warnings:string[];recommended_action:string|null;created_at:string;validation_run_id:string|null};
export type CaseLine={id:string;line_number?:number;description:string;sku:string|null;quantity:string;unit_price:string;tax_rate?:string|null;amount:string;metadata?:Record<string,unknown>|null};
export type POLine={id:string;description:string;sku:string|null;quantity:string;unit_price:string;amount:string;received_quantity:string};
export type CaseStep={id:string;name:string;step_type:string;status:string;duration_ms:number|null};
export type CaseDocument={id:string;filename:string;page_count:number|null};
export type CaseReceipt={id:string;grn_number:string;receipt_date:string;status:string};
export type CaseReceiptLine={goods_receipt_id:string;po_line_id:string;accepted_quantity:string};
type Tab='overview'|'po'|'decision';
const label=(value:string|null|undefined)=>value?.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())??'—';
const num=(value:string|number|null|undefined)=>value===null||value===undefined?'—':new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Number(value));
const cash=(value:string|number|null|undefined,currency:string|null|undefined)=>{
 if(value===null||value===undefined)return '—';
 const code=currency?.trim().toUpperCase()||'INR';
 try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:code,minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value))}
 catch{return `${num(value)} ${code}`}
};
const fmtDate=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'—';
const fmtTime=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—';
const tone=(status:string|null|undefined)=>status==='PASS'||status==='MATCHED'||status==='APPROVED'||status==='AUTO_APPROVED'||status==='COMPLETED'||status==='NO_DUPLICATE'?'good':status==='FAIL'||status==='NOT_MATCHED'||status==='REJECTED'||status==='AUTO_REJECTED'?'bad':'warn';
const CHECK_LABELS:Record<string,string>={VENDOR_MATCH:'Vendor identity',PO_MATCH:'Purchase order reference',PO_VENDOR_MATCH:'PO vendor identity',CURRENCY_MATCH:'Currency',PO_BILLING_AMOUNT:'PO balance',LINE_MATCH:'Line items',LINE_AMOUNT_MATCH:'Line amount',QUANTITY_MATCH:'Quantity variance',PRICE_MATCH:'Price variance',TAX_RATE_MATCH:'Tax rate',TAX_MATCH:'Tax total',TAX_COMPONENT_MATCH:'Tax component',SUBTOTAL_MATCH:'Subtotal',TOTAL_MATCH:'Invoice total',DUPLICATE_CHECK:'Duplicate check',GRN_QUANTITY_MATCH:'Goods receipt quantity'};
const checkName=(check:string)=>CHECK_LABELS[check.toUpperCase()]??label(check).replaceAll('Po ','PO ').replaceAll('Grn ','GRN ');
function Pill({children,status}:{children:React.ReactNode;status?:string|null}){return <span className={`ic-pill ${tone(status)}`}>{children}</span>}
function Card({children,className=''}:{children:React.ReactNode;className?:string}){return <section className={`ic-card ${className}`}>{children}</section>}

export function InvoiceCase({invoiceId,number,vendor,po,poId,availablePurchaseOrders,billTo,shipTo,amount,subtotal,tax,currency,date,dueDate,createdAt,confidence,status,decision,policyDecision,approvalRuleName,approvalRequestId,validation,lines,poLines,purchaseOrder,purchaseOrderVendor,receipts,receiptLines,steps,document,extractionStatus,extracted,source,vendorCode,invoiceDateRaw,dueDateRaw,updatedAt}:{invoiceId:string;number:string;vendor:string;po:string;poId:string|null;availablePurchaseOrders:(PORow&{vendorName:string|null})[];billTo:Record<string,unknown>|null;shipTo:Record<string,unknown>|null;amount:string;subtotal:string;tax:string;currency:string|null;date:string;dueDate:string;createdAt:string;confidence:string;status:string;decision:string|null;policyDecision:PolicyDecisionView|null;approvalRuleName:string|null;approvalRequestId:string|null;validation:InvoiceValidationResult|null;lines:CaseLine[];poLines:POLine[];purchaseOrder:PORow|null;purchaseOrderVendor:string|null;receipts:CaseReceipt[];receiptLines:CaseReceiptLine[];steps:CaseStep[];document:CaseDocument|null;extractionStatus:string|null;extracted:Record<string,unknown>|null;source:string;vendorCode:string|null;invoiceDateRaw:string|null;dueDateRaw:string|null;updatedAt:string}){
  const router=useRouter(),params=useSearchParams();
  const queryTab=params.get('tab');
  const [tab,setTab]=useState<Tab>(queryTab==='po'||queryTab==='decision'?queryTab:'overview');
  const [editRequested,setEditRequested]=useState(false);
  const [panel,setPanel]=useState<'activity'|'chat'|null>(null);
  const [evaluating,setEvaluating]=useState(false),[evaluationError,setEvaluationError]=useState(''),[cancellingApproval,setCancellingApproval]=useState(false);
  async function cancelApproval(){if(!approvalRequestId||!window.confirm('Cancel this approval so the invoice can be corrected?'))return;setCancellingApproval(true);setEvaluationError('');try{const response=await fetch(`/api/approvals/requests/${approvalRequestId}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedInvoiceUpdatedAt:updatedAt})});const body=await response.json();if(!response.ok)throw new Error(body.error??'Approval could not be cancelled');router.refresh()}catch(error){setEvaluationError(error instanceof Error?error.message:'Approval could not be cancelled')}finally{setCancellingApproval(false)}}
  const original=`/api/ui/invoices/${invoiceId}/original`;
  function selectTab(next:Tab){setTab(next);window.history.replaceState(null,'',`${window.location.pathname}?tab=${next}`)}
  async function evaluate(){setEvaluating(true);setEvaluationError('');try{const response=await fetch(`/api/ui/invoices/${invoiceId}/evaluate`,{method:'POST'});const body=await response.json();if(!response.ok)throw new Error(body.error??'Evaluation failed');router.refresh();selectTab('decision')}catch(error){setEvaluationError(error instanceof Error?error.message:'Evaluation failed')}finally{setEvaluating(false)}}
  function downloadDecisionRecord(){
    const record={invoice:{id:invoiceId,number,vendor,purchaseOrder:purchaseOrder?.po_number??(po||null),amount,currency,status:headerStatus,updatedAt},decision:{outcome:policyStatus,summary:decisionSummary,policy:policyName,version:policyDecision?.policy_version??null,recordedAt:policyDecision?.created_at??null,evidence:policyChecks,blockers:policyDecision?.blockers??[],warnings:policyDecision?.warnings??[]},matching:{status:validation?.status??'NOT_RUN',summary:validation?.summary??null,checks:validation?.checks??[],lineMatches:validation?.lineMatches??[]}};
    const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=window.document.createElement('a');
    link.href=url;link.download=`${number}-decision-record.json`;window.document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const receipt=receipts[0];
  const receivedFor=(poLineId:string)=>receiptLines.filter(line=>line.po_line_id===poLineId).reduce((sum,line)=>sum+Number(line.accepted_quantity),0);
  const receivedTotal=receiptLines.reduce((sum,line)=>sum+Number(line.accepted_quantity),0);
  const totalChecks=validation?validation.summary.passed+validation.summary.failed+validation.summary.warnings+validation.summary.skipped:0;
  const pendingApproval=status==='PENDING APPROVAL',humanReview=status==='NEEDS REVIEW';
  const policyStatus=pendingApproval?'PENDING_APPROVAL':humanReview?'NEEDS_REVIEW':policyDecision?.decision??decision??'NOT_EVALUATED';
  const decisionTone=policyStatus==='AUTO_APPROVED'?'approved':policyStatus==='AUTO_REJECTED'?'rejected':'review';
  const headerStatus=policyStatus==='AUTO_APPROVED'?'APPROVED':policyStatus==='AUTO_REJECTED'?'REJECTED':status;
  const policyChecks=policyDecision?.evidence??[];
  const legacyPolicyEvidence=policyChecks.length===1&&policyChecks[0].check==='POLICY'&&policyChecks[0].description==='All configured conditions passed';
  const keyChecks:ValidationCheck[]=validation?.checks??[];
  const matchCheckReason=(check:ValidationCheck)=>{
    if(check.reason)return check.reason;
    const key=check.check.toUpperCase();
    const actual=check.actual===null||check.actual===undefined?null:String(check.actual);
    const expected=check.expected===null||check.expected===undefined?null:String(check.expected);
    if(key==='VENDOR_MATCH')return validation?.vendor.status==='MATCHED'?`${vendor} matches the vendor master and purchase order.`:'Vendor identity could not be verified against the vendor master.';
    if(key==='PO_MATCH')return purchaseOrder?`${purchaseOrder.po_number} was retrieved from the procurement records.`:'No matching purchase order was found in the procurement records.';
    if(key==='PO_VENDOR_MATCH')return purchaseOrder?`${purchaseOrderVendor??'The linked vendor'} is the vendor recorded on this purchase order.`:'Purchase order ownership could not be verified.';
    if(key==='CURRENCY_MATCH')return actual&&expected?`Invoice currency ${actual} matches PO currency ${expected}.`:'Currency could not be compared with a purchase order.';
    if(key==='LINE_MATCH')return `${validation?.lineMatches.filter(item=>item.status==='MATCHED').length??0} of ${validation?.lineMatches.length??0} invoice lines matched a PO line.`;
    if(key==='LINE_AMOUNT_MATCH')return actual&&expected?`Invoice line amount ${cash(actual,currency)} is compared with the quantity × unit-price calculation ${cash(expected,currency)}.`:'Line amount could not be verified.';
    if(key==='QUANTITY_MATCH'||key==='GRN_QUANTITY_MATCH')return actual&&expected?`Invoiced quantity ${num(actual)} ${key==='GRN_QUANTITY_MATCH'?'does not exceed accepted receipt quantity':'is checked against remaining PO quantity'} ${num(expected)}.`:'Quantity could not be verified against procurement records.';
    if(key==='PRICE_MATCH')return actual&&expected?`Invoice unit price ${cash(actual,currency)} is compared with PO unit price ${cash(expected,currency)}${check.variancePercent===null||check.variancePercent===undefined?'':` (${check.variancePercent.toFixed(2)}% variance)`}.`:'Unit price could not be verified against the PO.';
    if(key==='TAX_RATE_MATCH')return actual&&expected?`Invoice tax rate ${num(actual)}% is compared with the PO rate ${num(expected)}%.`:'Tax rate could not be compared with the PO.';
    if(key==='TAX_MATCH'||key==='TAX_COMPONENT_MATCH')return actual&&expected?`Invoice tax ${cash(actual,currency)} is compared with the calculated tax ${cash(expected,currency)}.`:'Tax could not be verified from the available rate breakdown.';
    if(key==='SUBTOTAL_MATCH')return actual&&expected?`Invoice subtotal ${cash(actual,currency)} is compared with the sum of line amounts ${cash(expected,currency)}.`:'Subtotal could not be verified against invoice lines.';
    if(key==='TOTAL_MATCH')return actual&&expected?`Invoice total ${cash(actual,currency)} is reconciled against subtotal, tax and adjustments (${cash(expected,currency)}).`:'Invoice total could not be reconciled.';
    if(key==='PO_BILLING_AMOUNT')return actual&&expected?`Invoice value ${cash(actual,currency)} is compared with remaining PO value ${cash(expected,currency)}.`:'Remaining purchase order value could not be verified.';
    if(key==='DUPLICATE_CHECK')return validation?.duplicate.status==='NO_DUPLICATE'?'No earlier invoice with the same vendor and purchase order was found.':'Duplicate status could not be confirmed.';
    const facts=[actual?`Actual ${actual}`:null,expected?`Expected ${expected}`:null,check.variancePercent!==undefined&&check.variancePercent!==null?`${check.variancePercent.toFixed(2)}% variance`:null].filter(Boolean);
    return facts.length?facts.join(' · '):'This control was evaluated against the saved invoice and procurement records.';
  };
  const evidenceValue=(item:PolicyDecisionView['evidence'][number],field:'actual'|'expected')=>{
    const value=item[field];
    if(value===undefined||value===null)return '—';
    const key=item.check.toUpperCase();
    if(/PRICE|AMOUNT|SUBTOTAL|TOTAL|TAX/.test(key)&&typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value))return cash(value,currency);
    if(/QUANTITY/.test(key)&&typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value))return num(value);
    if(typeof value==='number')return Number.isInteger(value)?String(value):String(Number(value.toFixed(2)));
    return String(value);
  };
  const evidenceStatus=(check:string,description:string):string|undefined=>{
    if(check==='TWO_WAY_MATCH')return validation?.twoWayMatch.status;
    if(check==='THREE_WAY_MATCH')return validation?.threeWayMatch.status;
    const candidates=keyChecks.filter(item=>item.check===check);
    return candidates.find(item=>item.reason===description)?.status??candidates.find(item=>item.status==='FAIL')?.status??candidates[0]?.status;
  };
  const decisionNarrative=[
    validation?.purchaseOrder.status==='MATCHED'?`${validation.purchaseOrder.poNumber??po} was found and matched to the invoice.`:validation?.purchaseOrder.reason??null,
    validation?.vendor.status==='MATCHED'?`${vendor} matched the vendor master.`:validation?.vendor.reason??null,
    validation?`${validation.lineMatches.filter(item=>item.status==='MATCHED').length} of ${validation.lineMatches.length} invoice lines matched the purchase order.`:null,
    receipt?`${receipt.grn_number} records ${num(receivedTotal)} units received on ${fmtDate(receipt.receipt_date)}.`:'No goods receipt is linked to this case.',
    validation?.duplicate.status==='NO_DUPLICATE'?'The duplicate check found no matching earlier invoice.':validation?.duplicate.reason??null,
  ].filter((item):item is string=>Boolean(item));
  const nextStepSummary=pendingApproval?'The invoice is waiting for an assigned approver.':humanReview?'Resolve the review issues, then record an approval or rejection.':policyStatus==='AUTO_APPROVED'||policyStatus==='APPROVED'?'The invoice is approved. Payment progress is tracked separately.':policyStatus==='AUTO_REJECTED'||policyStatus==='REJECTED'?'The invoice is rejected. No approval action is pending.':validation?'Evaluate the policy to record the decision.':'Run matching checks before evaluating the policy.';
  const policyName=approvalRuleName??'Standard PO Invoice Policy';
  const policyValue=(pattern:RegExp)=>{const value=policyChecks.find(item=>pattern.test(`${item.check} ${item.description}`))?.expected;return value===undefined||value===null?'—':String(value)};
  const confidenceThreshold=policyChecks.find(item=>/confidence/i.test(`${item.check} ${item.description}`))?.expected;
  const confidenceThresholdText=confidenceThreshold===undefined?null:(String(confidenceThreshold).includes('%')?String(confidenceThreshold).replace(/^≥\s*/, '≥ '):`≥ ${String(confidenceThreshold)}%`);
  const decisionSummary=policyStatus==='AUTO_APPROVED'||policyStatus==='APPROVED'
    ?`${number} matched ${purchaseOrder?.po_number??'its procurement records'} with ${validation?.summary.passed??0} of ${totalChecks} controls passing. The decision was recorded under ${policyName}.`
    :policyDecision?.summary??(
    policyStatus==='AUTO_REJECTED'||policyStatus==='REJECTED'
      ?`${number} was rejected under ${policyName}. ${policyDecision?.blockers?.length?`The recorded policy blockers are ${policyDecision.blockers.map(checkName).join(', ')}.`:'See the evidence below for the recorded outcome.'}`
      :humanReview?'A human review is required before this invoice can be completed.':validation?`${validation.summary.passed} of ${totalChecks} controls passed. ${nextStepSummary}`:'Matching evidence is not yet available.');
  const workflowStages=[
    {key:'source',label:'Invoice overview',detail:'Document rendering · every field editable',icon:'invoice',done:Boolean(document),tab:'overview' as const,badge:document?'Tax invoice':'Missing document'},
    {key:'match',label:'Match & verify',detail:'Extraction, matching and controls',icon:'shield',done:Boolean(validation),tab:'po' as const,badge:validation?`${validation.summary.passed}/${totalChecks} controls`:'Not run'},
    {key:'decision',label:'Decision',detail:'Policy outcome, evidence and actions',icon:'policy',done:Boolean(policyDecision)||['APPROVED','REJECTED','AUTO_APPROVED','AUTO_REJECTED'].includes(headerStatus),tab:'decision' as const,badge:label(policyStatus)},
  ];
  const financialTruth=[
    {label:'Source document',state:document?'PASS':'WARNING'},
    {label:'Extracted data',state:extracted?'PASS':'WARNING'},
    {label:'Verified data',state:validation?(validation.status==='PASS'?'PASS':validation.status==='FAIL'?'FAIL':'WARNING'):'PENDING'},
    {label:'Policy decision',state:policyDecision?policyStatus==='AUTO_REJECTED'||policyStatus==='REJECTED'?'FAIL':policyStatus==='NEEDS_REVIEW'?'WARNING':'PASS':'PENDING'},
    {label:'Final state',state:['APPROVED','AUTO_APPROVED','REJECTED','AUTO_REJECTED'].includes(headerStatus)?headerStatus.includes('REJECTED')?'FAIL':'PASS':'PENDING'},
  ];
  const statusMark=(state:string)=>state==='PASS'?'✓':state==='FAIL'?'!':state==='WARNING'?'!':'·';
  return <div className="ic-page">
    <header className="invoice-record-header"><div className="invoice-record-main"><nav className="invoice-record-breadcrumb" aria-label="Breadcrumb"><Link href="/invoices">← Invoices</Link><span>/</span><span>{number}</span></nav><div className="invoice-record-identity"><div className="ic-title"><h1>{number}</h1><Pill status={headerStatus}>● {headerStatus}</Pill><strong className="invoice-header-amount">{amount}</strong>{purchaseOrder&&<Link className="invoice-po-chip" href={`/objects/purchase_order/${purchaseOrder.id}`}>◈ {po}</Link>}</div><p>{vendor} · {document?.filename??extractionStatus??'Awaiting document'}</p></div></div><div className="invoice-record-actions"><button className="ic-button invoice-edit-top" onClick={()=>{selectTab('overview');setEditRequested(true)}}><Icon name="invoice" size={15}/> Edit invoice</button><button className="ic-button" onClick={()=>setPanel('activity')}><Icon name="audit" size={15}/> Activity</button><button className="ic-button" onClick={()=>setPanel('chat')}><Icon name="chat" size={15}/> Chat</button><details className="invoice-more"><summary className="ic-button">More <span aria-hidden="true">⌄</span></summary><div>{!['APPROVED','REJECTED','AUTO_APPROVED','AUTO_REJECTED'].includes(headerStatus)&&<AgentRunControls invoiceId={invoiceId}/>}<Link className="ic-button" href="/exceptions">Request review</Link>{pendingApproval&&approvalRequestId&&<button className="ic-button" disabled={cancellingApproval} onClick={()=>void cancelApproval()}>{cancellingApproval?'Cancelling…':'Cancel approval to edit'}</button>}{document&&<a className="ic-button" href={original} target="_blank" rel="noreferrer">View original ↗</a>}</div></details></div></header>
    <div className="invoice-case-body"><nav className="ic-tabs invoice-case-tabs invoice-stage-tabs" aria-label="Invoice case sections"><div>{workflowStages.map(stage=><button type="button" aria-current={tab===stage.tab?'page':undefined} className={`${tab===stage.tab?'active':''} ${stage.done?'is-complete':''}`} onClick={()=>selectTab(stage.tab)} key={stage.key}><span className="invoice-stage-icon"><Icon name={stage.icon} size={16}/></span><span className="invoice-stage-copy"><strong><small>{stage.key==='source'?'01':stage.key==='match'?'02':'03'}</small>{stage.label}</strong><small>{stage.detail}</small></span><span className="invoice-stage-badge">{stage.badge}</span></button>)}</div></nav>
    <div className="invoice-financial-truth" aria-label="Financial truth workflow"><strong>FINANCIAL TRUTH</strong>{financialTruth.map((item,index)=><div className={`truth-step truth-${item.state.toLowerCase()}`} key={item.label}><span aria-hidden="true">{statusMark(item.state)}</span><span>{item.label}</span>{index<financialTruth.length-1&&<i aria-hidden="true"/>}</div>)}</div>
    {tab==='overview'&&<InvoiceOverview editRequested={editRequested} onEditHandled={()=>setEditRequested(false)} onOpenSection={section=>selectTab(section)} invoiceId={invoiceId} number={number} vendor={vendor} vendorCode={vendorCode} po={po} poId={poId} availablePurchaseOrders={availablePurchaseOrders} billTo={billTo} shipTo={shipTo} amount={amount} subtotal={subtotal} tax={tax} currency={currency} date={date} dueDate={dueDate} createdAt={createdAt} status={headerStatus} policyDecision={policyDecision} validation={validation} confidence={confidence} lines={lines} purchaseOrder={purchaseOrder} receipts={receipts} document={document} extracted={extracted} source={source} invoiceDateRaw={invoiceDateRaw} dueDateRaw={dueDateRaw} updatedAt={updatedAt}/>}
    {tab==='po'&&<div className="ic-match-view">
      <Card className="ic-match-surface">
        <div className="ic-match-heading"><div><span className="ic-section-index">02</span><div><h2>Match &amp; verify</h2><p>What the system extracted and verified against your financial records</p></div></div><div className="ic-match-heading-badges"><Pill status={validation?.status}>{validation?`${validation.summary.passed} of ${totalChecks} controls passed`:'Matching not run'}</Pill></div></div>
        <section className="ic-document-chain"><p className="ic-match-kicker">Match chain</p><div className="ic-chain-flow"><div className="ic-chain-record is-invoice"><span>INVOICE</span><strong>{number}</strong><em>{amount}</em><small>{lines.length} line item{lines.length===1?'':'s'} · {vendor}</small></div><span className="ic-chain-connector" aria-hidden="true">→</span><div className="ic-chain-record"><span>PURCHASE ORDER</span>{purchaseOrder?<Link href={`/objects/purchase_order/${purchaseOrder.id}`}>{purchaseOrder.po_number}</Link>:<strong>{po||'No purchase order linked'}</strong>}<em>{purchaseOrder?cash(purchaseOrder.total,purchaseOrder.currency):'—'}</em><small>{purchaseOrder?`${purchaseOrderVendor??vendor} · ${label(purchaseOrder.status)}`:'No matched purchase order'}</small></div><span className="ic-chain-connector" aria-hidden="true">→</span><div className="ic-chain-record"><span>GOODS RECEIPT</span>{receipt?<Link href={`/objects/goods_receipt/${receipt.id}`}>{receipt.grn_number}</Link>:<strong>No receipt linked</strong>}<em>{receipt?`${num(receivedTotal)} received`:'—'}</em><small>{receipt?`${label(receipt.status)} · ${fmtDate(receipt.receipt_date)}`:'No goods receipt is linked to this purchase order'}</small></div></div></section>
        <section className="ic-match-checks"><div className="ic-match-subhead"><div><h3>Control checkpoints</h3></div><span>{validation?`${validation.summary.passed}/${totalChecks} passed`:''}</span></div>
          {validation?.checks.length?validation.checks.map((check,index)=>{const status=check.status;return <div className="ic-match-check" key={`${check.check}-${index}`}><span className={`ic-match-check-icon ${tone(status)}`}><Icon name={tone(status)==='good'?'check':tone(status)==='bad'?'close':'alert'} size={10}/></span><div><strong>{checkName(check.check)}</strong><small>{matchCheckReason(check)}</small></div><span className={`ic-check-result ${tone(status)}`}>{status==='PASS'?'VERIFIED':label(status).toUpperCase()}</span></div>}):<p className="ic-match-empty">Run matching to see vendor, PO, line, quantity, price, tax, total and duplicate checks.</p>}
        </section>
        <section className="ic-match-lines"><div className="ic-match-subhead"><div><h3>Line reconciliation</h3></div></div><div className="ic-table-wrap"><table className="ic-data-table"><thead><tr>{['LINE','INVOICED','ORDERED','RECEIVED','UNIT PRICE','VARIANCE'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{lines.length?lines.map((line,index)=>{const result=validation?.lineMatches.find(item=>item.invoiceLineId===line.id);const poLine=poLines.find(item=>item.id===result?.poLineId);const priceCheck=validation?.checks.find(item=>item.check==='PRICE_MATCH'&&item.evidence.invoiceLineId===line.id);return <tr key={line.id}><td><strong>{line.description||`Line ${index+1}`}</strong><small>{line.sku??'Item code not provided'}</small></td><td>{num(line.quantity)}</td><td>{num(poLine?.quantity)}</td><td>{num(poLine?.id?receivedFor(poLine.id):undefined)}</td><td>{cash(line.unit_price,currency)}</td><td><span className={`ic-check-result ${tone(priceCheck?.status??result?.status)}`}>{priceCheck?.variancePercent==null?'—':`${priceCheck.variancePercent.toFixed(2)}%`}</span></td></tr>}):<tr><td colSpan={6} className="ic-match-empty">No invoice line items were extracted.</td></tr>}</tbody></table></div></section>
      </Card>
    </div>}
    {tab==='decision'&&<div className="ic-decision-view">
      <div className="ic-decision-page-head"><div><span className="ic-section-index">03</span><div><h2>Decision</h2><p>The policy outcome, the evidence behind it and what happens next</p></div></div><span>{policyName}{policyDecision?.policy_version?` v${policyDecision.policy_version}`:''}</span></div>
      <div className="ic-decision-layout">
        <div className="ic-decision-primary">
          <Card className={`ic-decision-summary is-${decisionTone}`}><div className="ic-decision-reference-hero"><div className="ic-decision-reference-mark"><span>{policyStatus==='AUTO_APPROVED'||policyStatus==='APPROVED'?'✓':policyStatus==='AUTO_REJECTED'||policyStatus==='REJECTED'?'×':'!'}</span></div><div><span className="ic-decision-outcome">{label(policyStatus)}</span><p>{pendingApproval?`The invoice passed automated checks and is waiting for a human decision${approvalRuleName?` under “${approvalRuleName}”`:''}.`:decisionSummary}</p><small>{policyName}{policyDecision?.policy_version?` v${policyDecision.policy_version}`:''} · {validation?.threeWayMatch.status==='PASS'?'3-way match':validation?.twoWayMatch.status==='PASS'?'2-way match':'match review'} · {fmtTime(policyDecision?.created_at??createdAt)} · ZAMP</small></div></div></Card>
          <Card className="ic-decision-evidence"><div className="ic-decision-card-head"><div><h3>Decision evidence</h3><p>{policyChecks.length||decisionNarrative.length} controls evaluated</p></div></div>{legacyPolicyEvidence&&<p className="ic-policy-refresh-note">This decision has summary-only evidence. Refresh the evaluation to show actual values and allowed limits.</p>}<div className="ic-table-wrap"><table className="ic-data-table"><thead><tr><th>CONTROL</th><th>ACTUAL</th><th>EXPECTED</th><th>RESULT</th></tr></thead><tbody>{policyChecks.length?policyChecks.map((item,index)=>{const result=item.status??evidenceStatus(item.check,item.description)??(policyDecision?.blockers.some(blocker=>blocker===item.check||blocker===item.description)?'FAIL':policyStatus==='AUTO_APPROVED'||policyStatus==='APPROVED'?'PASS':policyStatus==='AUTO_REJECTED'||policyStatus==='REJECTED'?'FAIL':undefined);return <tr key={`${item.check}-${index}`}><td><strong>{checkName(item.check)}</strong></td><td>{evidenceValue(item,'actual')}</td><td>{evidenceValue(item,'expected')}</td><td><Pill status={result}>{result?label(result):'RECORDED'}</Pill></td></tr>}):decisionNarrative.map((item,index)=><tr key={`${index}-${item}`}><td><strong>{item.split(' ').slice(0,3).join(' ')}</strong></td><td colSpan={2}>{item}</td><td><Pill status={policyStatus}>{label(policyStatus)}</Pill></td></tr>)}</tbody></table></div><div className="ic-decision-export-actions"><button className="ic-button" onClick={()=>setPanel('activity')}><Icon name="audit" size={13}/> View audit trail</button><button className="ic-button" onClick={downloadDecisionRecord}><Icon name="download" size={13}/> Download decision record</button>{validation&&<button className="ic-button" onClick={evaluate} disabled={evaluating}>{evaluating?'Evaluating…':'Re-run checks'}</button>}</div>{evaluationError&&<p className="ic-policy-error" role="alert">{evaluationError}</p>}</Card>
        </div>
        <aside className="ic-decision-sidebar">
          <Card className="ic-decision-side-card"><div className="ic-decision-card-head"><div><h3>Policy applied</h3></div><Icon name="policy" size={15}/></div><strong className="ic-decision-policy-name">{policyName}</strong><small>{policyDecision?.created_at?`Effective ${fmtDate(policyDecision.created_at)}`:'Policy version'} · {policyDecision?.policy_version??'Current'}</small><p>Price tolerance {policyValue(/price/i)} · quantity {policyValue(/quantity/i)}{confidenceThresholdText?` · extraction confidence ${confidenceThresholdText}`:''}</p><button className="ic-button ic-decision-policy-action" onClick={evaluate} disabled={!validation||evaluating}>{evaluating?'Evaluating…':policyDecision?'Refresh policy evidence':'Evaluate policy'}</button></Card>
          <Card className="ic-decision-side-card"><div className="ic-decision-card-head"><div><h3>Action verification</h3></div></div><strong className="ic-decision-policy-name">{policyStatus==='AUTO_APPROVED'||policyStatus==='APPROVED'?'Invoice marked payment-ready':policyStatus==='AUTO_REJECTED'||policyStatus==='REJECTED'?'Invoice rejected':pendingApproval?'Approval requested':'Decision pending'}</strong><small>{nextStepSummary}</small><ul className="ic-action-verification-list"><li><span>✓</span>Database updated</li><li><span>{policyDecision?'✓':'·'}</span>Approval {policyDecision?'recorded':'pending'}</li><li><span>✓</span>Payment queue updated</li><li><span>✓</span>Audit event created</li></ul></Card>
          <Card className="ic-decision-side-card"><div className="ic-decision-card-head"><div><h3>Activity</h3></div><button className="ic-link-button" onClick={()=>setPanel('activity')}>Full log <span>→</span></button></div><div className="ic-decision-activity">{steps.length?steps.slice(-4).reverse().map(step=><div key={step.id}><span className={`ic-activity-dot ${tone(step.status)}`}/><div><strong>{label(step.name)}</strong><small>{label(step.status)}{step.duration_ms?` · ${(step.duration_ms/1000).toFixed(1)} s`:''}</small></div></div>):<p>No processing activity recorded yet.</p>}</div></Card>
          <Card className="ic-decision-side-card"><div className="ic-decision-card-head"><div><h3>Discussion</h3></div><button className="ic-link-button" onClick={()=>setPanel('chat')}>Open chat <span>→</span></button></div><p className="ic-decision-discussion">Open the conversation for this invoice to review comments and coordinate next steps.</p></Card>
        </aside>
      </div>
    </div>}
  </div>{panel&&<InvoicePanel invoiceId={invoiceId} mode={panel} close={()=>setPanel(null)}/>}</div>;
}
