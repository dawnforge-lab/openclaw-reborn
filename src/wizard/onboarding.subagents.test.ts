import { describe, expect, it, vi } from "vitest";
import { createWizardPrompter as buildWizardPrompter } from "../../test/helpers/wizard-prompter.js";
import { configureSubagentsForOnboarding } from "./onboarding.subagents.js";
import type { WizardPrompter } from "./prompts.js";

describe("configureSubagentsForOnboarding", () => {
  function createPrompter(overrides?: {
    confirm?: WizardPrompter["confirm"];
    text?: WizardPrompter["text"];
  }) {
    return buildWizardPrompter({
      confirm:
        overrides?.confirm ?? (vi.fn(async () => true) as unknown as WizardPrompter["confirm"]),
      text: overrides?.text ?? (vi.fn(async () => "2") as unknown as WizardPrompter["text"]),
    });
  }

  it("enables with defaults in quickstart flow", async () => {
    const result = await configureSubagentsForOnboarding({
      flow: "quickstart",
      nextConfig: {},
      prompter: createPrompter(),
    });

    expect(result.agents?.defaults?.subagents?.maxConcurrent).toBe(2);
    expect(result.agents?.defaults?.subagents?.maxSpawnDepth).toBe(2);
    expect(result.agents?.defaults?.subagents?.maxChildrenPerAgent).toBe(5);
  });

  it("preserves existing config in quickstart", async () => {
    const result = await configureSubagentsForOnboarding({
      flow: "quickstart",
      nextConfig: {
        agents: { defaults: { subagents: { maxConcurrent: 4 } } },
      },
      prompter: createPrompter(),
    });

    expect(result.agents?.defaults?.subagents?.maxConcurrent).toBe(4);
  });

  it("prompts for settings in advanced mode", async () => {
    const textFn = vi
      .fn()
      .mockResolvedValueOnce("3") // concurrency
      .mockResolvedValueOnce("anthropic/claude-sonnet-4-20250514"); // model
    const result = await configureSubagentsForOnboarding({
      flow: "advanced",
      nextConfig: {},
      prompter: createPrompter({
        text: textFn as unknown as WizardPrompter["text"],
      }),
    });

    expect(result.agents?.defaults?.subagents?.maxConcurrent).toBe(3);
    expect(result.agents?.defaults?.subagents?.model).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("skips when user declines in advanced mode", async () => {
    const result = await configureSubagentsForOnboarding({
      flow: "advanced",
      nextConfig: {},
      prompter: createPrompter({
        confirm: vi.fn(async () => false) as unknown as WizardPrompter["confirm"],
      }),
    });

    expect(result.agents?.defaults?.subagents).toBeUndefined();
  });

  it("allows blank model to inherit main agent model", async () => {
    const textFn = vi
      .fn()
      .mockResolvedValueOnce("2") // concurrency
      .mockResolvedValueOnce(""); // blank model
    const result = await configureSubagentsForOnboarding({
      flow: "advanced",
      nextConfig: {},
      prompter: createPrompter({
        text: textFn as unknown as WizardPrompter["text"],
      }),
    });

    expect(result.agents?.defaults?.subagents?.maxConcurrent).toBe(2);
    expect(result.agents?.defaults?.subagents?.model).toBeUndefined();
  });
});
