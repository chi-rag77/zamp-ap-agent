import Link from 'next/link';
import {Badge,Empty,LocalNotice,PageHeading} from '../../components/ui';
import {loadWorkspace,day} from '../../lib/data';
export const dynamic='force-dynamic';
export default async function AgentPage(){
  const w=await loadWorkspace();
  return <><PageHeading title="Agent activity" subtitle="Invoice decisions, guarded actions, and live agent traces"/><LocalNotice enabled={w.enabled}/>
    <div className="metrics-grid"><div className="metric"><div className="metric-label">AGENT RUNS</div><div className="metric-value">{w.agentRuns.length}</div><div className="metric-note">Latest 100 orchestration runs</div></div><div className="metric"><div className="metric-label">COMPLETED</div><div className="metric-value">{w.agentRuns.filter(r=>r.status==='COMPLETED').length}</div><div className="metric-note">Includes review outcomes</div></div><div className="metric"><div className="metric-label">ACTIVE</div><div className="metric-value">{w.agentRuns.filter(r=>['QUEUED','RUNNING','WAITING'].includes(r.status)).length}</div><div className="metric-note">Queued or processing now</div></div></div>
    <div className="table-panel">{w.agentRuns.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>INVOICE</th><th>STATE</th><th>DECISION</th><th>STEPS</th><th>STARTED</th><th>STATUS</th><th></th></tr></thead><tbody>{w.agentRuns.map(run=><tr key={run.id}><td><Link className="mono" href={`/invoices/${run.invoice_id}`}>{w.invoices.find(i=>i.id===run.invoice_id)?.invoice_number??run.invoice_id.slice(0,8)}</Link></td><td>{run.current_state.replaceAll('_',' ')}</td><td>{run.final_decision?.replaceAll('_',' ')??'—'}</td><td>{run.step_count}</td><td>{day(run.started_at)}</td><td><Badge label={run.status}/></td><td><Link className="panel-link" href={`/agent/runs/${run.id}`}>View run →</Link></td></tr>)}</tbody></table></div>:<Empty title="No agent runs yet" message="Open an invoice to start a guarded agent run." href="/invoices" label="Go to invoices"/>}</div>
  </>;
}
