export default function Loading(){
  return <section className="route-loading" aria-label="Loading page" aria-busy="true">
    <div className="route-loading-heading"><span/><span/></div>
    <div className="route-loading-toolbar"><i/><i/><i/><i/></div>
    <div className="route-loading-panel"><div className="route-loading-panel-head"><i/><i/></div><div className="route-loading-lines">{Array.from({length:7},(_,index)=><span key={index}/>)}</div></div>
    <span className="route-loading-status" role="status">Loading workspace data…</span>
  </section>
}
