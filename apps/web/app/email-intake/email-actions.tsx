'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function EmailActions({configured,showFixture=true}:{configured:boolean;showFixture?:boolean}){
 const router=useRouter();const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[hasMore,setHasMore]=useState(false),[processedCount,setProcessedCount]=useState(0),[failedCount,setFailedCount]=useState(0);
 async function run(path:string){
  setBusy(true);setMessage('');
  try{
   if(path.endsWith('test-ingest')){
    const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const data=await response.json();
     if(!response.ok)throw new Error(data.error??'Request failed');
     setMessage(`Fixture processed: ${data.status}`);
     router.refresh();
   }else{
    let processed=processedCount,failed=failedCount,more=true,batches=0;
    // Each click processes at most three persisted batches. Large mailboxes
    // therefore cannot turn one browser action into an unbounded request loop.
    while(more&&batches<3){
     const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
     const data=await response.json();
     if(!response.ok)throw new Error(data.error??'Request failed');
     processed+=data.processed??0;
     failed+=data.failed??0;
     more=Boolean(data.hasMore);batches++;
     setProcessedCount(processed);setFailedCount(failed);setHasMore(more);
     setMessage(more?`Reading mailbox in bounded batches… ${processed} messages handled so far.`:`Mailbox sync completed: ${processed} message(s)${failed?`; ${failed} failed and remain in the review queue`:''}`);
    }
    setProcessedCount(processed);setFailedCount(failed);setHasMore(more);
    setMessage(more?`Processed ${processed} message(s). More mailbox pages remain; continue to resume safely.`:`Mailbox sync completed: ${processed} message(s)${failed?`; ${failed} failed and remain in the review queue`:''}`);
    router.refresh();
   }
  }catch(error){setMessage(error instanceof Error?error.message:'Request failed');}
  finally{setBusy(false);}
 }
 return <div className="heading-actions" style={{marginBottom:16}}>{!configured&&<a className="button button-primary" href="/api/email/gmail/connect">Connect Gmail</a>}<button className="button button-primary" disabled={!configured||busy} onClick={()=>run('/api/email/sync')}>{busy?'Syncing Gmail…':hasMore?`Continue Gmail sync · ${processedCount} handled`:'Sync Gmail now'}</button>{showFixture&&<button className="button" disabled={busy} onClick={()=>run('/api/email/test-ingest')}>Test with fixture</button>}{message&&<span style={{fontSize:12,color:'#5b6b83'}} role="status">{message}</span>}</div>
}
export function ReprocessButton({intakeId}:{intakeId:string}){const [busy,setBusy]=useState(false),[error,setError]=useState('');async function retry(){setBusy(true);setError('');try{const response=await fetch(`/api/email/intakes/${intakeId}/reprocess`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error??'Reprocess failed');window.location.reload()}catch(failure){setError(failure instanceof Error?failure.message:'Reprocess failed');setBusy(false)}}return <><button className="button" disabled={busy} onClick={retry}>{busy?'Processing…':'Reprocess'}</button>{error&&<small style={{display:'block',color:'#a74749'}}>{error}</small>}</>}
