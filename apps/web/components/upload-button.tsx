'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Icon} from './shell';

export function UploadButton({compact=false}:{compact?:boolean}){
  const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!file)return;
    setBusy(true);setError('');
    const form=new FormData();form.set('file',file);
    try{const response=await fetch('/api/ui/upload',{method:'POST',body:form});const body=await response.json();if(!response.ok)throw new Error(body.error??'Invoice processing failed');setOpen(false);router.push(`/invoices/${body.invoiceId}`);router.refresh()}
    catch(cause){setError(cause instanceof Error?cause.message:'Invoice processing failed')}finally{setBusy(false)}
  }
  return <><button type="button" className={`button button-primary ${compact?'upload-compact':''}`} aria-label={compact?'Add invoice':'Upload invoice'} title={compact?'Add invoice':undefined} onClick={()=>{setOpen(true);setError('')}}>{compact?'+':<><Icon name="upload" size={15}/>Upload invoice</>}</button>{open&&<div className="upload-modal" role="presentation" onClick={()=>{if(!busy)setOpen(false)}}><div className="upload-card" role="dialog" aria-modal="true" aria-labelledby="upload-title" onClick={event=>event.stopPropagation()}><h2 id="upload-title">Upload an invoice</h2><p>PDF, PNG or JPEG. The document is stored privately, extracted by NVIDIA, then checked against vendors, POs and receipts.</p><form onSubmit={submit}><input type="file" accept="application/pdf,image/png,image/jpeg" required onChange={event=>setFile(event.target.files?.[0]??null)}/>{busy&&<p className="loading-text">Extracting and validating your invoice. This may take a minute…</p>}{error&&<p className="error-text" role="alert">{error}</p>}<footer><button type="button" className="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={!file||busy}>{busy?'Processing…':'Process invoice'}</button></footer></form></div></div>}</>;
}
