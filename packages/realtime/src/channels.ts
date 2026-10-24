import type {EventChannel} from './types';
export const invoiceChannel=(id:string):EventChannel=>`invoice:${id}`;
export const runChannel=(id:string):EventChannel=>`run:${id}`;
export const agentActivityChannel:EventChannel='agent:activity';
export const dashboardMetricsChannel:EventChannel='dashboard:metrics';
