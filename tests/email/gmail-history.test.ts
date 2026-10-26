import {afterEach,describe,it,expect,vi} from 'vitest';
import type {GmailClient} from '../../packages/email/gmail-client';
import {EmailError} from '../../packages/email/errors';

const state=vi.hoisted(()=>({
 row:{last_history_id:'100',status:'HEALTHY',full_sync_page_token:null} as Record<string,unknown>,
 writes:[] as Record<string,unknown>[],
 known:[] as string[],
 reset(){this.known=[];this.row={last_history_id:'100',status:'HEALTHY',full_sync_page_token:null};this.writes=[];},
}));

vi.mock('@zamp/database',()=>({createServerClient:()=>({from:()=>({
 select:()=>({eq:()=>({maybeSingle:async()=>({data:{...state.row},error:null}),in:async()=>({data:state.known.map(message_id=>({message_id})),error:null})})}),
 upsert:async(row:Record<string,unknown>)=>{state.writes.push(row);state.row={...state.row,...row};return {error:null};},
 update:(row:Record<string,unknown>)=>({eq:async()=>{state.row={...state.row,...row};return {error:null};}}),
})})}));

import {syncGmailMailbox} from '../../packages/email/gmail-history';

afterEach(()=>{vi.unstubAllEnvs();state.reset();});

describe('Gmail history synchronization',()=>{
 it('falls back to full sync on an expired cursor and advances after processing',async()=>{
  vi.stubEnv('GMAIL_INVOICE_MAILBOX','ap@example.com');
  const client={getProfile:async()=>({emailAddress:'ap@example.com',historyId:'200'}),listHistory:async()=>{throw new EmailError('EMAIL_MESSAGE_NOT_FOUND','expired');},listMessages:async()=>({messages:[{id:'m1'}]})} as unknown as GmailClient;
  const processed:string[]=[];
  const result=await syncGmailMailbox(client,async id=>{processed.push(id);return {status:'PROCESSED'} as never;});
  expect(result.fullSync).toBe(true);
  expect(result.hasMore).toBe(false);
  expect(processed).toEqual(['m1']);
  expect(state.row).toMatchObject({last_history_id:'200',full_sync_page_token:null,status:'HEALTHY'});
 });

 it('keeps the old cursor when incremental processing fails',async()=>{
  vi.stubEnv('GMAIL_INVOICE_MAILBOX','ap@example.com');
  const client={getProfile:async()=>({emailAddress:'ap@example.com',historyId:'200'}),listHistory:async()=>({historyId:'200',history:[{id:'150',messagesAdded:[{message:{id:'m1'}}]}]}),listMessages:async()=>({messages:[]})} as unknown as GmailClient;
  await expect(syncGmailMailbox(client,async()=>({status:'FAILED'} as never))).rejects.toThrow('failed processing');
  expect(state.row).toMatchObject({last_history_id:'100',status:'FAILED'});
 });

 it('catches an invoice moved into the inbox without reprocessing known messages',async()=>{
  vi.stubEnv('GMAIL_INVOICE_MAILBOX','ap@example.com');
  state.known=['seen'];
  const processed:string[]=[];
  const client={getProfile:async()=>({emailAddress:'ap@example.com',historyId:'200'}),listHistory:async()=>({historyId:'200',history:[{id:'190',labelsAdded:[{message:{id:'moved'},labelIds:['INBOX']},{message:{id:'other'},labelIds:['STARRED']}]}]}),listMessages:async()=>({messages:[{id:'seen'},{id:'fresh'}]})} as unknown as GmailClient;
  const result=await syncGmailMailbox(client,async id=>{processed.push(id);return {status:'PROCESSED'} as never;});
  expect(result).toMatchObject({fullSync:false,processed:2,historyId:'200'});
  expect(processed).toEqual(['moved','fresh']);
 });

 it('resumes full sync from its saved page token and advances the history cursor only on the last page',async()=>{
  vi.stubEnv('GMAIL_INVOICE_MAILBOX','ap@example.com');
  state.row={last_history_id:null,status:'REQUIRES_FULL_SYNC',full_sync_page_token:null};
  const calls:{page?:string;size?:number}[]=[];
  const client={
   getProfile:async()=>({emailAddress:'ap@example.com',historyId:'250'}),
   listMessages:async(_query:string,page?:string,size?:number)=>{calls.push({page,size});return page?{messages:[{id:'m2'}]}:{messages:[{id:'m1'}],nextPageToken:'page-2'};},
  } as unknown as GmailClient;
  const processed:string[]=[];
  const processor=async(id:string)=>{processed.push(id);return {status:'PROCESSED'} as never;};

  const first=await syncGmailMailbox(client,processor);
  expect(first).toMatchObject({fullSync:true,hasMore:true,historyId:null,processed:1});
  expect(state.row).toMatchObject({last_history_id:null,status:'REQUIRES_FULL_SYNC',full_sync_page_token:'page-2'});

  const second=await syncGmailMailbox(client,processor);
  expect(second).toMatchObject({fullSync:true,hasMore:false,historyId:'250',processed:1});
  expect(calls).toEqual([{page:undefined,size:25},{page:'page-2',size:25}]);
  expect(processed).toEqual(['m1','m2']);
  expect(state.row).toMatchObject({last_history_id:'250',status:'HEALTHY',full_sync_page_token:null});
 });

 it('does not advance the page token when a message fails processing',async()=>{
  vi.stubEnv('GMAIL_INVOICE_MAILBOX','ap@example.com');
  state.row={last_history_id:null,status:'REQUIRES_FULL_SYNC',full_sync_page_token:'retry-this-page'};
  const client={getProfile:async()=>({emailAddress:'ap@example.com',historyId:'250'}),listMessages:async(_query:string,page?:string)=>({messages:[{id:'m1'}],nextPageToken:'next-page',page})} as unknown as GmailClient;
  await expect(syncGmailMailbox(client,async()=>({status:'FAILED'} as never))).rejects.toThrow('failed processing');
  expect(state.row).toMatchObject({last_history_id:null,status:'REQUIRES_FULL_SYNC',full_sync_page_token:'retry-this-page'});
 });
});
