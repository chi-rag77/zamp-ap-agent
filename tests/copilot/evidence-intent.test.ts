import {describe,expect,it} from 'vitest';
import {invoiceIntakePeriodDays,isAgentPerformanceQuestion,requiresWorkspaceEvidence} from '../../apps/web/lib/copilot-model-router';

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

  it('recognizes agent performance questions as organization-specific metrics requests',()=>{
    for (const question of [
      'How is the AI agent performing?',
      'How many invoices were processed by AI versus humans?',
      'Show AI vs human invoice processing',
    ]) {
      expect(isAgentPerformanceQuestion(question)).toBe(true);
      expect(requiresWorkspaceEvidence(question)).toBe(true);
    }
  });

  it('recognizes invoice intake volumes and their requested time window',()=>{
    expect(invoiceIntakePeriodDays('How many invoices came in 7 days?')).toBe(7);
    expect(invoiceIntakePeriodDays('How many invoices arrived over the last 2 weeks?')).toBe(14);
    expect(invoiceIntakePeriodDays('Count invoices in the last 30 days')).toBe(30);
    expect(invoiceIntakePeriodDays('How many invoices came in last week?')).toBe(7);
    expect(invoiceIntakePeriodDays('Explain what an invoice is')).toBeNull();
    expect(requiresWorkspaceEvidence('How many invoices came in 7 days?')).toBe(true);
  });
});
