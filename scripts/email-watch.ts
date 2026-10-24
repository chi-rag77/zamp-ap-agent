import './load-env';
import {renewGmailWatch} from '@zamp/email';
const result=await renewGmailWatch();console.log(JSON.stringify(result));
