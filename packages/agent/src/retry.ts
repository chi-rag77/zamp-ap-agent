import {AgentError} from './errors';
const transient=new Set(['TIMEOUT','RATE_LIMIT','NETWORK_ERROR','HTTP_429','HTTP_500','HTTP_502','HTTP_503']);
export function isTransient(error:unknown){const code=error instanceof AgentError?error.code:((error as {code?:string})?.code??'');return transient.has(code)||/\b(429|500|502|503)\b|network|timeout/i.test(error instanceof Error?error.message:'')}
export async function retryTransient<T>(task:()=>Promise<T>,onRetry?:(count:number)=>Promise<void>){let last:unknown;for(let i=0;i<3;i++){try{return await task()}catch(error){last=error;if(!isTransient(error)||i===2)throw error;await onRetry?.(i+1);await new Promise(resolve=>setTimeout(resolve,Math.min(2000,200*2**i)+Math.floor(Math.random()*100)))}}throw last}
