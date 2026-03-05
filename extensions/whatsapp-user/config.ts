export type WhatsAppUserConfig = {
  authDir: string;
  messageRetentionDays: number;
};

const DEFAULT_AUTH_DIR = "~/.openclaw/whatsapp-user";
const DEFAULT_RETENTION_DAYS = 7;

export const whatsappUserConfigSchema = {
  parse(value: unknown): WhatsAppUserConfig {
    const cfg = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return {
      authDir: typeof cfg.authDir === "string" ? cfg.authDir : DEFAULT_AUTH_DIR,
      messageRetentionDays:
        typeof cfg.messageRetentionDays === "number" ? cfg.messageRetentionDays : DEFAULT_RETENTION_DAYS,
    };
  },
};
