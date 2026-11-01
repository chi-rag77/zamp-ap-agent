import {authkitProxy} from '@workos-inc/authkit-nextjs';
import {NextResponse, type NextFetchEvent, type NextRequest} from 'next/server';
import {workosAuthConfigured,workosAuthEnabled} from './lib/workos-auth';
import {unauthenticatedPaths} from './lib/public-routes';

export default function proxy(request:NextRequest,event:NextFetchEvent){
  if(request.nextUrl.pathname==='/health')return NextResponse.next();
  if(process.env.ZAMP_AUTH_REQUIRED==='true'&&!workosAuthConfigured()){
    return new NextResponse('Authentication is not configured for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  if(!workosAuthEnabled()){
    return NextResponse.next();
  }
  const publicPaths=['/health','/login','/sign-in','/sign-up','/callback','/auth/complete','/organization-setup','/approvals/email','/api/approvals/email','/api/auth/organization','/api/email/cron','/api/email/gmail/callback','/api/email/gmail/webhook','/api/email/watch/renew','/api/agent/worker','/api/webhooks/workos','/api/v1/health','/api/v1/purchase-orders'];
  const isPublic=publicPaths.some(path=>request.nextUrl.pathname===path||request.nextUrl.pathname.startsWith(`${path}/`));
  const sessionCookie=request.cookies.get(process.env.WORKOS_COOKIE_NAME||'wos-session');
  if(!sessionCookie&&!isPublic){
    const loginUrl=new URL('/login',request.url);
    loginUrl.searchParams.set('returnTo',`${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  return authkitProxy({middlewareAuth:{enabled:true,unauthenticatedPaths}})(request,event);
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)']};
