export function WorkspaceBrief({summary,stats}:{summary:string;stats:Array<[string,string|number]>}){
  return <section className="workspace-brief" aria-label="Workspace summary">
    <span className="workspace-brief-mark" aria-hidden="true">✧</span>
    <span className="workspace-brief-brand">ZAMP</span>
    <strong>{summary}</strong>
    <div className="workspace-brief-stats">{stats.map(([label,value])=><span key={label}><b>{value}</b> {label}</span>)}</div>
  </section>;
}
