import {describe,expect,it} from 'vitest';
import {agentWorkerUrl} from '../../apps/web/lib/agent-worker';

describe('agent worker dispatch URL',()=>{
 it('uses the local plain-HTTP listener for Render deployments',()=>{
  expect(agentWorkerUrl('https://zamp-ap-agent.onrender.com',{RENDER_EXTERNAL_URL:'https://zamp-ap-agent.onrender.com',PORT:'10000'}).toString()).toBe('http://127.0.0.1:10000/api/agent/worker');
 });
 it('uses the request origin on hosts without Render listener metadata',()=>{
  expect(agentWorkerUrl('https://zamp.example.com',{PORT:'10000'}).toString()).toBe('https://zamp.example.com/api/agent/worker');
 });
 it('ignores invalid Render port configuration',()=>{
  expect(agentWorkerUrl('https://zamp.example.com',{RENDER_EXTERNAL_URL:'https://zamp.onrender.com',PORT:'not-a-port'}).toString()).toBe('https://zamp.example.com/api/agent/worker');
 });
});
