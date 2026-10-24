'use client';
import {useState} from 'react';

type Series={dates:string[];received:number[];processed:number[];exceptions:number[]};
export function DashboardVolumeChart({series}:{series:Series}){
  const [selected,setSelected]=useState<'received'|'processed'|'exceptions'>('received');
  const values=series[selected],max=Math.max(4,...series.received,...series.processed,...series.exceptions);
  const x=(index:number)=>38+index*(714/Math.max(1,values.length-1));
  const y=(value:number)=>195-value/max*164;
  const line=values.map((value,index)=>`${index?'L':'M'}${x(index)} ${y(value)}`).join(' ');
  const area=`${line} L${x(values.length-1)} 195 L${x(0)} 195 Z`;
  const total=values.reduce((sum,value)=>sum+value,0);
  const peak=Math.max(...values);
  const peakIndex=values.indexOf(peak);
  return <section className="ap-card ap-chart-card"><div className="ap-card-head"><div><h2>Invoice processing</h2><p>Daily volume across the last 14 days</p></div><div className="ap-chart-tabs" role="tablist" aria-label="Invoice volume">{(['received','processed','exceptions'] as const).map(name=><button key={name} role="tab" aria-selected={selected===name} className={selected===name?'active':''} onClick={()=>setSelected(name)}>{name[0].toUpperCase()+name.slice(1)}</button>)}</div></div><div className="ap-chart-wrap"><svg viewBox="0 0 780 245" role="img" aria-label={`${selected} invoice volume over fourteen days`}><defs><linearGradient id="ap-volume-area" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#7ca9f5" stopOpacity=".22"/><stop offset="1" stopColor="#7ca9f5" stopOpacity="0"/></linearGradient></defs>{[0,1,2,3,4].map(index=><g key={index}><line x1="38" x2="752" y1={195-index*41} y2={195-index*41} stroke="#e9edf2"/><text x="3" y={199-index*41} fill="#9aa4af" fontSize="10">{Math.round(max*index/4)}</text></g>)}<path d={area} fill="url(#ap-volume-area)"/><path d={line} fill="none" stroke="#3d72df" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>{values.map((value,index)=>value>0?<circle key={index} cx={x(index)} cy={y(value)} r="2.8" fill="#3d72df"/>:null)}{series.dates.map((date,index)=>index%2===0?<text key={index} x={x(index)-14} y="224" fill="#9aa4af" fontSize="10">{date}</text>:null)}</svg></div><div className="ap-chart-foot"><span>{peak?`Peak ${peak} invoice${peak===1?'':'s'} · ${series.dates[peakIndex]}`:'No invoices in this period'}</span><span>14-day total {total} {selected}</span></div></section>;
}
