import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../lib/tenant-database';
import {allowed,denied,failed} from '../../../../lib/agent-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  if(!allowed(request))return denied();
  const after=request.nextUrl.searchParams.get('after')??'0';
  if(!/^\d{1,18}$/.test(after))return NextResponse.json({error:'Invalid event cursor'},{status:400});
  try{
    const db=await createWebServerClient();
    // A fresh browser only needs the current sequence as its starting point. Returning
    // historical events here caused a page refresh storm on every navigation.
    if(after==='0'){
      const {data,error}=await db.from('processing_events').select('sequence').order('sequence',{ascending:false}).limit(1).maybeSingle();
      if(error)throw error;
      return NextResponse.json({events:[],cursor:data?String(data.sequence):'0'},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
    }
    const {data,error}=await db.from('processing_events')
      .select('id,sequence,event_type,invoice_id,run_id,step_name,status,message,metadata,created_at')
      .gt('sequence',after).order('sequence',{ascending:true}).limit(100);
    if(error)throw error;
    const events=(data??[]).map(event=>({id:event.id,sequence:String(event.sequence),type:event.event_type,invoiceId:event.invoice_id,runId:event.run_id,stepName:event.step_name,status:event.status,message:event.message,metadata:event.metadata,timestamp:event.created_at}));
    return NextResponse.json({events,cursor:events.at(-1)?.sequence??after},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
  }catch(error){return failed(error)}
}
