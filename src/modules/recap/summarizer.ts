import type { RecapStatistics } from "@/shared/models";
import { buildTemplateNarrative, validateNarrativeNumbers } from "./logic";

export interface Summarizer {
  readonly id: string;
  summarize(stats: RecapStatistics, workspaceName: string, signal?: AbortSignal): Promise<string>;
}

export interface ChatProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
}

export class OpenAICompatibleSummarizer implements Summarizer {
  readonly id: string;
  constructor(
    private readonly config: ChatProviderConfig,
    id = "remote",
  ) {
    this.id = id;
  }

  async summarize(
    stats: RecapStatistics,
    workspaceName: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    const url = endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      ...(signal ? { signal } : {}),
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...this.config.headers,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature ?? 0.2,
        max_tokens: this.config.maxTokens ?? 1600,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Workspace: ${workspaceName}\nStatistics JSON:\n${JSON.stringify(stats)}`,
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Summarizer returned ${response.status}`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Summarizer returned no narrative");
    return content;
  }
}

export class TemplateSummarizer implements Summarizer {
  readonly id = "deterministic-template";
  async summarize(stats: RecapStatistics, workspaceName: string): Promise<string> {
    return buildTemplateNarrative(stats, workspaceName);
  }
}

export async function listOllamaModels(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch("http://localhost:11434/api/tags", signal ? { signal } : {});
  if (!response.ok) return [];
  const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
  return (body.models ?? [])
    .map((entry) => entry.name ?? entry.model)
    .filter((value): value is string => Boolean(value));
}

export function createOllamaSummarizer(model: string): Summarizer {
  return new OpenAICompatibleSummarizer({ endpoint: "http://localhost:11434/v1", model }, "ollama");
}

export async function generateValidatedNarrative(
  primary: Summarizer | null,
  stats: RecapStatistics,
  workspaceName: string,
  signal?: AbortSignal,
): Promise<{ narrative: string; modelUsed: string; fallback: boolean }> {
  if (primary) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const narrative = await primary.summarize(stats, workspaceName, signal);
      if (validateNarrativeNumbers(narrative, stats).valid)
        return { narrative, modelUsed: primary.id, fallback: false };
    }
  }
  return {
    narrative: buildTemplateNarrative(stats, workspaceName),
    modelUsed: "deterministic-template",
    fallback: true,
  };
}

const systemPrompt = `You write concise monthly or yearly accomplishment recaps from a supplied statistics object.
Use only facts in that object. Never invent, infer, round, combine, or introduce a number that is not explicitly present.
Do not mention activity monitoring: all source data was entered by the user.
Write Markdown with a bold lead sentence for each category. Discuss meaningful improvements and declines.
Every numeric token in the response is validated automatically. A mismatch rejects the entire response.`;
