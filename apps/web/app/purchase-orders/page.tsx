import {Badge,Empty,LocalNotice,PageHeading} from '../../components/ui';
import {WorkspaceBrief} from '../../components/workspace-brief';
import {loadWorkspace,money,day} from '../../lib/data';
export const dynamic='force-dynamic';
export default async function PurchaseOrdersPage(){
  const w=await loadWorkspace();
  const pos=w.purchaseOrders;
  const open=pos.filter(po=>['OPEN','PARTIALLY_RECEIVED'].includes(po.status));
  const openValue=open.reduce((sum,po)=>sum+Number(po.total),0);
  const invoicedFor=(poId:string)=>w.invoices.filter(invoice=>invoice.po_id===poId).reduce((sum,invoice)=>sum+Number(invoice.total??0),0);
  const invoicedToDate=pos.reduce((sum,po)=>sum+invoicedFor(po.id),0);
  const overbilled=pos.filter(po=>invoicedFor(po.id)>Number(po.total));
  const leftToInvoice=open.reduce((sum,po)=>sum+Number(po.total)-invoicedFor(po.id),0);
  const summary=overbilled.length?`${overbilled.length} ${overbilled.length===1?'purchase order has':'purchase orders have'} linked invoices above the PO value.`:'No linked invoices are above their purchase-order values.';
  return <><PageHeading title="Purchase orders" subtitle="The procurement source of truth the AP Agent reconciles against"/><LocalNotice enabled={w.enabled}/><WorkspaceBrief summary={summary} stats={[["open",open.length],["with variance",overbilled.length],["left to invoice",money(leftToInvoice)]]}/>
    <div className="metrics-grid metrics-grid--four"><div className="metric"><div className="metric-label">OPEN POS</div><div className="metric-value">{open.length}</div><div className="metric-note">Available for invoice matching</div></div><div className="metric"><div className="metric-label">COMMITTED VALUE</div><div className="metric-value">{money(openValue)}</div><div className="metric-note">Open purchase-order total</div></div><div className="metric"><div className="metric-label">INVOICED TO DATE</div><div className="metric-value">{money(invoicedToDate)}</div><div className="metric-note">Invoices linked to purchase orders</div></div><div className="metric"><div className="metric-label">POS WITH VARIANCE</div><div className="metric-value">{overbilled.length}</div><div className="metric-note">Invoiced above PO value</div></div></div>
    <div className="table-panel"><div className="table-toolbar"><span className="table-count">{pos.length} purchase orders</span></div>{pos.length?<div className="table-scroll"><table className="data-table listing-table"><thead><tr><th>PO</th><th>VENDOR</th><th>PO DATE</th><th className="number">PO VALUE</th><th>INVOICED</th><th className="number">REMAINING</th><th>STATUS</th></tr></thead><tbody>{pos.map(po=>{const billed=invoicedFor(po.id),total=Number(po.total),remaining=total-billed,ratio=total?Math.min(100,billed/total*100):0;return <tr key={po.id}><td className="mono">{po.po_number}</td><td>{w.vendors.find(vendor=>vendor.id===po.vendor_id)?.display_name??'Unknown vendor'}</td><td>{day(po.po_date)}</td><td className="number">{money(po.total,po.currency)}</td><td><span className="table-progress-value"><i className={billed>total?'over':'within'}><b style={{width:`${ratio}%`}}/></i>{money(billed,po.currency)}</span></td><td className={`number ${remaining<0?'text-warning':''}`}>{remaining<0?`−${money(Math.abs(remaining),po.currency)}`:money(remaining,po.currency)}</td><td><Badge label={billed>total?'VARIANCE':po.status}/></td></tr>})}</tbody></table></div>:<Empty title="No purchase orders" message="Purchase orders added to Supabase will appear here for matching."/>}</div>
  </>;
}
