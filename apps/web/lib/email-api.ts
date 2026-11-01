import {hasTrustedOrigin} from './request-origin';
import {timingSafeEqual} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {localWorkspace} from './data';
export function emailAdmin(request:NextRequest){const expected=process.env.EMAIL_ADMIN_TOKEN;const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(expected&&supplied){const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length===b.length&&timingSafeEqual(a,b))return true}return localWorkspace()&&hasTrustedOrigin(request)}
export const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
