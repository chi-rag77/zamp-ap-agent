'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LiveUpdates} from './realtime/live-updates';
import {NotificationCenter} from './realtime/notification-center';
import {useAuth} from '@workos-inc/authkit-nextjs/components';

export function Icon({name,size=17}:{name:string;size?:number}){
  const paths:Record<string,React.ReactNode>={
    settings:<><path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z"/><circle cx="12" cy="12" r="3"/></>,
    integrations:<><path d="m8 8 8 8M8 3v4M3 8h4M16 21v-4M21 16h-4M5 11l6-6 3 3-6 6-3-3Zm5 5 6-6 3 3-6 6-3-3Z"/></>,
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
    filter:<><path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>,
    download:<><path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/></>,
    close:<><path d="M5 5 19 19M19 5 5 19"/></>,
    lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    sidebar:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
    arrow:<><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.invoice}</svg>;
}
const navigation=[
  {label:'Overview',href:'/',icon:'dashboard'},
  {heading:'INVOICES'},
  {label:'All Invoices',href:'/invoices',icon:'invoice'},
  {label:'Needs Review',href:'/invoices?view=review',icon:'alert'},
  {label:'Approved',href:'/invoices?view=approved',icon:'check'},
  {label:'Rejected',href:'/invoices?view=rejected',icon:'close'},
  {heading:'AI AGENT'},
  {label:'Agent Activity',href:'/agent',icon:'agent'},
  {label:'Live Runs',href:'/agent/runs',icon:'audit'},
  {label:'Exceptions',href:'/exceptions',icon:'alert'},
  {label:'Email Intake',href:'/email-intake',icon:'invoice'},
  {heading:''},
  {label:'Purchase Orders',href:'/purchase-orders',icon:'po'},
  {label:'Vendors',href:'/vendors',icon:'vendor'},
  {label:'Rules & Policies',href:'/rules',icon:'check'},
  {label:'Analytics',href:'/analytics',icon:'dashboard'},
  {label:'Audit Log',href:'/audit',icon:'audit'},
  {label:'Organization settings',href:'/settings',icon:'settings'},
];
export function Shell({children,environment='LOCAL WORKSPACE',agentStatus='DEGRADED',agentMessage='Agent health is unavailable',initialEventCursor='0',profile}:{children:React.ReactNode;environment?:string;agentStatus?:'ONLINE'|'DEGRADED';agentMessage?:string;initialEventCursor?:string;profile?:{name:string;detail:string}}){
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const profileRef=useRef<HTMLDivElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const pathname=usePathname();
  const {user}=useAuth();
  useEffect(()=>{const onShortcut=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus()}};window.addEventListener('keydown',onShortcut);return()=>window.removeEventListener('keydown',onShortcut)},[]);
  useEffect(()=>{if(!profileOpen)return;const onPointerDown=(event:PointerEvent)=>{if(!profileRef.current?.contains(event.target as Node))setProfileOpen(false)};const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setProfileOpen(false)};document.addEventListener('pointerdown',onPointerDown);document.addEventListener('keydown',onKeyDown);return()=>{document.removeEventListener('pointerdown',onPointerDown);document.removeEventListener('keydown',onKeyDown)}},[profileOpen]);
  const title=pathname==='/'?'Accounts payable':pathname.startsWith('/invoices/')?'Invoice case':pathname==='/invoices'?'Invoices':pathname==='/purchase-orders'?'Purchase orders':pathname==='/vendors'?'Vendors':pathname==='/agent'?'Agent activity':pathname==='/agent/runs'?'Live runs':pathname.startsWith('/agent/runs/')?'Agent run':pathname==='/exceptions'?'Exceptions':pathname==='/email-intake'?'Email intake':pathname.startsWith('/rules/import')?'Policy import':pathname==='/rules'?'Rules & policies':pathname==='/analytics'?'Analytics':pathname.startsWith('/settings')?'Organization settings':'Audit log';
  if(pathname==='/login')return <>{children}</>;
  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''}`} data-environment={environment}>
    <aside className={`sidebar ${open?'sidebar-open':''} ${collapsed?'sidebar-collapsed':''}`} aria-label="Main navigation"><div className="sidebar-brand"><span className="brand-mark">Z</span><strong>Zamp</strong><span className="sidebar-app-badge">AP</span><button className="icon-button sidebar-close" type="button" aria-label={collapsed?'Expand navigation':'Collapse navigation'} onClick={()=>{if(window.matchMedia('(max-width: 850px)').matches)setOpen(false);else setCollapsed(value=>!value)}}><Icon name="sidebar"/></button></div><button className="workspace-picker" type="button"><span className="workspace-logo">AC</span><span><strong>Acme Corporation</strong><small>Finance Operations</small></span><span className="workspace-chevron">⌄</span></button><nav>{navigation.map((item,i)=>'heading' in item?<p className="nav-heading" key={i}>{item.heading==='AI AGENT'?'ZAMP':item.heading}</p>:<Link className={`nav-item ${pathname===item.href||item.href==='/agent'&&pathname.startsWith('/agent/')||item.href==='/invoices'&&pathname.startsWith('/invoices/')||item.href==='/rules'&&pathname.startsWith('/rules/')?'active':''}`} href={item.href!} key={i} title={item.label} aria-label={item.label} onClick={()=>setOpen(false)}><Icon name={item.icon!}/><span>{item.label}</span></Link>)}</nav><div className="sidebar-footer"><div className={`sidebar-status ${agentStatus==='DEGRADED'?'degraded':''}`} title={agentMessage}><span className="online-dot"/><strong>Agent {agentStatus==='ONLINE'?'online':'degraded'}</strong></div><small>{agentStatus==='ONLINE'?'Ready to process invoices':'Check backend and processing configuration'}</small><div className="sidebar-last-run"><span>{environment==='PROTECTED WORKSPACE'?'Protected workspace':'Local workspace'}</span><span className="sidebar-health-state">{agentStatus==='ONLINE'?'Ready':'Check status'}</span></div></div></aside>
    {open&&<button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" type="button" aria-label="Open navigation" onClick={()=>setOpen(true)}><Icon name="menu" size={18}/></button><span className="breadcrumb"><Link href="/">Zamp</Link><span className="slash">/</span><strong>{title}</strong></span></div><div className="topbar-right"><form className="global-search" action="/invoices"><Icon name="search" size={16}/><input ref={searchRef} type="search" name="q" aria-label="Search invoices, vendors, purchase orders" placeholder="Search invoices, vendors, POs..."/><kbd>⌘K</kbd></form><LiveUpdates initialCursor={initialEventCursor}/><NotificationCenter/><span className="top-icon"><Icon name="help"/></span><Link href="/settings/integrations" className="icon-button organization-shortcut" title="Organization settings" aria-label="Organization settings"><Icon name="settings" size={17}/></Link>{user&&<div className="profile-menu" ref={profileRef}><button className="profile profile-trigger" type="button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(value=>!value)}><span className="avatar">{profile?.name?.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()??'PN'}</span><span><strong>{profile?.name??'Priya Nair'}</strong><small>{profile?.detail??'AP Manager'}</small></span><span className="profile-caret" aria-hidden="true">⌄</span></button>{profileOpen&&<div className="profile-dropdown" role="menu"><div className="profile-dropdown-user"><strong>{profile?.name??'Priya Nair'}</strong><small>{profile?.detail??'AP Manager'}</small></div><Link href="/sign-out" className="profile-sign-out" role="menuitem" onClick={()=>setProfileOpen(false)}>Sign out</Link></div>}</div>}{!user&&<div className="profile"><span className="avatar">{profile?.name?.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()??'PN'}</span><span><strong>{profile?.name??'Priya Nair'}</strong><small>{profile?.detail??'AP Manager'}</small></span></div>}</div></header>
    <main className="page-container">{children}</main>
  </div>;
}
