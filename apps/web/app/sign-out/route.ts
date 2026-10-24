import {NextResponse} from 'next/server';
import {signOut} from '@workos-inc/authkit-nextjs';
import {workosAuthEnabled} from '../../lib/workos-auth';

export async function GET(){
  if(!workosAuthEnabled()){
    return NextResponse.redirect(new URL('/',process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI??'http://localhost:3000'));
  }
  await signOut({returnTo:'/sign-in'});
}
