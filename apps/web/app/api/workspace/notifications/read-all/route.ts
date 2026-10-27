import {NextRequest,NextResponse} from 'next/server';
import {objectContext,WorkspaceError} from '../../../../../lib/objects';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:NextRequest){
  if(request.headers.get('origin')!==request.nextUrl.origin){
    return NextResponse.json({error:'Request origin is not allowed.'},{status:403});
  }
  try{
    const context=await objectContext();
    const {data,error}=await context.db.from('object_notifications')
      .update({read_at:new Date().toISOString()})
      .eq('organization_id',context.organizationId)
      .eq('recipient',context.userId)
      .is('read_at',null)
      .select('id');
    if(error)throw error;
    return NextResponse.json({read:(data??[]).length},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof WorkspaceError)return NextResponse.json({error:error.message},{status:error.status});
    return NextResponse.json({error:'Notifications could not be updated. Retry in a moment.'},{status:503});
  }
}
