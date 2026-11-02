import Link from 'next/link';
import {Icon} from './shell';

export function PageHeading({title,subtitle,actions}:{title:string;subtitle:string;actions?:React.ReactNode}){return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions&&<div className="heading-actions">{actions}</div>}</div>}
export function Badge({label}:{label:string}){
  const color=/APPROVED|VALIDATED|PASS|ACTIVE|COMPLETE/i.test(label)?'success':/REJECTED|FAIL|BLOCKED|ERROR/i.test(label)?'danger':/REVIEW|ISSUE|INCOMPLETE|PARTIAL|RUNNING/i.test(label)?'warning':'neutral';
  return <span className={`badge badge-${color}`}><span className="badge-dot"/>{label.replaceAll('_',' ')}</span>;
}
export function Empty({title,message,href,label}:{title:string;message:string;href?:string;label?:string}){return <div className="empty-state"><span className="empty-icon"><Icon name="invoice" size={24}/></span><h3>{title}</h3><p>{message}</p>{href&&<Link className="button button-primary" href={href}>{label??'View invoices'}<Icon name="arrow" size={15}/></Link>}</div>}
export function Panel({title,subtitle,action,children}:{title:string;subtitle?:string;action?:React.ReactNode;children:React.ReactNode}){return <section className="panel"><div className="panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>}
export function LocalNotice({enabled}:{enabled:boolean}){return enabled?null:<div className="notice notice-info">Organization data is unavailable until WorkOS sign-in and tenant isolation are enabled for this deployment.</div>}
