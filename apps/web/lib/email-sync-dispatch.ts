export async function dispatchEmailSyncContinuation(origin:string,jobId?:string){
 const headers:Record<string,string>={origin};
 const token=process.env.EMAIL_ADMIN_TOKEN;
 if(token)headers.authorization=`Bearer ${token}`;
 if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
 try{
  const response=await fetch(new URL('/api/email/sync',origin),{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({jobId}),cache:'no-store'});
  if(!response.ok){console.error('Gmail sync continuation returned',response.status);return false;}
  return true;
 }catch(error){console.error('Gmail sync continuation failed',error);return false;}
}
