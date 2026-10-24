'use client';
import {useState} from 'react';
export function EmailActions({configured,showFixture=true}:{configured:boolean;showFixture?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(path:string){
  setBusy(true);setMessage('');
  try{
   if(path.endsWith('test-ingest')){
    const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error??'Request failed');
    setMessage(`Fixture processed: ${data.status}`);
   }else{
    let processed=0,hasMore=true;
    while(hasMore){
     const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
     const data=await response.json();
     if(!response.ok)throw new Error(data.error??'Request failed');
     processed+=data.processed??0;
     hasMore=Boolean(data.hasMore);
     setMessage(hasMore?`Reading mailbox in batches… ${processed} messages handled so far.`:`Mailbox sync completed: ${processed} message(s)`);
    }
   }
   window.location.reload();
  }catch(error){setMessage(error instanceof Error?error.message:'Request failed');}
  finally{setBusy(false);}
 }
 return <div className="heading-actions" style={{marginBottom:16}}>{!configured&&<a className="button button-primary" href="/api/email/gmail/connect">Connect Gmail</a>}<button className="button button-primary" disabled={!configured||busy} onClick={()=>run('/api/email/sync')}>{busy?'Syncing Gmail…':'Sync Gmail now'}</button>{showFixture&&<button className="button" disabled={busy} onClick={()=>run('/api/email/test-ingest')}>Test with fixture</button>}{message&&<span style={{fontSize:12,color:'#5b6b83'}}>{message}</span>}</div>
}
export function ReprocessButton({intakeId}:{intakeId:string}){const [busy,setBusy]=useState(false),[error,setError]=useState('');async function retry(){setBusy(true);setError('');try{const response=await fetch(`/api/email/intakes/${intakeId}/reprocess`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error??'Reprocess failed');window.location.reload()}catch(failure){setError(failure instanceof Error?failure.message:'Reprocess failed');setBusy(false)}}return <><button className="button" disabled={busy} onClick={retry}>{busy?'Processing…':'Reprocess'}</button>{error&&<small style={{display:'block',color:'#a74749'}}>{error}</small>}</>}
