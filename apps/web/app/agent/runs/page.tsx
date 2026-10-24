import Link from 'next/link';
import {Badge,Empty,LocalNotice,PageHeading} from '../../../components/ui';
import {day,loadWorkspace} from '../../../lib/data';
export const dynamic='force-dynamic';
export default async function LiveRunsPage(){
  const w=await loadWorkspace();const live=w.agentRuns.filter(r=>['QUEUED','RUNNING','WAITING'].includes(r.status));
  return <><PageHeading title="Live runs" subtitle="Agent runs that are queued or processing"/><LocalNotice enabled={w.enabled}/>
    <div className="metrics-grid"><div className="metric"><div className="metric-label">ACTIVE RUNS</div><div className="metric-value">{live.length}</div><div className="metric-note">Queued or running</div></div><div className="metric"><div className="metric-label">RECENTLY COMPLETED</div><div className="metric-value">{w.agentRuns.filter(r=>r.status==='COMPLETED').length}</div><div className="metric-note">Latest 100 runs</div></div><div className="metric"><div className="metric-label">TECHNICAL FAILURES</div><div className="metric-value">{w.agentRuns.filter(r=>r.status==='FAILED').length}</div><div className="metric-note">Failed runs</div></div></div>
    <div className="table-panel">{live.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>INVOICE</th><th>CURRENT STEP</th><th>STARTED</th><th>STATUS</th><th></th></tr></thead><tbody>{live.map(r=><tr key={r.id}><td><Link className="mono" href={`/invoices/${r.invoice_id}`}>{w.invoices.find(i=>i.id===r.invoice_id)?.invoice_number??r.invoice_id.slice(0,8)}</Link></td><td>{r.current_step??r.current_state.replaceAll('_',' ')}</td><td>{day(r.started_at)}</td><td><Badge label={r.status}/></td><td><Link className="panel-link" href={`/agent/runs/${r.id}`}>View run →</Link></td></tr>)}</tbody></table></div>:<Empty title="No live runs" message="Start an agent run from an invoice to see live processing here." href="/agent" label="View all activity"/>}</div>
  </>;
}
