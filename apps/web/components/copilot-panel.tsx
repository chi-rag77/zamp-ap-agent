'use client';
import {useEffect,useRef,useState} from 'react';

type Trace={stage:string;status:'complete';detail:string};
type Turn={role:'user'|'assistant';content:string;trace?:Trace[];model?:string};
const starters=['Why does an invoice need review?','Show my invoice queue summary','Find a purchase order'];

export function CopilotPanel({open,onClose}:{open:boolean;onClose:()=>void}){
 const [turns,setTurns]=useState<Turn[]>([]);const [draft,setDraft]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const endRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(open)endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[turns,open,busy]);
 useEffect(()=>{if(!open)return;const handle=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)},[open,onClose]);
 async function send(value=draft){const text=value.trim();if(!text||busy)return;const history=[...turns,{role:'user' as const,content:text}];setTurns(history);setDraft('');setError('');setBusy(true);
  try{const response=await fetch('/api/copilot/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-10).map(({role,content})=>({role,content}))})});const payload=await response.json();if(!response.ok)throw new Error(payload.error??'Copilot is temporarily unavailable.');setTurns([...history,{role:'assistant',content:payload.answer,trace:payload.trace,model:payload.model}]);}
  catch(caught){setError(caught instanceof Error?caught.message:'Copilot is temporarily unavailable.');}finally{setBusy(false)}
 }
 if(!open)return null;
 return <div className="copilot-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="copilot-panel" role="dialog" aria-modal="true" aria-label="Zamp Copilot">
  <header className="copilot-header"><div className="copilot-mark">✦</div><div className="copilot-title"><strong>Zamp Copilot</strong><span>Answers grounded in your organization’s records</span></div><button className="icon-button copilot-close" onClick={onClose} aria-label="Close Copilot">×</button></header>
  <div className="copilot-context"><span className="copilot-live-dot"/> Active organization <b>·</b> Read only <span className="copilot-model">AI assistant</span></div>
  <div className="copilot-thread" aria-live="polite">{turns.length===0?<div className="copilot-welcome"><div className="copilot-welcome-icon">✦</div><h2>What can I help you understand?</h2><p>Ask about invoices, purchase orders, vendors, exceptions, or review decisions.</p><div className="copilot-starters">{starters.map(item=><button key={item} onClick={()=>void send(item)}>{item}<span>↗</span></button>)}</div><small>Copilot can look up records. Financial decisions remain controlled by Zamp’s rules.</small></div>:turns.map((turn,index)=><article className={`copilot-message ${turn.role}`} key={index}><div className="copilot-message-label">{turn.role==='user'?'You':'Zamp Copilot'}</div><p>{turn.content}</p>{turn.trace&&<details className="copilot-evidence"><summary>How this answer was prepared <span>{turn.trace.length} steps</span></summary>{turn.trace.map((step,i)=><div key={i}><i>✓</i><span><b>{step.stage}</b><small>{step.detail}</small></span></div>)}</details>}</article>)}{busy&&<div className="copilot-loading" role="status"><span className="copilot-spinner"/> Checking your organization’s records…</div>}{error&&<div className="copilot-error" role="alert">{error}</div>}<div ref={endRef}/></div>
  <form className="copilot-composer" onSubmit={event=>{event.preventDefault();void send()}}><textarea aria-label="Ask Zamp Copilot" placeholder="Ask about an invoice, PO, vendor…" rows={2} value={draft} maxLength={6000} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/><div><small>Enter to send · Shift+Enter for a new line</small><button className="button button-primary" disabled={!draft.trim()||busy}>Ask <span aria-hidden="true">↗</span></button></div></form>
 </section></div>
}
