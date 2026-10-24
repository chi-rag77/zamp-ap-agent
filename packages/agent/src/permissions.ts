import {AgentError} from './errors';
import type {AgentContext} from './types';
export function assertToolPermission(category:string,context:AgentContext){if(category==='ACTION'&&context.mode==='SIMULATION')throw new AgentError('ACTION_NOT_ALLOWED','Simulation cannot execute actions');if(category==='ACTION'&&context.state!=='EXECUTING')throw new AgentError('ACTION_NOT_ALLOWED','Action state is not active')}
