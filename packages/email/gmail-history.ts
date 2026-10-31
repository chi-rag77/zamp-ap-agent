import {createServerClient} from '@zamp/database';
import {GmailClient} from './gmail-client';
import {gmailMailbox} from './gmail-auth';
import {EmailError} from './errors';
import {processEmailMessage} from './intake-processor';

// Keep each full-sync request short enough for a serverless invocation. The caller
// can safely request the next page using the persisted continuation token.
const FULL_SYNC_PAGE_SIZE=25;
// Gmail history can span many pages after an extended outage. Persist its cursor
// and process at most this many pages per invocation to bound serverless work.
const HISTORY_PAGE_LIMIT=5;

export async function syncGmailMailbox(client=new GmailClient(),processMessage=processEmailMessage){
 const mailbox=gmailMailbox();
 if(!mailbox)throw new Error('Gmail mailbox not configured');
 const profile=await client.getProfile();
 if(profile.emailAddress.toLowerCase()!==mailbox.toLowerCase())throw new Error('Configured Gmail mailbox does not match OAuth account');

 const db=createServerClient();
 const {data:prior,error:priorError}=await db.from('email_sync_state').select('*').eq('mailbox',mailbox).maybeSingle();
 if(priorError)throw priorError;

 const cursor=prior?.last_history_id as string|undefined;
 let fullSync=!cursor||prior?.status==='REQUIRES_FULL_SYNC';
 let fullSyncPageToken=(prior?.full_sync_page_token as string|undefined)??undefined;
 let historyPageToken=(prior?.history_page_token as string|undefined)??undefined;
 let historyTargetId=(prior?.history_target_id as string|undefined)??undefined;
 const begun=await db.from('email_sync_state').upsert({
  provider:'GMAIL',mailbox,last_history_id:cursor??null,
  status:fullSync?'REQUIRES_FULL_SYNC':'SYNCING',last_error:null,
 },{onConflict:'provider,mailbox'});
 if(begun.error)throw begun.error;

 let latest=profile.historyId;
 const ids=new Set<string>();
 try{
  if(!fullSync){
   try{
    let page=historyPageToken;
    let pagesRead=0;
    do{
     const result=await client.listHistory(cursor!,page);
     for(const history of result.history??[]){
      // Gmail history includes sent messages as well as inbox mail. Inspect only
      // metadata labels here so outbound notifications are never ingested as invoices.
      for(const added of history.messagesAdded??[]){
       const metadata=await client.getMessageMetadata(added.message.id);
       if(metadata.labelIds?.includes('INBOX'))ids.add(added.message.id);
      }
      for(const added of history.labelsAdded??[])if(added.labelIds.includes('INBOX'))ids.add(added.message.id);
     }
     latest=result.historyId??latest;
     page=result.nextPageToken;
     pagesRead++;
    }while(page&&pagesRead<HISTORY_PAGE_LIMIT);
    historyPageToken=page;
    if(historyPageToken)historyTargetId=latest;
   }catch(error){
    if(error instanceof EmailError&&error.code==='EMAIL_MESSAGE_NOT_FOUND'){
     fullSync=true;
     fullSyncPageToken=undefined;
     historyPageToken=undefined;historyTargetId=undefined;
     const marked=await db.from('email_sync_state').update({status:'REQUIRES_FULL_SYNC',full_sync_page_token:null,history_page_token:null,history_target_id:null}).eq('mailbox',mailbox);
     if(marked.error)throw marked.error;
    }else throw error;
   }
  }

  // A bounded recent-inbox check repairs missed history notifications and finds
  // older messages that only just became visible in the inbox. Existing records
  // are skipped before downloading the message or running extraction again.
  if(!fullSync){
   const recent=await client.listMessages('in:inbox has:attachment newer_than:2d',undefined,100);
   const candidates=(recent.messages??[]).map(item=>item.id).filter(Boolean);
   if(candidates.length){
    const {data:known,error:knownError}=await db.from('email_intakes').select('message_id').eq('provider','GMAIL').in('message_id',candidates);
    if(knownError)throw knownError;
    const seen=new Set((known??[]).map(row=>row.message_id));
    for(const id of candidates)if(!seen.has(id))ids.add(id);
   }
  }

  let nextFullSyncPageToken:string|undefined;
  if(fullSync){
   const query=process.env.GMAIL_INTAKE_QUERY??'in:inbox newer_than:30d';
   const result=await client.listMessages(query,fullSyncPageToken,FULL_SYNC_PAGE_SIZE);
   for(const item of result.messages??[])ids.add(item.id);
   nextFullSyncPageToken=result.nextPageToken;
   latest=profile.historyId;
  }

  // History cursors and full-sync pagination can return already handled messages.
  // Skip every durable intake, including failed ones that need an explicit reprocess.
  if(ids.size){
   const {data:known,error:knownError}=await db.from('email_intakes').select('message_id').eq('provider','GMAIL').in('message_id',[...ids]);
   if(knownError)throw knownError;
   const seen=new Set((known??[]).map(row=>row.message_id));
   for(const id of seen)ids.delete(id);
  }

  let processed=0,failed=0;
  for(const id of ids){
   let outcome;
   try{outcome=await processMessage(id,{client});}
   catch(error){if(error instanceof EmailError&&error.code==='EMAIL_MESSAGE_NOT_FOUND')continue;throw error;}
   // A returned FAILED result is durable: processEmailMessage has written the
   // intake and its failure details. Keep it visible for review/reprocessing,
   // but do not let one poison message block later mail or pin the history cursor.
   if(outcome.status==='FAILED')failed++;
   else processed++;
  }

  const syncNote=failed?`${failed} email(s) failed processing and remain available in the review queue.`:null;

  if(fullSync&&nextFullSyncPageToken){
   // The page may advance past per-message failures because their intake failure
   // has been persisted. Thrown provider/database errors still abort and preserve
   // the old token so the page can be retried without losing messages.
   const saved=await db.from('email_sync_state').upsert({
    provider:'GMAIL',mailbox,last_history_id:cursor??null,
    full_sync_page_token:nextFullSyncPageToken,history_page_token:null,history_target_id:null,status:'REQUIRES_FULL_SYNC',last_error:syncNote,
   },{onConflict:'provider,mailbox'});
   if(saved.error)throw saved.error;
   return {mailbox,fullSync,processed,failed,historyId:cursor??null,hasMore:true};
  }

  if(!fullSync&&historyPageToken){
   const saved=await db.from('email_sync_state').upsert({
    provider:'GMAIL',mailbox,last_history_id:cursor??null,history_page_token:historyPageToken,
    history_target_id:historyTargetId??latest,status:'SYNCING',last_error:syncNote,
   },{onConflict:'provider,mailbox'});
   if(saved.error)throw saved.error;
   return {mailbox,fullSync,processed,failed,historyId:cursor??null,hasMore:true};
  }

  const result=await db.from('email_sync_state').upsert({
   provider:'GMAIL',mailbox,last_history_id:latest,full_sync_page_token:null,history_page_token:null,history_target_id:null,
   last_successful_sync_at:new Date().toISOString(),status:'HEALTHY',last_error:syncNote,
  },{onConflict:'provider,mailbox'});
  if(result.error)throw result.error;
  return {mailbox,fullSync,processed,failed,historyId:latest,hasMore:false};
 }catch(error){
  await db.from('email_sync_state').upsert({
   provider:'GMAIL',mailbox,last_history_id:cursor??null,
   status:fullSync?'REQUIRES_FULL_SYNC':'FAILED',
   last_error:error instanceof Error?error.message:'Sync failed',
  },{onConflict:'provider,mailbox'});
  throw error;
 }
}
