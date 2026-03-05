import type { OpenClawConfig } from "../config/config.js";
import type { WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureMemoryOptions = {
  flow: WizardFlow;
  nextConfig: OpenClawConfig;
  prompter: WizardPrompter;
};

export async function configureMemoryForOnboarding(
  opts: ConfigureMemoryOptions,
): Promise<OpenClawConfig> {
  const { flow, prompter } = opts;
  let { nextConfig } = opts;

  const currentSlot =
    typeof nextConfig.plugins?.slots?.memory === "string"
      ? nextConfig.plugins.slots.memory.trim()
      : "";
  const alreadyEnabled = currentSlot === "memory-lancedb";

  if (flow === "quickstart") {
    if (alreadyEnabled) {
      return nextConfig;
    }
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
    if (hasOpenAiKey) {
      nextConfig = applyMemoryLancedbConfig(nextConfig, "${OPENAI_API_KEY}");
    }
    return nextConfig;
  }

  const enableMemory = await prompter.confirm({
    message: alreadyEnabled
      ? "Long-term memory (memory-lancedb) is enabled. Keep it?"
      : "Enable long-term memory? (vector search via memory-lancedb)",
    initialValue: true,
  });

  if (!enableMemory) {
    if (alreadyEnabled) {
      nextConfig = {
        ...nextConfig,
        plugins: {
          ...nextConfig.plugins,
          slots: {
            ...nextConfig.plugins?.slots,
            memory: "memory-core",
          },
        },
      };
    }
    return nextConfig;
  }

  const existingApiKey =
    (nextConfig.plugins?.entries?.["memory-lancedb"]?.config as { embedding?: { apiKey?: string } })
      ?.embedding?.apiKey ?? "";

  let apiKey = existingApiKey;
  if (!apiKey) {
    const hasEnvKey = Boolean(process.env.OPENAI_API_KEY);
    if (hasEnvKey) {
      const useEnv = await prompter.confirm({
        message: "Use OPENAI_API_KEY from environment for embeddings?",
        initialValue: true,
      });
      if (useEnv) {
        apiKey = "${OPENAI_API_KEY}";
      }
    }

    if (!apiKey) {
      const input = await prompter.text({
        message: "OpenAI API key for embeddings",
        placeholder: "sk-proj-...",
        validate: (value) => (value?.trim() ? undefined : "Required for vector memory"),
      });
      apiKey = String(input).trim();
    }
  }

  nextConfig = applyMemoryLancedbConfig(nextConfig, apiKey);
  return nextConfig;
}

function applyMemoryLancedbConfig(config: OpenClawConfig, apiKey: string): OpenClawConfig {
  const existingEntry = config.plugins?.entries?.["memory-lancedb"];
  const existingConfig = (existingEntry?.config ?? {}) as Record<string, unknown>;

  return {
    ...config,
    plugins: {
      ...config.plugins,
      slots: {
        ...config.plugins?.slots,
        memory: "memory-lancedb",
      },
      entries: {
        ...config.plugins?.entries,
        "memory-lancedb": {
          ...existingEntry,
          enabled: true,
          config: {
            ...existingConfig,
            embedding: {
              ...(existingConfig.embedding as Record<string, unknown> | undefined),
              apiKey,
              model: "text-embedding-3-small",
            },
            autoCapture: true,
            autoRecall: true,
          },
        },
      },
    },
  };
}
