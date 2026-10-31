'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';

export function EmailIntakeRefresh(){
 const router=useRouter();
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible')router.refresh()};
  const timer=window.setInterval(refresh,300_000);
  document.addEventListener('visibilitychange',refresh);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
 },[router]);
 return null;
}

export function EmailIntakeRetryButton(){
 const router=useRouter();
 return <button className="button" type="button" onClick={()=>router.refresh()}>Retry</button>;
}
