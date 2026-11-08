import { config } from '../../config';
import { logger } from '../../lib/logger';

export interface AiSuggestionRequest {
  code: string;
  language: string;
  findings: { ruleId: string; title: string; description: string; severity: string; line: number }[];
}

export interface AiSuggestion {
  line: number;
  severity: string;
  suggestion: string;
  improvedCode?: string;
  explanation: string;
}

/**
 * Client for the Python AI microservice (FastAPI). Falls back to heuristic
 * suggestions built from the rule engine when the service is unavailable, so
 * the platform degrades gracefully instead of erroring.
 */
export async function getAiSuggestions(req: AiSuggestionRequest): Promise<AiSuggestion[]> {
  try {
    const res = await fetch(`${config.aiServiceUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const data = (await res.json()) as { suggestions: AiSuggestion[] };
    return data.suggestions;
  } catch (err) {
    logger.warn({ err }, 'AI service unavailable, using fallback heuristics');
    return fallbackSuggestions(req.findings);
  }
}

function fallbackSuggestions(findings: AiSuggestionRequest['findings']): AiSuggestion[] {
  return findings.slice(0, 20).map((f) => ({
    line: f.line,
    severity: f.severity,
    suggestion: `Address [${f.ruleId}] ${f.title}: ${f.description}`,
    explanation: `Rule ${f.ruleId} flagged this line. ${f.description}`,
  }));
}
