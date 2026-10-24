import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request} from 'node:https';
/** Only globally routable IPv4 is supported. Reject IPv6 to close mapped/private-address bypasses. */
export function publicAddress(address:string){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export async function resolvePublic(url:URL){
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('UNSAFE_ENDPOINT');
 const records=await lookup(url.hostname,{all:true});
 if(!records.length||records.some(record=>!publicAddress(record.address)))throw new Error('UNSAFE_ENDPOINT');
 return records[0].address;
}
/** Pin the validated DNS address to the socket. Never follow redirects or log response bodies. */
export async function probe(url:URL,headers:Record<string,string>={}){
 const address=await resolvePublic(url);
 return new Promise<number>((resolve,reject)=>{
  const req=request(url,{method:'GET',family:4,headers:{Accept:'application/json','User-Agent':'Zamp-Integration-Test/1.0',...headers},lookup:(_host,_options,cb)=>cb(null,address,4),timeout:10000},res=>{
   const status=res.statusCode??502;
   res.destroy();
   resolve(status);
  });
  req.on('timeout',()=>req.destroy(new Error('TIMEOUT')));
  req.on('error',()=>reject(new Error('CONNECTION_FAILED')));
  req.end();
 });
}
export function retryable(status:number){return [429,500,502,503,504].includes(status)}
export function backoff(attempt:number,random=Math.random){return Math.min(4000,250*2**attempt)+Math.floor(random()*200)}
