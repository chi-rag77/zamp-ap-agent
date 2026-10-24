import './globals.css';
import './base44-listings.css';
import './realtime.css';
import {Inter} from 'next/font/google';
import {Shell} from '../components/shell';
import {vercelWorkspaceEnabled} from '../lib/data';
import {getAgentHealth} from '../lib/agent-health';
import {getProcessingEventCursor} from '../lib/realtime-cursor';

const inter=Inter({subsets:['latin'],variable:'--font-inter',display:'swap'});

export const metadata={title:'Zamp AP Agent — Accounts payable',description:'Invoice extraction, matching and validation workspace'};
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){const environment=vercelWorkspaceEnabled()?'PROTECTED WORKSPACE':'LOCAL WORKSPACE';const [health,eventCursor]=await Promise.all([getAgentHealth(),getProcessingEventCursor()]);return <html lang="en"><body className={inter.variable}><Shell environment={environment} agentStatus={health.status} agentMessage={health.message} initialEventCursor={eventCursor}>{children}</Shell></body></html>}
