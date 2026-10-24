'use client';
import {useCallback,useEffect,useState} from 'react';
type Metrics={processingNow:number;queued:number;needsReview:number;invoicesToday:number;successRate:number;failureRate:number;averageProcessingTimeMs:number|null};
const empty:Metrics={processingNow:0,queued:0,needsReview:0,invoicesToday:0,successRate:0,failureRate:0,averageProcessingTimeMs:null};
export function DashboardLiveMetrics(){
 const [metrics,setMetrics]=useState<Metrics|null>(null);const [available,setAvailable]=useState(true);
 const load=useCallback(async()=>{try{const response=await fetch('/api/dashboard/live',{cache:'no-store'});if(!response.ok)throw new Error('unavailable');const result=await response.json() as Metrics;setMetrics(result);setAvailable(true)}catch{setAvailable(false)}},[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),15000);const refresh=()=>void load();window.addEventListener('zamp:processing-events',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('zamp:processing-events',refresh)}},[load]);
 const data=metrics??empty;const average=data.averageProcessingTimeMs===null?'—':data.averageProcessingTimeMs<60000?`${Math.round(data.averageProcessingTimeMs/1000)}s`:`${Math.floor(data.averageProcessingTimeMs/60000)}m ${String(Math.floor(data.averageProcessingTimeMs/1000)%60).padStart(2,'0')}s`;
 return <section className="dashboard-live-strip" aria-label="Live workspace metrics"><header><strong>Live processing</strong><span className={available?'live-strip-status':'live-strip-status unavailable'}><i/>{available?'Connected':'Temporarily unavailable'}</span></header><div><article><b>{data.processingNow}</b><span>PROCESSING</span></article><article><b>{data.queued}</b><span>QUEUED</span></article><article><b>{data.needsReview}</b><span>NEEDS REVIEW</span></article><article><b>{data.invoicesToday}</b><span>RECEIVED TODAY</span></article><article><b>{average}</b><span>AVG RUN TIME</span></article></div></section>
}
