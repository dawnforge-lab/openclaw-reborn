import type { OpenClawConfig } from "../config/config.js";
import type { WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureSubagentsOptions = {
  flow: WizardFlow;
  nextConfig: OpenClawConfig;
  prompter: WizardPrompter;
};

export async function configureSubagentsForOnboarding(
  opts: ConfigureSubagentsOptions,
): Promise<OpenClawConfig> {
  const { flow, prompter } = opts;
  let { nextConfig } = opts;

  const existingDefaults = nextConfig.agents?.defaults?.subagents;
  const alreadyConfigured = existingDefaults !== undefined;

  if (flow === "quickstart") {
    // Quickstart: enable subagents with sensible defaults if not already configured
    if (!alreadyConfigured) {
      nextConfig = applySubagentDefaults(nextConfig, {});
    }
    return nextConfig;
  }

  const enable = await prompter.confirm({
    message: alreadyConfigured
      ? "Sub-agents are configured. Keep them enabled?"
      : "Enable sub-agents? (agent can spawn child agents for parallel tasks)",
    initialValue: true,
  });

  if (!enable) {
    return nextConfig;
  }

  const concurrencyInput = await prompter.text({
    message: "Max concurrent sub-agents",
    initialValue: String(existingDefaults?.maxConcurrent ?? 2),
    validate: (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 10
        ? undefined
        : "Enter a number between 1 and 10";
    },
  });
  const maxConcurrent = Number(concurrencyInput) || 2;

  const modelInput = await prompter.text({
    message: "Sub-agent model (blank = same as main agent)",
    placeholder: "e.g. anthropic/claude-sonnet-4-20250514",
    initialValue: (typeof existingDefaults?.model === "string" ? existingDefaults.model : "") ?? "",
  });
  const subagentModel = typeof modelInput === "string" ? modelInput.trim() || undefined : undefined;

  nextConfig = applySubagentDefaults(nextConfig, {
    maxConcurrent,
    model: subagentModel,
  });

  return nextConfig;
}

function applySubagentDefaults(
  config: OpenClawConfig,
  overrides: { maxConcurrent?: number; model?: string },
): OpenClawConfig {
  const existing = config.agents?.defaults?.subagents ?? {};
  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        subagents: {
          ...existing,
          maxConcurrent: overrides.maxConcurrent ?? existing.maxConcurrent ?? 2,
          maxSpawnDepth: existing.maxSpawnDepth ?? 2,
          maxChildrenPerAgent: existing.maxChildrenPerAgent ?? 5,
          ...(overrides.model ? { model: overrides.model } : {}),
        },
      },
    },
  };
}
