export type CopilotRoute = 'standard' | 'deep_analysis' | 'document_question';

export type CopilotModelConfig = {
  standard: string;
  deepAnalysis?: string;
  document?: string;
};

/**
 * Distinguish questions about AP concepts from requests for facts in the
 * current workspace. The model is allowed to explain general concepts; only
 * record-specific requests must be grounded in a Zamp lookup.
 */
export function requiresWorkspaceEvidence(question: string, hasPageContext = false): boolean {
  if (hasPageContext && /\b(this|that|these|those|here|it)\b/i.test(question)) return true;
  return /\b(my|our|current|latest|recent|find|search|look up|show|list|compare|how many|count|status of|amount of|history of)\b/i.test(question)
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
