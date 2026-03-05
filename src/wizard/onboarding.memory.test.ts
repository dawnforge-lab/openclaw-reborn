import { describe, expect, it, vi } from "vitest";
import { createWizardPrompter as buildWizardPrompter } from "../../test/helpers/wizard-prompter.js";
import type { WizardPrompter } from "./prompts.js";
import { configureMemoryForOnboarding } from "./onboarding.memory.js";

describe("configureMemoryForOnboarding", () => {
  function createPrompter(overrides?: {
    confirm?: ReturnType<typeof vi.fn>;
    text?: ReturnType<typeof vi.fn>;
  }) {
    return buildWizardPrompter({
      confirm: overrides?.confirm ?? vi.fn(async () => true),
      text: overrides?.text ?? vi.fn(async () => "sk-test-key"),
    }) as WizardPrompter;
  }

  it("auto-enables in quickstart when OPENAI_API_KEY is set", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      const result = await configureMemoryForOnboarding({
        flow: "quickstart",
        nextConfig: {},
        prompter: createPrompter(),
      });

      expect(result.plugins?.slots?.memory).toBe("memory-lancedb");
      expect(result.plugins?.entries?.["memory-lancedb"]?.enabled).toBe(true);
      const cfg = result.plugins?.entries?.["memory-lancedb"]?.config as Record<string, unknown>;
      expect((cfg.embedding as Record<string, unknown>).apiKey).toBe("${OPENAI_API_KEY}");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  it("skips in quickstart when OPENAI_API_KEY is not set", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await configureMemoryForOnboarding({
        flow: "quickstart",
        nextConfig: {},
        prompter: createPrompter(),
      });

      expect(result.plugins?.slots?.memory).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it("preserves existing memory-lancedb config in quickstart", async () => {
    const result = await configureMemoryForOnboarding({
      flow: "quickstart",
      nextConfig: {
        plugins: {
          slots: { memory: "memory-lancedb" },
          entries: {
            "memory-lancedb": {
              enabled: true,
              config: { embedding: { apiKey: "existing-key" } },
            },
          },
        },
      },
      prompter: createPrompter(),
    });

    expect(result.plugins?.slots?.memory).toBe("memory-lancedb");
    const cfg = result.plugins?.entries?.["memory-lancedb"]?.config as Record<string, unknown>;
    expect((cfg.embedding as Record<string, unknown>).apiKey).toBe("existing-key");
  });

  it("prompts for API key in advanced mode", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const text = vi.fn(async () => "sk-my-key");
      const confirm = vi.fn(async () => true);
      const result = await configureMemoryForOnboarding({
        flow: "advanced",
        nextConfig: {},
        prompter: createPrompter({ confirm, text }),
      });

      expect(result.plugins?.slots?.memory).toBe("memory-lancedb");
      const cfg = result.plugins?.entries?.["memory-lancedb"]?.config as Record<string, unknown>;
      expect((cfg.embedding as Record<string, unknown>).apiKey).toBe("sk-my-key");
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it("disables memory-lancedb when user declines in advanced mode", async () => {
    const confirm = vi.fn(async () => false);
    const result = await configureMemoryForOnboarding({
      flow: "advanced",
      nextConfig: {
        plugins: {
          slots: { memory: "memory-lancedb" },
        },
      },
      prompter: createPrompter({ confirm }),
    });

    expect(result.plugins?.slots?.memory).toBe("memory-core");
  });

  it("uses OPENAI_API_KEY env var when user confirms in advanced mode", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-from-env";
    try {
      const confirm = vi.fn(async () => true);
      const result = await configureMemoryForOnboarding({
        flow: "advanced",
        nextConfig: {},
        prompter: createPrompter({ confirm }),
      });

      expect(result.plugins?.slots?.memory).toBe("memory-lancedb");
      const cfg = result.plugins?.entries?.["memory-lancedb"]?.config as Record<string, unknown>;
      expect((cfg.embedding as Record<string, unknown>).apiKey).toBe("${OPENAI_API_KEY}");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  it("sets autoCapture and autoRecall to true", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      const result = await configureMemoryForOnboarding({
        flow: "quickstart",
        nextConfig: {},
        prompter: createPrompter(),
      });

      const cfg = result.plugins?.entries?.["memory-lancedb"]?.config as Record<string, unknown>;
      expect(cfg.autoCapture).toBe(true);
      expect(cfg.autoRecall).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
});
