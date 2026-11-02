export type CopilotRoute = 'standard' | 'deep_analysis' | 'document_question';

export type CopilotModelConfig = {
  standard: string;
  deepAnalysis?: string;
  document?: string;
};

export function isAgentPerformanceQuestion(question: string): boolean {
  return /\b(agent performance|agent performing|ai versus humans?|ai vs\.? humans?|human versus ai|processed by (?:ai|humans?)|how is (?:the )?(?:ai|agent|copilot) doing|how many invoices (?:did|has|were|was).{0,35}(?:ai|human|agent|copilot))\b/i.test(question);
}

export function invoiceIntakePeriodDays(question: string): number | null {
  const hasInvoiceAndVolume = /\b(invoices?|bills?)\b/i.test(question)
    && /\b(how many|count|number of|volume|came in|arrived|received|submitted)\b/i.test(question);
  if (!hasInvoiceAndVolume) return null;
  const number = question.match(/\b(?:last|past|previous|over the last|in the last|within the last|came in)\s+(\d{1,3})\s+(days?|weeks?)\b/i);
  if (number) return Math.min(90, Math.max(1, Number(number[1]) * (number[2].toLowerCase().startsWith('week') ? 7 : 1)));
  if (/\b(last|past|previous)\s+week\b/i.test(question)) return 7;
  if (/\b(this|current)\s+week\b/i.test(question)) return 7;
  if (/\b(last|past|previous)\s+month\b/i.test(question)) return 30;
  if (/\b(last|past|previous)\s+quarter\b/i.test(question)) return 90;
  return null;
}

/**
 * Distinguish questions about AP concepts from requests for facts in the
 * current workspace. The model is allowed to explain general concepts; only
 * record-specific requests must be grounded in a Zamp lookup.
 */
export function requiresWorkspaceEvidence(question: string, hasPageContext = false): boolean {
  if (hasPageContext && /\b(this|that|these|those|here|it)\b/i.test(question)) return true;
  return /\b(my|our|current|latest|recent|find|search|look up|show|list|compare|how many|count|status of|amount of|history of)\b/i.test(question)
    || invoiceIntakePeriodDays(question) !== null
    || isAgentPerformanceQuestion(question)
    || /\b(?:invoice|inv|po|purchase order)\s*(?:number\s*)?(?:#?\s*)?(?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{3,}\b/i.test(question)
    || /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(question);
}

export function classifyCopilotRoute(question: string): CopilotRoute {
  if (/\b(document|scan|scanned|handwritten|image|picture|pdf|ocr|what does .* show|compare .* invoice)\b/i.test(question)) {
    return 'document_question';
  }
  if (/\b(analy[sz]e|trend|over time|quarter|last (?:month|quarter|year)|root cause|compare|across (?:all|multiple)|recommendations?|biggest drivers?)\b/i.test(question)) {
    return 'deep_analysis';
  }
  return 'standard';
}

export function resolveCopilotModel(question: string, config: CopilotModelConfig) {
  const route = classifyCopilotRoute(question);
  const candidate = route === 'deep_analysis' ? config.deepAnalysis
    : route === 'document_question' ? config.document
      : undefined;
  return {
    route,
    model: candidate || config.standard,
    fallback: route !== 'standard' && !candidate,
  } as const;
}
