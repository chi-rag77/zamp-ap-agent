import 'server-only';
import {createWebServerClient} from './tenant-database';
import {localWorkspace} from './data';

export type AgentHealthStatus='ONLINE'|'DEGRADED';
export type AgentHealth={status:AgentHealthStatus;checkedAt:string;message:string};

export async function getAgentHealth():Promise<AgentHealth>{
  const checkedAt=new Date().toISOString();
  if(!localWorkspace())return {status:'DEGRADED',checkedAt,message:'Production workspace is not enabled'};
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return {status:'DEGRADED',checkedAt,message:'Database connection is not configured'};
  if(!process.env.AGENT_WORKER_SECRET&&!process.env.CRON_SECRET)return {status:'DEGRADED',checkedAt,message:'Agent worker is not configured'};
  if(process.env.AI_PROVIDER==='mock'&&process.env.NODE_ENV==='production'||process.env.AI_PROVIDER!=='mock'&&!process.env.NVIDIA_API_KEY)return {status:'DEGRADED',checkedAt,message:'Invoice extraction is not configured'};
  try{
    const db=await createWebServerClient();
    const [policy,runs]=await Promise.all([
      db.from('policies').select('id').eq('status','ACTIVE').limit(1).maybeSingle(),
      db.from('agent_runs').select('id').order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    if(policy.error||runs.error)return {status:'DEGRADED',checkedAt,message:'Agent health checks could not reach the workspace data'};
    if(!policy.data)return {status:'DEGRADED',checkedAt,message:'No active policy is available'};
    return {status:'ONLINE',checkedAt,message:'Backend, active policy, worker, and extraction provider are ready'};
  }catch{
    return {status:'DEGRADED',checkedAt,message:'Agent health checks could not reach the workspace data'};
  }
}
