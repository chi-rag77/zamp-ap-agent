'use client';
import {useEffect,useRef,useState} from 'react';
import {CopilotAnswer,type CopilotVisualization} from './copilot-answer';

type Trace={stage:string;status:'complete';detail:string};
type Turn={role:'user'|'assistant';content:string;trace?:Trace[];model?:string;visualization?:CopilotVisualization;suggestions?:string[]};
const starters=['Why does this invoice need review?','Show my invoice queue summary','How is the AI agent performing?','Explain the active approval policy'];

function currentPageContext(){
 const path=window.location.pathname;const uuid='([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
 const invoice=path.match(new RegExp(`/invoices/${uuid}`));if(invoice)return {type:'invoice' as const,id:invoice[1]};
 const object=path.match(new RegExp(`/objects/(purchase_order|vendor)/${uuid}`));if(object)return {type:object[1]==='purchase_order'?'purchase_order' as const:'vendor' as const,id:object[2]};
 const vendor=path.match(new RegExp(`/vendors/${uuid}`));if(vendor)return {type:'vendor' as const,id:vendor[1]};
 return undefined;
}

export function CopilotPanel({open,onClose}:{open:boolean;onClose:()=>void}){
 const [turns,setTurns]=useState<Turn[]>([]);const [draft,setDraft]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const endRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open)endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[turns,open,busy]);
 useEffect(()=>{if(!open)return;const handle=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)},[open,onClose]);
 async function send(value=draft){const text=value.trim();if(!text||busy)return;const history=[...turns,{role:'user' as const,content:text}];setTurns(history);setDraft('');setError('');setBusy(true);
  try{const response=await fetch('/api/copilot/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-10).map(({role,content})=>({role,content})),pageContext:currentPageContext()})});const payload=await response.json();if(!response.ok)throw new Error(payload.error??'Copilot is temporarily unavailable.');setTurns([...history,{role:'assistant',content:payload.answer,trace:payload.trace,model:payload.model,visualization:payload.visualization,suggestions:payload.suggestions}]);}
  catch(caught){setError(caught instanceof Error?caught.message:'Copilot is temporarily unavailable.');}finally{setBusy(false)}
 }
 if(!open)return null;
 return <div className="copilot-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="copilot-panel" role="dialog" aria-modal="true" aria-label="Zamp Copilot">
  <header className="copilot-header"><div className="copilot-mark">✦</div><div className="copilot-title"><strong>Zamp Copilot</strong><span>Ask questions, investigate records, and understand decisions</span></div>{turns.length>0&&<button className="icon-button" type="button" title="Start a new chat" aria-label="Start a new chat" onClick={()=>{setTurns([]);setError('');setDraft('')}}>↻</button>}<button className="icon-button copilot-close" onClick={onClose} aria-label="Close Copilot">×</button></header>
  <div className="copilot-context"><span className="copilot-live-dot"/> Connected to your organization <b>·</b> Read only <span className="copilot-model">AP assistant</span></div>
  <div className="copilot-thread" aria-live="polite">{turns.length===0?<div className="copilot-welcome"><div className="copilot-welcome-icon">✦</div><h2>What can I help you with?</h2><p>Ask naturally. I can investigate invoices, POs, vendors, policy, approval decisions, processing history, uploaded documents, and agent performance.</p><div className="copilot-starters">{starters.map(item=><button key={item} onClick={()=>void send(item)}>{item}<span>↗</span></button>)}</div><small>Answers use evidence from your organization. Financial decisions stay controlled by Zamp’s rules.</small></div>:turns.map((turn,index)=><article className={`copilot-message ${turn.role}`} key={index}><div className="copilot-message-label">{turn.role==='user'?'You':'Zamp Copilot'}</div>{turn.role==='assistant'?<CopilotAnswer content={turn.content} visualization={turn.visualization}/>:<p>{turn.content}</p>}{turn.role==='assistant'&&turn.suggestions?.length? <div className="copilot-followups" aria-label="Suggested follow-up questions"><span>Continue with</span>{turn.suggestions.map(suggestion=><button type="button" key={suggestion} disabled={busy} onClick={()=>void send(suggestion)}>{suggestion}<b aria-hidden="true">↗</b></button>)}</div>:null}{turn.trace&&<details className="copilot-evidence"><summary>How this answer was prepared <span>{turn.trace.length} steps</span></summary>{turn.trace.map((step,i)=><div key={i}><i>✓</i><span><b>{step.stage}</b><small>{step.detail}</small></span></div>)}</details>}</article>)}{busy&&<div className="copilot-loading" role="status"><span className="copilot-spinner"/> Searching records and preparing an evidence-backed answer…</div>}{error&&<div className="copilot-error" role="alert">{error}</div>}<div ref={endRef}/></div>
  <form className="copilot-composer" onSubmit={event=>{event.preventDefault();void send()}}><textarea aria-label="Ask Zamp Copilot" placeholder="Ask about an invoice, PO, vendor…" rows={2} value={draft} maxLength={6000} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/><div><small>Enter to send · Shift+Enter for a new line</small><button className="button button-primary" disabled={!draft.trim()||busy}>Ask <span aria-hidden="true">↗</span></button></div></form>
 </section></div>
}
