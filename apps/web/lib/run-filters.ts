export type RunFilter='all'|'running'|'review'|'completed'|'failed'|'retrying';
export const runFilters:{key:RunFilter;label:string}[]=[{key:'all',label:'All'},{key:'running',label:'Running'},{key:'review',label:'Review required'},{key:'completed',label:'Completed'},{key:'failed',label:'Failed'},{key:'retrying',label:'Retrying'}];
export function matchesRunFilter(filter:RunFilter,run:{status:string;retry_count:number}){
  switch(filter){
    case'all':return true;
    case'running':return ['QUEUED','RUNNING'].includes(run.status)&&run.retry_count===0;
    case'review':return run.status==='WAITING';
    case'completed':return run.status==='COMPLETED';
    case'failed':return run.status==='FAILED';
    case'retrying':return run.retry_count>0&&['QUEUED','RUNNING'].includes(run.status);
  }
}
export function formatRunElapsed(started:string|null,completed:string|null,duration:number|null,now=Date.now()){
  if(duration!==null)return duration<1000?`${duration} ms`:duration<60000?`${(duration/1000).toFixed(1)} s`:`${Math.floor(duration/60000)}m ${String(Math.floor(duration/1000)%60).padStart(2,'0')}s`;
  if(!started)return '—';
  const start=Date.parse(started),end=completed?Date.parse(completed):now;
  if(!Number.isFinite(start)||!Number.isFinite(end))return '—';
  const seconds=Math.max(0,Math.floor((end-start)/1000));
  return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`;
}
