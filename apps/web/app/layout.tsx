import './globals.css';
import {Inter,Plus_Jakarta_Sans} from 'next/font/google';
import {Shell} from '../components/shell';
import {vercelWorkspaceEnabled} from '../lib/data';

const inter=Inter({subsets:['latin'],variable:'--font-inter',display:'swap'});
const plusJakarta=Plus_Jakarta_Sans({subsets:['latin'],variable:'--font-plus-jakarta',display:'swap'});

export const metadata={title:'Zamp AP Agent — Accounts payable',description:'Invoice extraction, matching and validation workspace'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){const environment=vercelWorkspaceEnabled()?'PROTECTED WORKSPACE':'LOCAL WORKSPACE';return <html lang="en"><body className={`${inter.variable} ${plusJakarta.variable}`}><Shell environment={environment}>{children}</Shell></body></html>}
