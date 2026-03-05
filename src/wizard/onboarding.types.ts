import type { GatewayAuthChoice } from "../commands/onboard-types.js";
import type { SecretInput } from "../config/types.secrets.js";

export type WizardFlow = "quickstart" | "advanced";

export type TunnelType = "none" | "tailscale" | "ngrok";

export type QuickstartGatewayDefaults = {
  hasExisting: boolean;
  port: number;
  bind: "loopback" | "lan" | "auto" | "custom" | "tailnet";
  authMode: GatewayAuthChoice;
  tunnelType: TunnelType;
  tailscaleMode: "off" | "serve" | "funnel";
  token?: string;
  password?: SecretInput;
  customBindHost?: string;
  tailscaleResetOnExit: boolean;
  ngrokDomain?: string;
};

export type GatewayWizardSettings = {
  port: number;
  bind: "loopback" | "lan" | "auto" | "custom" | "tailnet";
  customBindHost?: string;
  authMode: GatewayAuthChoice;
  gatewayToken?: string;
  tunnelType: TunnelType;
  tailscaleMode: "off" | "serve" | "funnel";
  tailscaleResetOnExit: boolean;
  ngrokDomain?: string;
};
