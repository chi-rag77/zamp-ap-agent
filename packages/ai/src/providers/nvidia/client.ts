import { ExtractionError } from './errors';

export type NvidiaConfig={apiKey:string;baseUrl:string;model:string;timeoutMs:number;maxAttempts:number;jsonMode:boolean};
export function nvidiaConfig(env:NodeJS.ProcessEnv=process.env):NvidiaConfig{
  if(!env.NVIDIA_API_KEY||!env.NVIDIA_MODEL)throw new Error('NVIDIA_API_KEY and NVIDIA_MODEL are required in real mode');
  const baseUrl=env.NVIDIA_BASE_URL??'https://integrate.api.nvidia.com/v1';
  if(!/^https:\/\//.test(baseUrl))throw new Error('NVIDIA_BASE_URL must use HTTPS');
  return {apiKey:env.NVIDIA_API_KEY,baseUrl:baseUrl.replace(/\/$/,''),model:env.NVIDIA_MODEL,timeoutMs:Number(env.NVIDIA_REQUEST_TIMEOUT_MS??60000),maxAttempts:Math.min(3,Math.max(1,Number(env.NVIDIA_MAX_ATTEMPTS??3))),jsonMode:env.NVIDIA_JSON_MODE==='true'};
}
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export class NvidiaClient {
  constructor(private config:NvidiaConfig,private fetcher:typeof fetch=fetch){}
  async availableModels():Promise<string[]> {
    const response=await this.request('/models',{method:'GET'});
    const json=await response.json() as {data?:{id?:string}[]};
    return (json.data??[]).map(item=>item.id).filter((id):id is string=>Boolean(id));
  }
  async chat(body:Record<string,unknown>):Promise<{choices:{message:{content:string};finish_reason:string|null}[];usage?:unknown}> {
    const response=await this.request('/chat/completions',{method:'POST',body:JSON.stringify(body)});
    const data=await response.json() as {choices?:{message?:{content?:string};finish_reason?:string|null}[];usage?:unknown};
    if(!data.choices?.[0]?.message?.content)throw new ExtractionError('NVIDIA_INVALID_RESPONSE','The model returned no content');
    return data as {choices:{message:{content:string};finish_reason:string|null}[];usage?:unknown};
  }
  private async request(path:string,options:RequestInit):Promise<Response>{
    let last:ExtractionError|undefined;
    for(let attempt=1;attempt<=this.config.maxAttempts;attempt++){
      try{
        const response=await this.fetcher(`${this.config.baseUrl}${path}`,{...options,headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(this.config.timeoutMs)});
        if(response.ok)return response;
        const code=response.status===401||response.status===403?'NVIDIA_AUTH_ERROR':response.status===429?'NVIDIA_RATE_LIMIT':'NVIDIA_UNAVAILABLE';
        last=new ExtractionError(code,`NVIDIA request failed (HTTP ${response.status})`);
        if(![429,500,502,503,504].includes(response.status)||attempt===this.config.maxAttempts)throw last;
        const retryAfter=Number(response.headers.get('retry-after'));
        await wait(Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,10000):250*2**(attempt-1));
      }catch(error){
        if(error instanceof ExtractionError)throw error;
        last=new ExtractionError(error instanceof Error&&/abort|timeout/i.test(error.name+' '+error.message)?'NVIDIA_TIMEOUT':'NVIDIA_UNAVAILABLE','NVIDIA request could not complete');
        if(attempt===this.config.maxAttempts)throw last;
        await wait(250*2**(attempt-1));
      }
    }
    throw last??new ExtractionError('NVIDIA_UNAVAILABLE','NVIDIA unavailable');
  }
}
