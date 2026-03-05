import {
  promptSecretRefForOnboarding,
  resolveSecretInputModeForEnvSelection,
} from "../commands/auth-choice.apply-helpers.js";
import {
  normalizeGatewayTokenInput,
  randomToken,
  validateGatewayPasswordInput,
} from "../commands/onboard-helpers.js";
import type { GatewayAuthChoice, SecretInputMode } from "../commands/onboard-types.js";
import type { GatewayBindMode, GatewayTailscaleMode, OpenClawConfig } from "../config/config.js";
import { ensureControlUiAllowedOriginsForNonLoopbackBind } from "../config/gateway-control-ui-origins.js";
import type { SecretInput } from "../config/types.secrets.js";
import {
  maybeAddTailnetOriginToControlUiAllowedOrigins,
  TAILSCALE_DOCS_LINES,
  TAILSCALE_EXPOSURE_OPTIONS,
  TAILSCALE_MISSING_BIN_NOTE_LINES,
} from "../gateway/gateway-config-prompts.shared.js";
import { DEFAULT_DANGEROUS_NODE_COMMANDS } from "../gateway/node-command-policy.js";
import { findTailscaleBinary } from "../infra/tailscale.js";
import type { RuntimeEnv } from "../runtime.js";
import { validateIPv4AddressInput } from "../shared/net/ipv4.js";
import type {
  GatewayWizardSettings,
  QuickstartGatewayDefaults,
  TunnelType,
  WizardFlow,
} from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureGatewayOptions = {
  flow: WizardFlow;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  localPort: number;
  quickstartGateway: QuickstartGatewayDefaults;
  secretInputMode?: SecretInputMode;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

type ConfigureGatewayResult = {
  nextConfig: OpenClawConfig;
  settings: GatewayWizardSettings;
};

export async function configureGatewayForOnboarding(
  opts: ConfigureGatewayOptions,
): Promise<ConfigureGatewayResult> {
  const { flow, localPort, quickstartGateway, prompter } = opts;
  let { nextConfig } = opts;

  const port =
    flow === "quickstart"
      ? quickstartGateway.port
      : Number.parseInt(
          String(
            await prompter.text({
              message: "Gateway port",
              initialValue: String(localPort),
              validate: (value) => (Number.isFinite(Number(value)) ? undefined : "Invalid port"),
            }),
          ),
          10,
        );

  let bind: GatewayWizardSettings["bind"] =
    flow === "quickstart"
      ? quickstartGateway.bind
      : await prompter.select<GatewayWizardSettings["bind"]>({
          message: "Gateway bind",
          options: [
            {
              value: "loopback",
              label: "Loopback (127.0.0.1)",
              hint: "Local only — use with ngrok or Tailscale for remote access",
            },
            { value: "lan", label: "LAN (0.0.0.0)", hint: "Accessible from local network" },
            {
              value: "tailnet",
              label: "Tailnet (Tailscale IP)",
              hint: "Bind directly to Tailscale interface",
            },
            {
              value: "auto",
              label: "Auto (Loopback → LAN)",
              hint: "Tries loopback, falls back to LAN",
            },
            { value: "custom", label: "Custom IP", hint: "Bind to a specific network interface" },
          ],
        });

  let customBindHost = quickstartGateway.customBindHost;
  if (bind === "custom") {
    const needsPrompt = flow !== "quickstart" || !customBindHost;
    if (needsPrompt) {
      const input = await prompter.text({
        message: "Custom IP address",
        placeholder: "192.168.1.100",
        initialValue: customBindHost ?? "",
        validate: validateIPv4AddressInput,
      });
      customBindHost = typeof input === "string" ? input.trim() : undefined;
    }
  }

  let authMode =
    flow === "quickstart"
      ? quickstartGateway.authMode
      : ((await prompter.select({
          message: "Gateway auth",
          options: [
            {
              value: "token",
              label: "Token",
              hint: "Recommended default (local + remote)",
            },
            { value: "password", label: "Password" },
          ],
          initialValue: "token",
        })) as GatewayAuthChoice);

  // Tunnel type selection: none, tailscale, or ngrok
  const tunnelType: TunnelType =
    flow === "quickstart"
      ? (quickstartGateway.tunnelType ?? "none")
      : await prompter.select<TunnelType>({
          message: "Tunnel / public access",
          options: [
            { value: "none", label: "None", hint: "Local access only" },
            {
              value: "ngrok",
              label: "ngrok",
              hint: "Public HTTPS tunnel (recommended for mobile app)",
            },
            { value: "tailscale", label: "Tailscale", hint: "Private tailnet or public funnel" },
          ],
        });

  // Tailscale config (only when tunnel=tailscale)
  let tailscaleMode: GatewayWizardSettings["tailscaleMode"] = "off";
  let tailscaleBin: string | null = null;
  let tailscaleResetOnExit = flow === "quickstart" ? quickstartGateway.tailscaleResetOnExit : false;

  if (tunnelType === "tailscale") {
    tailscaleMode =
      flow === "quickstart"
        ? quickstartGateway.tailscaleMode
        : await prompter.select<GatewayWizardSettings["tailscaleMode"]>({
            message: "Tailscale exposure",
            options: [...TAILSCALE_EXPOSURE_OPTIONS],
          });

    if (tailscaleMode !== "off") {
      tailscaleBin = await findTailscaleBinary();
      if (!tailscaleBin) {
        await prompter.note(TAILSCALE_MISSING_BIN_NOTE_LINES.join("\n"), "Tailscale Warning");
      }
    }

    if (tailscaleMode !== "off" && flow !== "quickstart") {
      await prompter.note(TAILSCALE_DOCS_LINES.join("\n"), "Tailscale");
      tailscaleResetOnExit = Boolean(
        await prompter.confirm({
          message: "Reset Tailscale serve/funnel on exit?",
          initialValue: false,
        }),
      );
    }

    if (tailscaleMode !== "off" && bind !== "loopback") {
      await prompter.note("Tailscale requires bind=loopback. Adjusting bind to loopback.", "Note");
      bind = "loopback";
      customBindHost = undefined;
    }

    if (tailscaleMode === "funnel" && authMode !== "password") {
      await prompter.note("Tailscale funnel requires password auth.", "Note");
      authMode = "password";
    }
  }

  // ngrok config (only when tunnel=ngrok)
  let ngrokDomain: string | undefined;
  if (tunnelType === "ngrok") {
    if (!process.env.NGROK_AUTHTOKEN) {
      await prompter.note(
        "Set NGROK_AUTHTOKEN in your environment before starting the gateway.\nGet your token at: https://dashboard.ngrok.com/get-started/your-authtoken",
        "ngrok",
      );
    }

    if (flow !== "quickstart") {
      const domainInput = await prompter.text({
        message: "ngrok static domain (optional, blank for random)",
        placeholder: "mybot.ngrok-free.app",
        initialValue: quickstartGateway.ngrokDomain ?? "",
      });
      ngrokDomain = typeof domainInput === "string" ? domainInput.trim() || undefined : undefined;
    } else {
      ngrokDomain = quickstartGateway.ngrokDomain;
    }

    // ngrok tunnels loopback
    if (bind !== "loopback") {
      await prompter.note("ngrok requires bind=loopback. Adjusting bind to loopback.", "Note");
      bind = "loopback";
      customBindHost = undefined;
    }
  }

  let gatewayToken: string | undefined;
  if (authMode === "token") {
    if (flow === "quickstart") {
      gatewayToken =
        (quickstartGateway.token ??
          normalizeGatewayTokenInput(process.env.OPENCLAW_GATEWAY_TOKEN)) ||
        randomToken();
    } else {
      const tokenInput = await prompter.text({
        message: "Gateway token (blank to generate)",
        placeholder: "Needed for multi-machine or non-loopback access",
        initialValue:
          quickstartGateway.token ??
          normalizeGatewayTokenInput(process.env.OPENCLAW_GATEWAY_TOKEN) ??
          "",
      });
      gatewayToken = normalizeGatewayTokenInput(tokenInput) || randomToken();
    }
  }

  if (authMode === "password") {
    let password: SecretInput | undefined =
      flow === "quickstart" && quickstartGateway.password ? quickstartGateway.password : undefined;
    if (!password) {
      const selectedMode = await resolveSecretInputModeForEnvSelection({
        prompter,
        explicitMode: opts.secretInputMode,
        copy: {
          modeMessage: "How do you want to provide the gateway password?",
          plaintextLabel: "Enter password now",
          plaintextHint: "Stores the password directly in OpenClaw config",
        },
      });
      if (selectedMode === "ref") {
        const resolved = await promptSecretRefForOnboarding({
          provider: "gateway-auth-password",
          config: nextConfig,
          prompter,
          preferredEnvVar: "OPENCLAW_GATEWAY_PASSWORD",
          copy: {
            sourceMessage: "Where is this gateway password stored?",
            envVarPlaceholder: "OPENCLAW_GATEWAY_PASSWORD",
          },
        });
        password = resolved.ref;
      } else {
        password = String(
          (await prompter.text({
            message: "Gateway password",
            validate: validateGatewayPasswordInput,
          })) ?? "",
        ).trim();
      }
    }
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password,
        },
      },
    };
  } else if (authMode === "token") {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "token",
          token: gatewayToken,
        },
      },
    };
  }

  nextConfig = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      port,
      bind: bind as GatewayBindMode,
      ...(bind === "custom" && customBindHost ? { customBindHost } : {}),
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode as GatewayTailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
      ngrok: {
        enabled: tunnelType === "ngrok",
        ...(ngrokDomain ? { domain: ngrokDomain } : {}),
      },
    },
  };

  nextConfig = ensureControlUiAllowedOriginsForNonLoopbackBind(nextConfig, {
    requireControlUiEnabled: true,
  }).config;
  nextConfig = await maybeAddTailnetOriginToControlUiAllowedOrigins({
    config: nextConfig,
    tailscaleMode,
    tailscaleBin,
  });

  // If this is a new gateway setup (no existing gateway settings), start with a
  // denylist for high-risk node commands. Users can arm these temporarily via
  // /phone arm ... (phone-control plugin).
  if (
    !quickstartGateway.hasExisting &&
    nextConfig.gateway?.nodes?.denyCommands === undefined &&
    nextConfig.gateway?.nodes?.allowCommands === undefined &&
    nextConfig.gateway?.nodes?.browser === undefined
  ) {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        nodes: {
          ...nextConfig.gateway?.nodes,
          denyCommands: [...DEFAULT_DANGEROUS_NODE_COMMANDS],
        },
      },
    };
  }

  return {
    nextConfig,
    settings: {
      port,
      bind: bind as GatewayBindMode,
      customBindHost: bind === "custom" ? customBindHost : undefined,
      authMode,
      gatewayToken,
      tunnelType,
      tailscaleMode: tailscaleMode as GatewayTailscaleMode,
      tailscaleResetOnExit,
      ngrokDomain,
    },
  };
}
