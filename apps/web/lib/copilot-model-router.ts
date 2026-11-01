export type CopilotRoute = 'standard' | 'deep_analysis' | 'document_question';

export type CopilotModelConfig = {
  standard: string;
  deepAnalysis?: string;
  document?: string;
};

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
