import Link from 'next/link';
import {Badge,Empty,LocalNotice,PageHeading} from '../../../components/ui';
import {day,loadWorkspace,vendorName} from '../../../lib/data';
import {formatRunElapsed,matchesRunFilter,runFilters,type RunFilter} from '../../../lib/run-filters';

export const dynamic='force-dynamic';

export default async function LiveRunsPage({searchParams}:{searchParams:Promise<{status?:string}>}){
  const [{status:requested},w]=await Promise.all([searchParams,loadWorkspace('runs')]);
  const active=(['all','running','review','completed','failed','retrying'] as string[]).includes(requested??'')?(requested as RunFilter):'all';
  const runs=w.agentRuns.filter(run=>matchesRunFilter(active,run));
  const counts=Object.fromEntries(runFilters.map(filter=>[filter.key,w.agentRuns.filter(run=>matchesRunFilter(filter.key,run)).length])) as Record<RunFilter,number>;
  return <><PageHeading title="Live runs" subtitle="Monitor active processing and inspect recent agent executions"/><LocalNotice enabled={w.enabled}/>
    <div className="metrics-grid"><div className="metric"><div className="metric-label">ACTIVE RUNS</div><div className="metric-value">{w.agentRuns.filter(r=>['QUEUED','RUNNING'].includes(r.status)).length}</div><div className="metric-note">Queued or processing</div></div><div className="metric"><div className="metric-label">RECENTLY COMPLETED</div><div className="metric-value">{counts.completed}</div><div className="metric-note">Latest {w.agentRuns.length} orchestration runs</div></div><div className="metric"><div className="metric-label">TECHNICAL FAILURES</div><div className="metric-value">{counts.failed}</div><div className="metric-note">Runs requiring recovery</div></div></div>
    <nav className="tabs run-filter-tabs" aria-label="Filter agent runs">{runFilters.map(filter=><Link key={filter.key} className={`tab ${active===filter.key?'active':''}`} aria-current={active===filter.key?'page':undefined} href={filter.key==='all'?'/agent/runs':`/agent/runs?status=${filter.key}`}>{filter.label}<span className="tab-count">{counts[filter.key]}</span></Link>)}</nav>
    <div className="table-panel">{runs.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>INVOICE</th><th>VENDOR</th><th>STATUS</th><th>CURRENT STEP</th><th>PROGRESS</th><th>ELAPSED</th><th>STARTED</th><th>DECISION</th><th></th></tr></thead><tbody>{runs.map(run=>{const invoice=w.invoices.find(i=>i.id===run.invoice_id);const current=run.current_step??run.current_state.replaceAll('_',' ');return <tr key={run.id}><td><Link className="mono" href={`/invoices/${run.invoice_id}`}>{invoice?.invoice_number??run.invoice_id.slice(0,8)}</Link></td><td>{invoice?vendorName(w,invoice):'—'}</td><td><Badge label={run.status}/></td><td>{current}</td><td>{run.step_count} {run.step_count===1?'step':'steps'}</td><td>{formatRunElapsed(run.started_at,run.completed_at,run.duration_ms)}</td><td>{day(run.started_at)}</td><td>{run.final_decision?.replaceAll('_',' ')??'—'}</td><td><Link className="panel-link" href={`/agent/runs/${run.id}`}>View run →</Link></td></tr>})}</tbody></table></div>:<Empty title={w.agentRuns.length?'No runs match':'No runs yet'} message={w.agentRuns.length?'Choose another run status to see its executions.':'Start an agent run from an invoice to see processing here.'} href="/agent" label="View agent activity"/>}</div>
  </>;
}
