'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import type {ConnectionState,ProcessingEvent} from '@zamp/realtime';
import {livePollDelay} from '../../../../packages/realtime/src/polling';

const MAX_BACKOFF_MS=120_000;

function shouldRefreshPage(pathname:string,events:ProcessingEvent[]){
  if(/^\/agent\/runs\/[^/]+$/.test(pathname)){
    const runId=pathname.split('/').at(-1);
    return events.some(event=>event.runId===runId);
  }
  if(/^\/invoices\/[^/]+$/.test(pathname)){
    const invoiceId=pathname.split('/').at(-1);
    return events.some(event=>event.invoiceId===invoiceId);
  }
  if(pathname==='/invoices')return events.some(event=>['INVOICE_CREATED','INVOICE_UPDATED','DECISION_GENERATED','RUN_COMPLETED','RUN_FAILED','REVIEW_REQUIRED'].includes(event.type));
  if(pathname==='/email-intake')return events.some(event=>['EMAIL_RECEIVED','ATTACHMENT_DISCOVERED','INVOICE_CREATED'].includes(event.type));
  if(pathname==='/agent'||pathname==='/agent/runs')return events.some(event=>event.runId);
  return false;
}

export function LiveUpdates({initialCursor='0'}:{initialCursor?:string}){
  const router=useRouter();const pathname=usePathname();const cursor=useRef(initialCursor);const [state,setState]=useState<ConnectionState>('CONNECTING');
  useEffect(()=>{
    let alive=true,polling=false,failures=0,fastRun=true,lastRefreshAt=0,timer:ReturnType<typeof setTimeout>|undefined,refreshTimer:ReturnType<typeof setTimeout>|undefined;
    const schedule=(delay:number)=>{if(!alive||document.visibilityState!=='visible')return;if(timer)clearTimeout(timer);timer=setTimeout(()=>void poll(),delay)};
    const refresh=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(Date.now()-lastRefreshAt<1500)return;lastRefreshAt=Date.now();router.refresh()},350)};
    const poll=async()=>{
      if(!alive||polling||document.visibilityState!=='visible')return;
      polling=true;
      let delay=livePollDelay(pathname,true,fastRun)??30_000;
      try{
        const response=await fetch(`/api/realtime/events?after=${encodeURIComponent(cursor.current)}`,{cache:'no-store',headers:{accept:'application/json'}});
        if(!response.ok)throw new Error(`Live feed returned ${response.status}`);
        const data=await response.json() as {events:ProcessingEvent[];cursor:string};
        failures=0;setState('CONNECTED');
        if(data.cursor&&BigInt(data.cursor)>BigInt(cursor.current))cursor.current=data.cursor;
        if(data.events.length){
          window.dispatchEvent(new CustomEvent('zamp:processing-events',{detail:data.events}));
          if(/^\/agent\/runs\/[^/]+$/.test(pathname)&&data.events.some(event=>event.runId===pathname.split('/').at(-1)&&['RUN_COMPLETED','RUN_FAILED'].includes(event.type)))fastRun=false;
          if(shouldRefreshPage(pathname,data.events))refresh();
        }
      }catch{failures++;delay=Math.min(MAX_BACKOFF_MS,Math.max(delay,2000*2**Math.min(failures,6)));setState(failures>=8?'ERROR':'RECONNECTING')}
      finally{polling=false;if(alive)schedule(delay)}
    };
    const visible=()=>{if(document.visibilityState==='visible'){if(timer)clearTimeout(timer);failures=0;setState('RECONNECTING');void poll()}else if(timer)clearTimeout(timer)};
    setState('CONNECTING');if(document.visibilityState==='visible')void poll();
    const online=()=>{failures=0;setState('RECONNECTING');void poll()};
    const offline=()=>setState('DISCONNECTED');
    document.addEventListener('visibilitychange',visible);window.addEventListener('online',online);window.addEventListener('offline',offline);
    return()=>{alive=false;if(timer)clearTimeout(timer);if(refreshTimer)clearTimeout(refreshTimer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online);window.removeEventListener('offline',offline)};
  },[pathname,router]);
  return <span className={`realtime-state realtime-${state.toLowerCase()}`} role="status" aria-live="polite" title={state==='CONNECTED'?'Live updates connected':state==='ERROR'?'Live updates unavailable; page data remains available':state==='DISCONNECTED'?'Network disconnected':'Reconnecting to live updates'}><i/>{state==='CONNECTED'?'Live':state==='CONNECTING'?'Connecting':state==='DISCONNECTED'?'Offline':state==='ERROR'?'Updates unavailable':'Reconnecting'}</span>;
}
