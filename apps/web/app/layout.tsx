import './globals.css';
import {Shell} from '../components/shell';
import {vercelWorkspaceEnabled} from '../lib/data';

export const metadata={title:'Zamp AP Agent — Accounts payable',description:'Invoice extraction, matching and validation workspace'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){const environment=vercelWorkspaceEnabled()?'PROTECTED WORKSPACE':'LOCAL WORKSPACE';return <html lang="en"><body><Shell environment={environment}>{children}</Shell></body></html>}
