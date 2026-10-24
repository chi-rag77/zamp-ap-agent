import {NextRequest,NextResponse} from 'next/server';
import {localWorkspace} from './data';

export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function localImportRequest(request:NextRequest,write=false){
  return localWorkspace()&&(!write||request.headers.get('origin')===request.nextUrl.origin);
}
export function importError(error:unknown){
  const message=error instanceof Error?error.message:'Policy import failed';
  const bad=/choose|exceeds|unsupported|invalid|missing|not found|resolve|review|draft|simulat|activate|cannot|file|rule/i.test(message);
  return NextResponse.json({error:message},{status:bad?400:500});
}
