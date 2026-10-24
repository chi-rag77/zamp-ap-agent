'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function AgentRunControls({invoiceId,runId,status}:{invoiceId?:string;runId?:string;status?:string}){
 const router=useRouter();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(path:string){setBusy(true);setError('');try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:invoiceId?JSON.stringify({invoiceId}):'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error??'Request failed');if(data.runId)router.push(`/agent/runs/${data.runId}`);router.refresh()}catch(caught){setError(caught instanceof Error?caught.message:'Request failed')}finally{setBusy(false)}}
 return <span className="heading-actions">{invoiceId&&<button type="button" className="button button-primary" disabled={busy} onClick={()=>submit('/api/agent/runs')}>{busy?'Starting…':'Run agent'}</button>}{runId&&['QUEUED','RUNNING','WAITING'].includes(status??'')&&<button type="button" className="button" disabled={busy} onClick={()=>submit(`/api/agent/runs/${runId}/cancel`)}>Cancel</button>}{runId&&['FAILED','CANCELLED'].includes(status??'')&&<button type="button" className="button" disabled={busy} onClick={()=>submit(`/api/agent/runs/${runId}/retry`)}>Retry</button>}{runId&&<button type="button" className="button" onClick={()=>router.refresh()}>Refresh</button>}{error&&<span role="alert" className="error-text">{error}</span>}</span>;
}
