import {hasTrustedOrigin} from './request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {localWorkspace} from './data';
export const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function allowed(request:NextRequest,mutation=false){if(!localWorkspace())return false;if(!mutation)return true;return hasTrustedOrigin(request)}
export const denied=()=>NextResponse.json({error:'Unavailable outside the local workspace'},{status:403});
export const invalid=()=>NextResponse.json({error:'Invalid ID'},{status:400});
export const failed=(error:unknown)=>NextResponse.json({error:error instanceof Error?error.message:'Agent request failed'},{status:422});
