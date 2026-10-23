import './globals.css';
import {Shell} from '../components/shell';

export const metadata={title:'Zamp AP Agent — Accounts payable',description:'Invoice extraction, matching and validation workspace'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body><Shell>{children}</Shell></body></html>}
