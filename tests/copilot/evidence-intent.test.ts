import {describe,expect,it} from 'vitest';
import {requiresWorkspaceEvidence} from '../../apps/web/lib/copilot-model-router';

describe('Copilot workspace evidence intent',()=>{
  it('allows general AP workflow explanations without record lookups',()=>{
    expect(requiresWorkspaceEvidence('Explain how a three-way match works in accounts payable using a simple generic example.')).toBe(false);
    expect(requiresWorkspaceEvidence('What does a price variance mean on an invoice?')).toBe(false);
    expect(requiresWorkspaceEvidence('How should I investigate a duplicate invoice?')).toBe(false);
  });

  it('requires evidence for workspace-specific and explicit record lookup questions',()=>{
    expect(requiresWorkspaceEvidence('Show my invoice queue summary')).toBe(true);
    expect(requiresWorkspaceEvidence('What is the status of invoice AIS/26-27/0847?')).toBe(true);
    expect(requiresWorkspaceEvidence('Explain why this invoice failed',true)).toBe(true);
    expect(requiresWorkspaceEvidence('Compare the latest invoices')).toBe(true);
  });
});
