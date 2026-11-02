type WorkerEnvironment={AGENT_WORKER_SECRET?:string;CRON_SECRET?:string;VERCEL_AUTOMATION_BYPASS_SECRET?:string;RENDER_EXTERNAL_URL?:string;PORT?:string};

export function agentWorkerUrl(origin:string,environment:WorkerEnvironment=process.env as WorkerEnvironment){
 // Render terminates TLS at its proxy. Calling the public HTTPS URL from inside
 // the same container can resolve to the plain HTTP service port and fail TLS.
 // Use the local listener for Render; keep the request-origin URL for other hosts.
 const port=Number(environment.PORT);
 const isRender=Boolean(environment.RENDER_EXTERNAL_URL)&&Number.isInteger(port)&&port>0&&port<=65535;
 const workerOrigin=isRender?'http://127.0.0.1:'+port:origin;
 return new URL('/api/agent/worker',workerOrigin);
}

export async function dispatchAgentWorker(origin:string,environment:WorkerEnvironment=process.env as WorkerEnvironment){
 const secret=environment.AGENT_WORKER_SECRET??environment.CRON_SECRET;
 if(!secret){console.error('Agent worker dispatch skipped: configure AGENT_WORKER_SECRET or CRON_SECRET');return false}
 try{
  const headers:Record<string,string>={authorization:'Bearer '+secret};
  if(environment.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=environment.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response=await fetch(agentWorkerUrl(origin,environment),{method:'POST',headers,cache:'no-store'});
  if(!response.ok){console.error('Agent worker dispatch returned',response.status);return false}
  return true;
 }catch(error){console.error('Agent worker dispatch failed',error);return false}
}
