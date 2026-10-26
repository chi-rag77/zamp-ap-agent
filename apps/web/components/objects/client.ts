export async function workspaceRequest<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(`/api/workspace/${path}`,{method:body===undefined?'GET':'POST',headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),cache:'no-store'});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed. Please retry.');if(body!==undefined)window.dispatchEvent(new Event('zamp:workspace-updated'));return data as T;
}
export function displayValue(value:unknown):string{if(value===null||value===undefined||value==='')return '—';return typeof value==='object'?JSON.stringify(value):String(value)}
