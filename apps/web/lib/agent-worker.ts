export async function dispatchAgentWorker(origin:string){
 const secret=process.env.AGENT_WORKER_SECRET??process.env.CRON_SECRET;
 if(!secret){console.error('Agent worker dispatch skipped: configure AGENT_WORKER_SECRET or CRON_SECRET');return false}
 try{
  const headers:Record<string,string>={authorization:`Bearer ${secret}`};
  if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response=await fetch(new URL('/api/agent/worker',origin),{method:'POST',headers,cache:'no-store'});
  if(!response.ok){console.error('Agent worker dispatch returned',response.status);return false}
  return true;
 }catch(error){console.error('Agent worker dispatch failed',error);return false}
}
