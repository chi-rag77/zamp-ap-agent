'use client';

import {useEffect,useMemo,useRef,useState} from 'react';

const STEP_TIMES=[650,1850,3050,4250,5250,6250,7250];
type OrganizationHint={name:string;ssoConfigured:boolean}|null;

function IntelligenceBackdrop(){return <div className="zamp-backdrop" aria-hidden="true"><div className="zamp-backdrop-base"/><div className="zamp-glow zamp-glow-left"/><div className="zamp-glow zamp-glow-right"/><div className="zamp-glow zamp-glow-bottom"/><div className="zamp-grid"/><svg className="zamp-backdrop-orbits" viewBox="0 0 760 760" fill="none"><circle cx="380" cy="380" r="378"/><circle cx="380" cy="380" r="300"/><circle cx="380" cy="380" r="222"/></svg></div>}

function ZampBrand(){return <div className="zamp-brand"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x=".75" y=".75" width="26.5" height="26.5" rx="7.5" fill="#F3F8FF" stroke="#CFE0FA"/><path d="M7.5 10h8M7.5 13.5h5" stroke="#A9C6F2" strokeWidth="1.4" strokeLinecap="round"/><path d="m7.5 20 4.6-4.6 2.9 2.9 5.5-5.6" stroke="#2E6BEF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><circle cx="20.5" cy="12.7" r="1.7" fill="#2E6BEF"/></svg><span className="zamp-brand-name">Zamp</span><span className="zamp-brand-divider"/><span className="zamp-brand-product">AP INVOICE</span></div>}

function CheckMark(){return <svg className="zamp-check" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8.2 3.1 3.1L13 4.8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Trace({active,children}:{active:boolean;children:React.ReactNode}){return <span className={`invoice-trace ${active?'is-active':''}`}>{children}</span>}

function InvoiceDocument({stage}:{stage:number}){
  const vendor=stage>=2,po=stage>=3,tax=stage>=5,ready=stage>=7;
  const items=[{description:'Precision pressure sensors · PS-40',quantity:'24',rate:'2,150.00',amount:'51,600.00'},{description:'On-site calibration & validation',quantity:'01',rate:'21,000.00',amount:'21,000.00'},{description:'Freight & handling',quantity:'01',rate:'4,650.00',amount:'4,650.00'}];
  return <div className="zamp-invoice-wrap"><div className={`zamp-corners ${stage>=1?'is-visible':''}`} aria-hidden="true"><i/><i/><i/><i/></div><article className="zamp-invoice" aria-label="Example invoice"><div className="zamp-scan"><span/></div>
    <header className="invoice-heading"><div className="invoice-vendor"><p><Trace active={vendor}>ACME INDUSTRIES PVT. LTD.</Trace></p><p className="invoice-address">Plot 42, Peenya Industrial Area<br/>Bengaluru 560058 · India</p><p className="invoice-gstin">GSTIN 29AACCA4821R1ZP</p></div><div className="invoice-meta"><p>INVOICE</p><p>ACME/2026/0417</p><p>18 Oct 2026</p></div></header>
    <section className="invoice-bill"><div><p>BILL TO</p><strong>Zamp Global Pvt. Ltd.</strong><small>Prestige Atrium, Bengaluru 560001</small></div><div><p>DUE</p><strong>17 Nov 2026</strong></div></section>
    <section className="invoice-items"><div className="invoice-items-head"><span>DESCRIPTION</span><span>AMOUNT</span></div>{items.map((item,index)=><div className="invoice-item" key={item.description}><div className="invoice-item-description"><p><span>{item.description}</span>{index===0&&po&&<span className="invoice-po">PO-24817</span>}</p><small>{item.quantity} × ₹{item.rate}</small></div><span className="invoice-item-amount">{item.amount}</span></div>)}</section>
    <section className="invoice-totals"><div><span>Subtotal</span><span>77,250.00</span></div><div><span><Trace active={tax}>IGST 9%</Trace></span><span><Trace active={tax}>6,952.50</Trace></span></div><div><span>Round off</span><span>47.50</span></div><div className="invoice-total"><span>TOTAL {ready&&<CheckMark/>}</span><strong><Trace active={ready}>₹84,250.00</Trace></strong></div></section>
    <footer className="invoice-footer"><span>NET 30 · REMIT HDFC ••4471</span><span>PAGE 1 / 1</span></footer>
  </article></div>
}

const SIGNALS=[
  {at:2,side:'left',label:'Vendor recognized',value:'Acme Industries',meta:'98.9% confidence',position:'vendor'},
  {at:3,side:'right',label:'PO discovered',value:'PO-24817',meta:'₹84,250 committed',position:'po'},
  {at:5,side:'left',label:'Tax validation',value:'Passed',meta:'IGST 9% · GSTIN ok',position:'tax',check:true},
  {at:4,side:'right',label:'3-way match',value:'Verified',meta:'PO · GRN · Invoice',position:'match',check:true},
  {at:6,side:'left',label:'Approval path',value:'Finance → Controller',meta:'Inferred · 2 steps',position:'approval'},
  {at:7,side:'right',label:'ERP posting',value:'Ready',meta:'NetSuite · AP-1180',position:'erp',check:true},
];
function IntelligenceSignals({stage}:{stage:number}){return <div className="zamp-intelligence-signals" aria-hidden="true">{SIGNALS.map(signal=><div key={signal.label} className={`zamp-signal zamp-signal-${signal.position} ${signal.side==='right'?'is-right':''} ${stage>=signal.at?'is-shown':''}`}><p>{signal.label}</p><strong>{signal.value}{signal.check&&<CheckMark/>}</strong><small>{signal.meta}</small><i/></div>)}</div>}

const STEPS=[{label:'Invoice received',detail:'PDF · 2 pages'},{label:'Vendor recognized',detail:'98.9% confidence'},{label:'PO discovered',detail:'PO-24817'},{label:'3-way match',detail:'Verified'},{label:'Tax validation',detail:'IGST 9% passed'},{label:'Approval path',detail:'Finance → Controller'},{label:'ERP posting',detail:'Ready · NetSuite'}];
function IntelligenceField({stage}:{stage:number}){const current=STEPS[Math.min(Math.max(stage,1),STEPS.length)-1];return <div className="zamp-field"><div className="zamp-field-canvas"><div className="zamp-halo"/><svg className="zamp-rings" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="400" cy="300" r="206"/><circle className="zamp-dash" cx="400" cy="300" r="272"/><circle cx="400" cy="300" r="340"/></svg><div className="zamp-drift"><InvoiceDocument stage={stage}/></div><IntelligenceSignals stage={stage}/></div><div className="zamp-mobile-step" aria-live="polite"><i/><span><strong>{current.label}</strong><em>·</em>{current.detail}</span></div></div>}

function OrganizationCard({organization,onSso}:{organization:Exclude<OrganizationHint,null>;onSso:()=>void}){return <div className="zamp-organization" aria-live="polite"><p>ORGANIZATION RECOGNIZED</p><strong>{organization.name}</strong>{organization.ssoConfigured&&<button type="button" onClick={onSso}>SSO available — continue with your organization’s identity provider <span>→</span></button>}</div>}

function SignInPanel({returnTo,initialError}:{returnTo:string;initialError?:string}){
  const [email,setEmail]=useState(''),[organization,setOrganization]=useState<OrganizationHint>(null),[lookingUp,setLookingUp]=useState(false),[lookupError,setLookupError]=useState(''),[ssoHint,setSsoHint]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(initialError??'');
  const emailRef=useRef<HTMLInputElement>(null);const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;const validEmail=useMemo(()=>emailPattern.test(email.trim()),[email]);
  useEffect(()=>{setOrganization(null);setLookingUp(false);setLookupError('');setSsoHint(false);if(!validEmail)return;const controller=new AbortController();const timer=window.setTimeout(async()=>{setLookingUp(true);try{const response=await fetch(`/api/auth/organization?email=${encodeURIComponent(email.trim())}`,{signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('lookup');const result=await response.json() as {organization?:OrganizationHint};setOrganization(result.organization??null)}catch{if(!controller.signal.aborted)setLookupError('Organization lookup is temporarily unavailable. You can still continue.')}finally{if(!controller.signal.aborted)setLookingUp(false)}},350);return()=>{window.clearTimeout(timer);controller.abort()}},[email,validEmail]);
  function continueWithEmail(value=email){if(!emailPattern.test(value.trim())){setError('Enter a valid work email to continue.');emailRef.current?.focus();return}setLoading(true);setError('');window.location.assign(`/sign-in?email=${encodeURIComponent(value.trim())}&returnTo=${encodeURIComponent(returnTo)}`)}
  function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');continueWithEmail()}
  function selectSso(){if(organization?.ssoConfigured){continueWithEmail();return}setSsoHint(true);emailRef.current?.focus()}
  const providerHref=(emailValue=email)=>`/sign-in?${emailValue.trim()?`email=${encodeURIComponent(emailValue.trim())}&`:''}returnTo=${encodeURIComponent(returnTo)}`;
  return <section className="zamp-signin" aria-label="Sign in"><div className="zamp-signin-glow"/><div className="zamp-status"><i/><span>INTELLIGENCE LAYER ONLINE</span></div><h1>Your AP intelligence is ready.</h1><p className="zamp-signin-subtitle">Continue where Zamp left off.</p>
    <form onSubmit={submit} noValidate><label htmlFor="work-email">Work email</label><div className="zamp-email-wrap"><input id="work-email" ref={emailRef} type="email" autoComplete="email" spellCheck={false} placeholder="you@company.com" value={email} onChange={event=>{setEmail(event.target.value);setSsoHint(false)}} aria-invalid={Boolean(error)} aria-describedby={error?'zamp-login-error':undefined} required/>{organization&&<i className="zamp-email-recognized"/>}</div>
      {lookingUp&&<p className="zamp-lookup-hint" aria-live="polite">Checking organization…</p>}{organization&&!lookingUp&&<OrganizationCard organization={organization} onSso={selectSso}/ >}{lookupError&&<p className="zamp-lookup-hint">{lookupError}</p>}{ssoHint&&<p className="zamp-sso-hint">Enter your work email and Zamp will route you to {organization?.name??'your organization'}’s identity provider.</p>}{error&&<p className="zamp-login-error" id="zamp-login-error" role="alert">{error}</p>}
      <button className="zamp-continue" type="submit" disabled={loading}><span>{loading?'Connecting…':'Continue'}</span><span className="zamp-arrow">{loading?<i className="zamp-spinner"/>:<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 8h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span><i className="zamp-button-shine"/></button>
    </form>
    <div className="zamp-divider"><i/><span>OR CONTINUE WITH</span><i/></div><div className="zamp-providers"><a href={providerHref()} aria-label="Continue with Microsoft"><span className="zamp-microsoft" aria-hidden="true"><i/><i/><i/><i/></span>Microsoft</a><a href={providerHref()} aria-label="Continue with Google"><b className="zamp-google" aria-hidden="true">G</b>Google</a><button type="button" onClick={selectSso}><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.6A6.4 6.4 0 0 0 1.6 8m12.8 0A6.4 6.4 0 0 0 8 1.6M4 8a4 4 0 0 1 8 0v2m-6-2a2 2 0 0 1 4 0v4m-2-4v6M2.8 10.4a8 8 0 0 0 1.1 3.9m9.3-3.9a8 8 0 0 1-1.1 3.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>SSO</button></div>
    <div className="zamp-auth-links"><span>Forgot password?</span><a href={`/sign-up${returnTo!=='/'?`?returnTo=${encodeURIComponent(returnTo)}`:''}`}>New to Zamp? Request access</a></div>
  </section>
}

export function LoginExperience({returnTo,initialError}:{returnTo:string;initialError?:string}){
  const [stage,setStage]=useState(0);
  useEffect(()=>{const timers=STEP_TIMES.map((delay,index)=>window.setTimeout(()=>setStage(index+1),delay));return()=>timers.forEach(window.clearTimeout)},[]);
  return <div className="zamp-login-page"><IntelligenceBackdrop/><header className="zamp-login-header"><ZampBrand/><div className="zamp-live"><i><b/></i><span>SYSTEMS LIVE · 24 OCT</span></div></header><main className="zamp-login-main"><div className="zamp-login-grid"><div className="zamp-left-column"><IntelligenceField stage={stage}/></div><div className="zamp-right-column"><SignInPanel returnTo={returnTo} initialError={initialError}/></div></div></main></div>
}
