import type { OpenClawConfig } from "../config/config.js";
import type { WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureWhatsAppUserOptions = {
  flow: WizardFlow;
  nextConfig: OpenClawConfig;
  prompter: WizardPrompter;
};

export async function configureWhatsAppUserForOnboarding(
  opts: ConfigureWhatsAppUserOptions,
): Promise<OpenClawConfig> {
  const { flow, prompter } = opts;
  let { nextConfig } = opts;

  const existingEntry = nextConfig.plugins?.entries?.["whatsapp-user"];
  const alreadyEnabled = existingEntry?.enabled === true;

  if (flow === "quickstart") {
    return nextConfig;
  }

  const enable = await prompter.confirm({
    message: alreadyEnabled
      ? "WhatsApp user access is enabled (read/write your chats). Keep it?"
      : "Enable WhatsApp user access? (agent can read/write your WhatsApp chats)",
    initialValue: alreadyEnabled,
  });

  if (!enable) {
    if (alreadyEnabled) {
      nextConfig = {
        ...nextConfig,
        plugins: {
          ...nextConfig.plugins,
          entries: {
            ...nextConfig.plugins?.entries,
            "whatsapp-user": {
              ...existingEntry,
              enabled: false,
            },
          },
        },
      };
    }
    return nextConfig;
  }

  const existingConfig = (existingEntry?.config ?? {}) as Record<string, unknown>;

  nextConfig = {
    ...nextConfig,
    plugins: {
      ...nextConfig.plugins,
      entries: {
        ...nextConfig.plugins?.entries,
        "whatsapp-user": {
          enabled: true,
          config: {
            ...existingConfig,
            authDir: (existingConfig.authDir as string) ?? "~/.openclaw/whatsapp-user",
            messageRetentionDays: (existingConfig.messageRetentionDays as number) ?? 7,
          },
        },
      },
    },
  };

  await prompter.note(
    [
      "The agent will pair with your WhatsApp on first run.",
      "Use the wa_pair tool or scan the QR code from the gateway logs.",
      "This is separate from the WhatsApp channel (bot chat).",
    ].join("\n"),
    "WhatsApp User Access",
  );

  return nextConfig;
}
