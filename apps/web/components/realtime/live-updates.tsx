'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ConnectionState,ProcessingEvent} from '@zamp/realtime';

export function LiveUpdates({initialCursor='0'}:{initialCursor?:string}){
  const router=useRouter();const cursor=useRef(initialCursor);const [state,setState]=useState<ConnectionState>('CONNECTING');
  useEffect(()=>{
    let alive=true,failures=0,timer:ReturnType<typeof setTimeout>|undefined,refreshTimer:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>router.refresh(),160)};
    const poll=async()=>{
      if(!alive)return;
      try{
        const response=await fetch(`/api/realtime/events?after=${encodeURIComponent(cursor.current)}`,{cache:'no-store',headers:{accept:'application/json'}});
        if(!response.ok)throw new Error(`Live feed returned ${response.status}`);
        const data=await response.json() as {events:ProcessingEvent[];cursor:string};
        failures=0;setState('CONNECTED');
        if(data.cursor&&BigInt(data.cursor)>BigInt(cursor.current))cursor.current=data.cursor;
        if(data.events.length){window.dispatchEvent(new CustomEvent('zamp:processing-events',{detail:data.events}));refresh()}
      }catch{failures++;setState(failures===1?'RECONNECTING':failures>=8?'ERROR':'RECONNECTING')}
      if(alive)timer=setTimeout(poll,2200);
    };
    setState('CONNECTING');void poll();
    const online=()=>{failures=0;setState('RECONNECTING');void poll()};
    const offline=()=>setState('DISCONNECTED');
    window.addEventListener('online',online);window.addEventListener('offline',offline);
    return()=>{alive=false;if(timer)clearTimeout(timer);if(refreshTimer)clearTimeout(refreshTimer);window.removeEventListener('online',online);window.removeEventListener('offline',offline)};
  },[router]);
  return <span className={`realtime-state realtime-${state.toLowerCase()}`} role="status" aria-live="polite" title={state==='CONNECTED'?'Live updates connected':state==='ERROR'?'Live updates unavailable; page data remains available':state==='DISCONNECTED'?'Network disconnected':'Reconnecting to live updates'}><i/>{state==='CONNECTED'?'Live':state==='CONNECTING'?'Connecting':state==='DISCONNECTED'?'Offline':state==='ERROR'?'Updates unavailable':'Reconnecting'}</span>;
}
