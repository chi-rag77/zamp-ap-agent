'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
type Metrics={processingNow:number;queued:number;needsReview:number;invoicesToday:number;successRate:number;failureRate:number;averageProcessingTimeMs:number|null};
const empty:Metrics={processingNow:0,queued:0,needsReview:0,invoicesToday:0,successRate:0,failureRate:0,averageProcessingTimeMs:null};
export function DashboardLiveMetrics(){
 const [metrics,setMetrics]=useState<Metrics|null>(null);const [available,setAvailable]=useState(true);const inFlight=useRef<Promise<void>|null>(null);
 const load=useCallback(()=>{
  if(inFlight.current)return inFlight.current;
  const request=(async()=>{try{const response=await fetch('/api/dashboard/live',{cache:'no-store'});if(!response.ok)throw new Error('unavailable');const result=await response.json() as Metrics;setMetrics(result);setAvailable(true)}catch{setAvailable(false)}})();
  inFlight.current=request;void request.finally(()=>{if(inFlight.current===request)inFlight.current=null});return request;
 },[]);
 useEffect(()=>{
  void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},60_000);
  const refresh=(event:Event)=>{const events=(event as CustomEvent<Array<{type:string}>>).detail;if(events?.some(item=>['RUN_QUEUED','RUN_STARTED','RUN_COMPLETED','RUN_FAILED','RUN_RETRYING','REVIEW_REQUIRED','DECISION_GENERATED'].includes(item.type)))void load()};
  const resume=()=>{if(document.visibilityState==='visible')void load()};
  window.addEventListener('zamp:processing-events',refresh);document.addEventListener('visibilitychange',resume);
  return()=>{window.clearInterval(timer);window.removeEventListener('zamp:processing-events',refresh);document.removeEventListener('visibilitychange',resume)}
 },[load]);
 const data=metrics??empty;const average=data.averageProcessingTimeMs===null?'—':data.averageProcessingTimeMs<60000?`${Math.round(data.averageProcessingTimeMs/1000)}s`:`${Math.floor(data.averageProcessingTimeMs/60000)}m ${String(Math.floor(data.averageProcessingTimeMs/1000)%60).padStart(2,'0')}s`;
 return <section className="dashboard-live-strip" aria-label="Live workspace metrics"><header><strong>Live processing</strong><span className={available?'live-strip-status':'live-strip-status unavailable'}><i/>{available?'Connected':'Temporarily unavailable'}</span></header><div><article><b>{data.processingNow}</b><span>PROCESSING</span></article><article><b>{data.queued}</b><span>QUEUED</span></article><article><b>{data.needsReview}</b><span>NEEDS REVIEW</span></article><article><b>{data.invoicesToday}</b><span>RECEIVED TODAY</span></article><article><b>{average}</b><span>AVG RUN TIME</span></article></div></section>
}
