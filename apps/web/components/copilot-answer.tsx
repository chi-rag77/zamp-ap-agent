import type {ReactNode} from 'react';

export type CopilotVisualization=
 |{type:'invoice_processing';period:'all_time';total:number;aiProcessed:number;humanProcessed:number;awaitingDecision:number}
 |{type:'invoice_intake';periodDays:number;total:number;points:{label:string;count:number}[]};

function inlineMarkdown(text:string):ReactNode[]{
 const tokens=text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g).filter(Boolean);
 return tokens.map((token,index)=>{
  if((token.startsWith('**')&&token.endsWith('**'))||(token.startsWith('__')&&token.endsWith('__')))return <strong key={index}>{token.slice(2,-2)}</strong>;
  if(token.startsWith('`')&&token.endsWith('`'))return <code key={index}>{token.slice(1,-1)}</code>;
  if((token.startsWith('*')&&token.endsWith('*'))||(token.startsWith('_')&&token.endsWith('_')))return <em key={index}>{token.slice(1,-1)}</em>;
  return token;
 });
}

function isTableSeparator(line:string){return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)}
function tableCells(line:string){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim())}
function isBlockStart(lines:string[],index:number){const line=lines[index]??'';return /^\s{0,3}#{1,3}\s/.test(line)||/^\s*([-*+]\s+|\d+[.)]\s+)/.test(line)||Boolean(line.trim().startsWith('|')&&isTableSeparator(lines[index+1]??''))}

export function CopilotAnswer({content,visualization}:{content:string;visualization?:CopilotVisualization}){
 const normalized=content.replace(/\r/g,'').replace(/\n(\s*[-*+])\s+[-*+]\s+/g,'\n$1 ');
 const lines=normalized.split('\n');const blocks:ReactNode[]=[];let index=0;
 while(index<lines.length){
  if(!lines[index].trim()){index++;continue;}
  const heading=lines[index].match(/^\s{0,3}(#{1,3})\s+(.+)$/);
  if(heading){const Tag=`h${heading[1].length}` as 'h1'|'h2'|'h3';blocks.push(<Tag key={`h-${index}`}>{inlineMarkdown(heading[2].replace(/\s+#+\s*$/,''))}</Tag>);index++;continue;}
  if(lines[index].trim().startsWith('|')&&isTableSeparator(lines[index+1]??'')){
   const headers=tableCells(lines[index]);index+=2;const rows:string[][]=[];
   while(index<lines.length&&lines[index].trim().startsWith('|')){rows.push(tableCells(lines[index]));index++;}
   blocks.push(<div className="copilot-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell,i)=><th key={i}>{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row,r)=><tr key={r}>{headers.map((_,c)=><td key={c}>{inlineMarkdown(row[c]??'')}</td>)}</tr>)}</tbody></table></div>);continue;
  }
  const listMatch=lines[index].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.*)$/);
  if(listMatch){const ordered=/^\d/.test(listMatch[1]);const items:ReactNode[]=[];
   while(index<lines.length){const item=lines[index].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.*)$/);if(!item||/^\d/.test(item[1])!==ordered)break;items.push(<li key={index}>{inlineMarkdown(item[2])}</li>);index++;}
   const List=ordered?'ol':'ul';blocks.push(<List key={`list-${index}`}>{items}</List>);continue;
  }
  const paragraph:string[]=[];while(index<lines.length&&lines[index].trim()&&!isBlockStart(lines,index)){paragraph.push(lines[index].trim());index++;}
  if(!paragraph.length){paragraph.push(lines[index].trim());index++;}
  blocks.push(<p key={`p-${index}`}>{inlineMarkdown(paragraph.join(' '))}</p>);
 }
 return <div className="copilot-answer">{blocks}{visualization&&<PerformanceChart data={visualization}/>}</div>;
}

function PerformanceChart({data}:{data:CopilotVisualization}){
 if(data.type==='invoice_intake'){
  const max=Math.max(1,...data.points.map(point=>point.count));
  return <section className="copilot-performance" aria-label={`Invoice arrivals over the last ${data.periodDays} days`}>
   <div className="copilot-performance-head"><div><strong>Invoices received</strong><small>Last {data.periodDays} days · {data.total.toLocaleString()} total</small></div><span>ACTUAL DATA</span></div>
   <div className="copilot-intake-bars" role="img" aria-label={data.points.map(point=>`${point.label}: ${point.count} invoices`).join('; ')}>{data.points.map((point,index)=><div className="copilot-intake-bar-column" key={`${point.label}-${index}`}><strong>{point.count}</strong><i style={{height:`${Math.max(4,point.count/max*68)}px`}}/><small>{point.label}</small></div>)}</div>
  </section>;
 }
 const categories=[
  {label:'AI processed',value:data.aiProcessed,className:'ai'},
  {label:'Human decided',value:data.humanProcessed,className:'human'},
  {label:'Awaiting decision',value:data.awaitingDecision,className:'waiting'},
  {label:'Other',value:Math.max(0,data.total-data.aiProcessed-data.humanProcessed-data.awaitingDecision),className:'other'},
 ];
 const denominator=Math.max(1,data.total);
 return <section className="copilot-performance" aria-label="Invoice processing by decision owner">
  <div className="copilot-performance-head"><div><strong>Invoice processing</strong><small>All-time · {data.total.toLocaleString()} invoices</small></div><span>ACTUAL DATA</span></div>
  <div className="copilot-performance-bar" role="img" aria-label={categories.map(item=>`${item.label}: ${item.value}`).join(', ')}>{categories.map(item=><span key={item.className} className={`copilot-performance-segment ${item.className}`} style={{width:`${item.value/denominator*100}%`}}/>)}</div>
  <div className="copilot-performance-legend">{categories.filter(item=>item.value>0||item.className!=='other').map(item=><div key={item.className}><i className={item.className}/><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></div>)}</div>
  <small className="copilot-performance-note">AI processed includes auto-decisions and invoices routed for human review. Human decided counts invoices with a recorded human approval or rejection.</small>
 </section>;
}
