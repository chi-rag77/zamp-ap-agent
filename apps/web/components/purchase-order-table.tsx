'use client';
import {useMemo,useState} from 'react';
import {ObjectPeek} from './objects/object-workspace';
import {Badge,Empty} from './ui';
import {Icon} from './shell';

export type PurchaseOrderView={id:string;number:string;supplier:string;date:string;amount:string;currency:string;invoiced:string;remaining:string;status:string;creator:string};
type Tab='All'|'Open'|'Fully invoiced'|'Variance';
const value=(amount:string)=>Number(amount.replace(/[^\d.-]/g,''))||0;
function exportCsv(rows:PurchaseOrderView[]){
  const fields:(keyof PurchaseOrderView)[]=['status','number','supplier','date','amount','invoiced','remaining','creator'];
  const quote=(text:string)=>`"${text.replaceAll('"','""')}"`;
  const csv=[fields.join(','),...rows.map(row=>fields.map(field=>quote(row[field])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='zamp-purchase-orders.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function PurchaseOrderTable({rows}:{rows:PurchaseOrderView[]}){
  const [tab,setTab]=useState<Tab>('All');
  const [search,setSearch]=useState('');
  const [sortNewest,setSortNewest]=useState(true);
  const [viewsOpen,setViewsOpen]=useState(false);
  const [peekId,setPeekId]=useState<string|null>(null);
  const tabs:Tab[]=['All','Open','Fully invoiced','Variance'];
  const count=(candidate:Tab)=>candidate==='All'?rows.length:candidate==='Open'?rows.filter(row=>['OPEN','PARTIALLY_RECEIVED'].includes(row.status)).length:candidate==='Fully invoiced'?rows.filter(row=>value(row.remaining)===0&&row.status!=='VARIANCE').length:rows.filter(row=>row.status==='VARIANCE'||value(row.remaining)<0).length;
  const visible=useMemo(()=>rows.filter(row=>{
    const query=search.trim().toLowerCase();
    const inTab=tab==='All'||tab==='Open'&&['OPEN','PARTIALLY_RECEIVED'].includes(row.status)||tab==='Fully invoiced'&&value(row.remaining)===0&&row.status!=='VARIANCE'||tab==='Variance'&&(row.status==='VARIANCE'||value(row.remaining)<0);
    return inTab&&(!query||[row.number,row.supplier,row.creator,row.status].some(text=>text.toLowerCase().includes(query)));
  }).sort((a,b)=>{
    const difference=Date.parse(a.date)-Date.parse(b.date);
    return sortNewest?-difference:difference;
  }),[rows,search,tab,sortNewest]);
  return <>
    <div className="invoice-list-tabs">
      <div className="tabs">{tabs.map(label=><button type="button" key={label} className={`tab ${tab===label?'active':''}`} onClick={()=>setTab(label)}>{label}<span className="tab-count">{count(label)}</span></button>)}</div>
      <div className="invoice-view-actions"><div className="invoice-views-holder"><button type="button" className="button invoice-view-button" onClick={()=>setViewsOpen(open=>!open)}><Icon name="dashboard" size={15}/>Views</button>{viewsOpen&&<div className="invoice-views-popover"><strong>Purchase order views</strong>{tabs.map(label=><button type="button" key={label} onClick={()=>{setTab(label);setViewsOpen(false)}}>{label}<small>{count(label)} purchase orders</small></button>)}</div>}</div></div>
    </div>
    <div className="table-panel invoice-list-panel">
      <div className="table-toolbar invoice-list-toolbar">
        <label className="search-box"><Icon name="search" size={15}/><input aria-label="Search purchase orders" placeholder="Search POs, suppliers, creators..." value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <button type="button" className="button filter-sort-button" onClick={()=>setSortNewest(value=>!value)}><Icon name="filter" size={15}/>{sortNewest?'Newest first':'Oldest first'}</button>
        <span className="table-count">{visible.length} purchase orders</span>
        <button type="button" className="button" onClick={()=>exportCsv(visible)}><Icon name="download" size={14}/>Export</button>
      </div>
      {visible.length?<>
        <div className="table-scroll"><table className="data-table listing-table invoice-data-table po-data-table"><thead><tr><th>STATUS</th><th>PURCHASE ORDER</th><th>SUPPLIER</th><th>PO DATE</th><th className="number">PO VALUE</th><th>INVOICED</th><th className="number">REMAINING</th><th>CREATED BY</th></tr></thead><tbody>{visible.map(row=><tr key={row.id} className="invoice-preview-row" tabIndex={0} aria-label={`Preview purchase order ${row.number}`} onClick={()=>setPeekId(row.id)} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setPeekId(row.id)}}}>
          <td><Badge label={row.status}/></td><td><button type="button" className="invoice-number-preview" aria-haspopup="dialog" onClick={event=>{event.stopPropagation();setPeekId(row.id)}}>{row.number}</button></td><td>{row.supplier}</td><td>{row.date}</td><td className="number">{row.amount}</td><td>{row.invoiced}</td><td className={`number ${value(row.remaining)<0?'text-warning':''}`}>{row.remaining}</td><td className="muted">{row.creator}</td>
        </tr>)}</tbody></table></div><div className="table-footer"><span>Showing {visible.length} of {rows.length}</span><span>Connected workspace</span></div>
      </>:<Empty title="No purchase orders match" message="Try another search or status filter."/>}
    </div>
    {peekId&&<ObjectPeek type="purchase_order" id={peekId} close={()=>setPeekId(null)}/>}
  </>;
}
