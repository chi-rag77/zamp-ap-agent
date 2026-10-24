import 'server-only';
import {createServerClient} from '@zamp/database';

export async function getProcessingEventCursor(){
  try{
    const {data,error}=await createServerClient().from('processing_events').select('sequence').order('sequence',{ascending:false}).limit(1).maybeSingle();
    if(error||!data)return '0';
    return String(data.sequence);
  }catch{return '0'}
}
