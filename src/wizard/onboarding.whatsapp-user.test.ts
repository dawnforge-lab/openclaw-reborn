import { describe, expect, it, vi } from "vitest";
import { createWizardPrompter as buildWizardPrompter } from "../../test/helpers/wizard-prompter.js";
import type { WizardPrompter } from "./prompts.js";
import { configureWhatsAppUserForOnboarding } from "./onboarding.whatsapp-user.js";

describe("configureWhatsAppUserForOnboarding", () => {
  function createPrompter(overrides?: { confirm?: ReturnType<typeof vi.fn> }) {
    return buildWizardPrompter({
      confirm: overrides?.confirm ?? vi.fn(async () => true),
      note: vi.fn(async () => {}),
    }) as WizardPrompter;
  }

  it("skips in quickstart flow", async () => {
    const result = await configureWhatsAppUserForOnboarding({
      flow: "quickstart",
      nextConfig: {},
      prompter: createPrompter(),
    });

    expect(result.plugins?.entries?.["whatsapp-user"]).toBeUndefined();
  });

  it("enables when user confirms in advanced mode", async () => {
    const result = await configureWhatsAppUserForOnboarding({
      flow: "advanced",
      nextConfig: {},
      prompter: createPrompter({ confirm: vi.fn(async () => true) }),
    });

    expect(result.plugins?.entries?.["whatsapp-user"]?.enabled).toBe(true);
    const cfg = result.plugins?.entries?.["whatsapp-user"]?.config as Record<string, unknown>;
    expect(cfg.authDir).toBe("~/.openclaw/whatsapp-user");
    expect(cfg.messageRetentionDays).toBe(7);
  });

  it("does nothing when user declines and not previously enabled", async () => {
    const result = await configureWhatsAppUserForOnboarding({
      flow: "advanced",
      nextConfig: {},
      prompter: createPrompter({ confirm: vi.fn(async () => false) }),
    });

    expect(result.plugins?.entries?.["whatsapp-user"]).toBeUndefined();
  });

  it("disables when user declines and was previously enabled", async () => {
    const result = await configureWhatsAppUserForOnboarding({
      flow: "advanced",
      nextConfig: {
        plugins: {
          entries: {
            "whatsapp-user": { enabled: true, config: { authDir: "~/.openclaw/whatsapp-user" } },
          },
        },
      },
      prompter: createPrompter({ confirm: vi.fn(async () => false) }),
    });

    expect(result.plugins?.entries?.["whatsapp-user"]?.enabled).toBe(false);
  });

  it("preserves existing config when re-enabling", async () => {
    const result = await configureWhatsAppUserForOnboarding({
      flow: "advanced",
      nextConfig: {
        plugins: {
          entries: {
            "whatsapp-user": {
              enabled: true,
              config: { authDir: "/custom/path", messageRetentionDays: 14 },
            },
          },
        },
      },
      prompter: createPrompter({ confirm: vi.fn(async () => true) }),
    });

    const cfg = result.plugins?.entries?.["whatsapp-user"]?.config as Record<string, unknown>;
    expect(cfg.authDir).toBe("/custom/path");
    expect(cfg.messageRetentionDays).toBe(14);
  });
});
