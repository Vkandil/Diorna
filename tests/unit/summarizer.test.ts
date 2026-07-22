import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleSummarizer,
  TemplateSummarizer,
  generateValidatedNarrative,
  listOllamaModels,
  type Summarizer,
} from "@/modules/recap/summarizer";
import type { RecapStatistics } from "@/shared/models";

const stats: RecapStatistics = {
  workspaceId: "w1",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  previousPeriodStart: "2026-08-01",
  habits: {
    overallRate: 80,
    previousRate: 75,
    best: { name: "Training", rate: 90 },
    worst: { name: "Reading", rate: 40 },
  },
  metrics: [],
  tasks: {
    completed: 12,
    previousCompleted: 10,
    onTime: 11,
    overdue: 1,
    byCategory: { Projects: 12 },
  },
  notes: { created: 3, edited: 5, wordsWritten: 600, titles: [] },
  maps: { created: 1, nodesCreated: 4 },
  flashcards: { reviewed: 0, retentionRate: null, streak: 0, courses: [] },
  dailyScores: [],
};

afterEach(() => vi.restoreAllMocks());

describe("summarizer boundary", () => {
  it("uses deterministic fallback with no provider", async () =>
    expect(await generateValidatedNarrative(null, stats, "Personal")).toMatchObject({
      modelUsed: "deterministic-template",
      fallback: true,
    }));
  it("accepts a factual primary narrative", async () => {
    const primary: Summarizer = { id: "test", summarize: async () => "You completed 12 tasks." };
    expect(await generateValidatedNarrative(primary, stats, "Personal")).toEqual({
      narrative: "You completed 12 tasks.",
      modelUsed: "test",
      fallback: false,
    });
  });
  it("retries a numeric mismatch then falls back", async () => {
    const summarize = vi.fn(async () => "You completed 999 tasks.");
    const result = await generateValidatedNarrative({ id: "bad", summarize }, stats, "Personal");
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(result.fallback).toBe(true);
  });
  it("calls an OpenAI-compatible endpoint with a strict prompt", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "You completed 12 tasks." } }] }),
          { status: 200 },
        ),
      );
    const summarizer = new OpenAICompatibleSummarizer({
      endpoint: "https://example.test/v1",
      model: "model",
      apiKey: "secret",
    });
    expect(await summarizer.summarize(stats, "Personal")).toContain("12");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0]![1]!;
    expect(String(request.body)).toContain("Never invent");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });
  it("rejects an empty provider response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    await expect(
      new OpenAICompatibleSummarizer({ endpoint: "https://example.test/v1", model: "m" }).summarize(
        stats,
        "Personal",
      ),
    ).rejects.toThrow("no narrative");
  });
  it("rejects provider HTTP errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 503 }));
    await expect(
      new OpenAICompatibleSummarizer({ endpoint: "https://example.test/v1", model: "m" }).summarize(
        stats,
        "Personal",
      ),
    ).rejects.toThrow("503");
  });
  it("lists installed Ollama models", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "llama3.2" }, { model: "qwen" }] }), {
        status: 200,
      }),
    );
    expect(await listOllamaModels()).toEqual(["llama3.2", "qwen"]);
  });
  it("returns no models when Ollama is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    expect(await listOllamaModels()).toEqual([]);
  });
  it("template summarizer identifies itself", async () => {
    const value = new TemplateSummarizer();
    expect(value.id).toBe("deterministic-template");
    expect(await value.summarize(stats, "Personal")).toContain("Tasks");
  });
});
