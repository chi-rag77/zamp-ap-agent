import './load-env';
import {syncGmailMailbox} from '@zamp/email';
const result=await syncGmailMailbox();console.log(JSON.stringify(result));
