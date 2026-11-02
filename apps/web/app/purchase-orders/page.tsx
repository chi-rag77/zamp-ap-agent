import {LocalNotice,PageHeading} from '../../components/ui';
import {PurchaseOrderTable,type PurchaseOrderView} from '../../components/purchase-order-table';
import {WorkspaceBrief} from '../../components/workspace-brief';
import {loadWorkspace,money,day} from '../../lib/data';
import {objectContext,WorkspaceError} from '../../lib/objects';

export const dynamic='force-dynamic';

export default async function PurchaseOrdersPage(){
  const context=await objectContext();
  const workspace=await loadWorkspace('purchaseOrders',context.db);
  const purchaseOrders=workspace.purchaseOrders;
  const ids=new Set(purchaseOrders.map(po=>po.id));
  const events=ids.size?await context.db.from('audit_events').select('actor_id,metadata').eq('organization_id',context.organizationId).eq('metadata->>objectType','purchase_order').not('actor_id','is',null).in('metadata->>objectId',[...ids]).order('created_at',{ascending:true}).limit(500):{data:[],error:null};
  if(events.error)throw new WorkspaceError('Purchase-order creators could not be loaded.',503);
  const actorByPo=new Map<string,string>();
  for(const event of events.data??[]){
    const metadata=event.metadata&&typeof event.metadata==='object'?event.metadata as Record<string,unknown>:{};
    const poId=String(metadata.objectId??'');
    if(ids.has(poId)&&event.actor_id&&!actorByPo.has(poId))actorByPo.set(poId,String(event.actor_id));
  }
  const actorIds=[...new Set(actorByPo.values())];
  const members=actorIds.length?await context.db.from('organization_memberships').select('workos_user_id,email').eq('organization_id',context.organizationId).in('workos_user_id',actorIds):{data:[],error:null};
  if(members.error)throw new WorkspaceError('Purchase-order creators could not be resolved.',503);
  const emailByActor=new Map((members.data??[]).map(member=>[member.workos_user_id,member.email]));
  const invoicedFor=(poId:string)=>workspace.invoices.filter(invoice=>invoice.po_id===poId).reduce((sum,invoice)=>sum+Number(invoice.total??0),0);
  const rows:PurchaseOrderView[]=purchaseOrders.map(po=>({
    id:po.id,
    number:po.po_number,
    supplier:workspace.vendors.find(vendor=>vendor.id===po.vendor_id)?.display_name??'Unknown supplier',
    date:day(po.po_date),
    amount:money(po.total,po.currency),
    currency:po.currency,
    invoiced:money(invoicedFor(po.id),po.currency),
    remaining:money(Number(po.total)-invoicedFor(po.id),po.currency),
    status:Number(po.total)>0&&invoicedFor(po.id)>Number(po.total)?'VARIANCE':po.status,
    creator:emailByActor.get(actorByPo.get(po.id)??'')??'Not recorded',
  }));
  const open=purchaseOrders.filter(po=>['OPEN','PARTIALLY_RECEIVED'].includes(po.status));
  const overbilled=purchaseOrders.filter(po=>invoicedFor(po.id)>Number(po.total));
  const summary=overbilled.length?`${overbilled.length} ${overbilled.length===1?'purchase order has':'purchase orders have'} linked invoices above the PO value.`:'Review purchase orders, linked invoices, and remaining commitments in one place.';
  return <>
    <PageHeading title="Purchase orders" subtitle="Every purchase order available to the AP Agent"/>
    <LocalNotice enabled={workspace.enabled}/>
    <WorkspaceBrief summary={summary} stats={[["in queue",rows.length],["open",open.length],["with variance",overbilled.length]]}/>
    <PurchaseOrderTable rows={rows}/>
  </>;
}
