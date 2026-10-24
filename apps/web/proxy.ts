import {authkitProxy} from '@workos-inc/authkit-nextjs';
import {NextResponse, type NextFetchEvent, type NextRequest} from 'next/server';
import {workosAuthConfigured,workosAuthEnabled} from './lib/workos-auth';

export default function proxy(request:NextRequest,event:NextFetchEvent){
  if(process.env.ZAMP_AUTH_REQUIRED==='true'&&!workosAuthConfigured()){
    return new NextResponse('Authentication is not configured for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  if(!workosAuthEnabled()){
    return NextResponse.next();
  }
  return authkitProxy({middlewareAuth:{enabled:true,unauthenticatedPaths:[
    '/sign-in','/sign-up','/callback',
    '/api/email/cron','/api/email/gmail/callback','/api/email/gmail/webhook','/api/email/watch/renew',
    '/api/agent/worker','/api/webhooks/workos',
  ]}})(request,event);
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)']};
