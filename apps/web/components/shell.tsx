'use client';
import {useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export function Icon({name,size=17}:{name:string;size?:number}){
  const paths:Record<string,React.ReactNode>={
    menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
    bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    help:<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/></>,
    chevron:<><path d="m9 18 6-6-6-6"/></>,
    dashboard:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    invoice:<><path d="M6 3h9l3 3v15l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 10h6M9 14h6"/></>,
    check:<><path d="m4 12 5 5L20 6"/></>,
    agent:<><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M12 3v3M9 12h.01M15 12h.01M8 16h8"/></>,
    alert:<><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></>,
    po:<><path d="M7 3h7l4 4v14H7V3Z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></>,
    vendor:<><path d="M3 21V8l9-5 9 5v13M8 21v-7h8v7M8 10h.01M12 10h.01M16 10h.01"/></>,
    audit:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>,
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    download:<><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></>,
    close:<><path d="M5 5 19 19M19 5 5 19"/></>,
    arrow:<><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.invoice}</svg>;
}
const navigation=[
  {label:'Overview',href:'/',icon:'dashboard'},
  {heading:'INVOICES'},
  {label:'All Invoices',href:'/invoices',icon:'invoice'},
  {label:'Needs Review',href:'/exceptions',icon:'alert'},
  {heading:'OPERATIONS'},
  {label:'Agent Activity',href:'/agent',icon:'agent'},
  {label:'Purchase Orders',href:'/purchase-orders',icon:'po'},
  {label:'Vendors',href:'/vendors',icon:'vendor'},
  {label:'Audit Log',href:'/audit',icon:'audit'},
];
export function Shell({children}:{children:React.ReactNode}){
  const [open,setOpen]=useState(false);
  const pathname=usePathname();
  const title=pathname==='/'?'Accounts payable':pathname.startsWith('/invoices/')?'Invoice case':pathname==='/invoices'?'Invoices':pathname==='/purchase-orders'?'Purchase orders':pathname==='/vendors'?'Vendors':pathname==='/agent'?'Agent activity':pathname==='/exceptions'?'Needs review':'Audit log';
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" type="button" aria-label="Open navigation" onClick={()=>setOpen(true)}><Icon name="menu" size={18}/></button><span className="breadcrumb"><Link href="/">Zamp</Link><span className="slash">/</span><strong>{title}</strong></span></div><div className="topbar-right"><span className="header-environment">LOCAL WORKSPACE</span><span className="top-icon"><Icon name="bell"/></span><span className="top-icon"><Icon name="help"/></span><div className="profile"><span className="avatar">ZA</span><span><strong>Zamp</strong><small>AP workspace</small></span></div></div></header>
    {open&&<><button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}/><aside className="sidebar" aria-label="Main navigation"><div className="sidebar-brand"><span className="brand-mark">Z</span><strong>Zamp <span>AP</span></strong><button className="icon-button sidebar-close" type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}><Icon name="close"/></button></div><div className="workspace-picker"><span className="workspace-logo">Z</span><span><strong>Zamp workspace</strong><small>Finance operations</small></span><Icon name="chevron" size={14}/></div><nav>{navigation.map((item,i)=>'heading' in item?<p className="nav-heading" key={i}>{item.heading}</p>:<Link className={`nav-item ${pathname===item.href||item.href==='/invoices'&&pathname.startsWith('/invoices/')?'active':''}`} href={item.href!} key={i} onClick={()=>setOpen(false)}><Icon name={item.icon!}/><span>{item.label}</span></Link>)}</nav><div className="sidebar-footer"><span className="online-dot"/><strong>Matching engine online</strong><small>Phase 03 · deterministic validation</small></div></aside></>}
    <main className="page-container">{children}</main>
  </div>;
}
