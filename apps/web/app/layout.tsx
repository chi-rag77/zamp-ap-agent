import './globals.css';
import './base44-listings.css';
import './realtime.css';
import './login.css';
import {Inter} from 'next/font/google';
import {Shell} from '../components/shell';
import {vercelWorkspaceEnabled} from '../lib/data';
import {withAuth} from '@workos-inc/authkit-nextjs';
import {AuthKitProvider} from '@workos-inc/authkit-nextjs/components';
import {workosAuthEnabled} from '../lib/workos-auth';

const inter=Inter({subsets:['latin'],variable:'--font-inter',display:'swap'});

export const metadata={title:'Zamp AP Agent — Accounts payable',description:'Invoice extraction, matching and validation workspace'};
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  const authEnabled=workosAuthEnabled();
  const auth=authEnabled?await withAuth():null;
  const initialAuth=auth?Object.fromEntries(Object.entries(auth).filter(([key])=>key!=='accessToken')) as Omit<typeof auth,'accessToken'>:undefined;
  const profile=auth?.user?{name:[auth.user.firstName,auth.user.lastName].filter(Boolean).join(' ')||auth.user.email,detail:auth.user.email}:undefined;
  const environment=authEnabled?'WORKOS AUTHENTICATED':vercelWorkspaceEnabled()?'PROTECTED WORKSPACE':'LOCAL WORKSPACE';
  // Keep the shared shell independent from database health and event-cursor queries.
  // Those requests run after the first paint so a slow integration cannot stall every route.
  return <html lang="en"><body className={inter.variable}><AuthKitProvider initialAuth={initialAuth}><Shell environment={environment} profile={profile}>{children}</Shell></AuthKitProvider></body></html>
}
