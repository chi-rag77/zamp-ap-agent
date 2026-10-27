'use client';

import Link from 'next/link';

export default function InvoiceError({retry}:{error:Error&{digest?:string};retry:()=>void}){
  return <main className="page-container">
    <section className="panel" role="alert" style={{maxWidth:680,margin:'48px auto',padding:28}}>
      <div className="badge badge-warning" style={{marginBottom:12}}>INVOICE TEMPORARILY UNAVAILABLE</div>
      <h1 style={{fontSize:21,marginBottom:8}}>We couldn’t load this invoice</h1>
      <p style={{color:'var(--muted)',marginBottom:20}}>The invoice is still in your workspace. Try loading it again, or return to the invoice list.</p>
      <div className="heading-actions">
        <button className="button button-primary" onClick={retry}>Try again</button>
        <Link className="button" href="/invoices">Back to invoices</Link>
      </div>
    </section>
  </main>;
}
