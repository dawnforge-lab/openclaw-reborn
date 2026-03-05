import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureWhatsAppUserOptions = {
  flow: WizardFlow;
  nextConfig: OpenClawConfig;
  prompter: WizardPrompter;
};

function resolveAuthDir(configAuthDir?: string): string {
  const raw = configAuthDir ?? "~/.openclaw/whatsapp-user";
  if (raw.startsWith("~")) {
    return path.join(os.homedir(), raw.slice(1));
  }
  return raw;
}

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

  const existingConfig = existingEntry?.config ?? {};
  const authDir = (existingConfig.authDir as string) ?? "~/.openclaw/whatsapp-user";

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
            authDir,
            messageRetentionDays: (existingConfig.messageRetentionDays as number) ?? 7,
          },
        },
      },
    },
  };

  // Check if already paired (auth files exist)
  const resolvedAuthDir = resolveAuthDir(authDir);
  const fs = await import("node:fs");
  const hasCreds = fs.existsSync(path.join(resolvedAuthDir, "creds.json"));

  if (hasCreds) {
    await prompter.note(
      "WhatsApp is already paired. Existing session will be reused.",
      "WhatsApp User Access",
    );
    return nextConfig;
  }

  // Offer to pair now
  const pairNow = await prompter.confirm({
    message: "Pair WhatsApp now? (you'll need your phone ready to scan a QR code)",
    initialValue: true,
  });

  if (!pairNow) {
    await prompter.note(
      [
        "You can pair later by starting the gateway and using the wa_pair tool,",
        "or check the gateway logs for the QR code.",
      ].join("\n"),
      "WhatsApp User Access",
    );
    return nextConfig;
  }

  // Do the pairing
  await prompter.note(
    [
      "Starting WhatsApp pairing...",
      "Open WhatsApp on your phone > Settings > Linked Devices > Link a Device",
      "Then scan the QR code that appears below.",
    ].join("\n"),
    "WhatsApp Pairing",
  );

  try {
    await runWhatsAppPairing(resolvedAuthDir);
    await prompter.note("WhatsApp paired successfully!", "WhatsApp User Access");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prompter.note(
      `Pairing failed: ${msg}\nYou can retry later via the wa_pair tool.`,
      "WhatsApp Pairing Error",
    );
  }

  return nextConfig;
}

async function runWhatsAppPairing(authDir: string): Promise<void> {
  const fs = await import("node:fs");
  fs.mkdirSync(authDir, { recursive: true });

  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
    await import("@whiskeysockets/baileys");
  const qrcode = await import("qrcode-terminal");

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  return new Promise<void>((resolve, reject) => {
    const timeoutMs = 120_000; // 2 minutes to scan
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("QR code scan timed out after 2 minutes"));
    }, timeoutMs);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    function cleanup() {
      clearTimeout(timer);
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ws?.close();
      } catch {
        // ignore cleanup errors
      }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(""); // blank line before QR
        qrcode.generate(qr, { small: true });
        console.log("\nScan this QR code with WhatsApp on your phone.");
        console.log("WhatsApp > Settings > Linked Devices > Link a Device\n");
      }

      if (connection === "open") {
        cleanup();
        resolve();
      }

      if (connection === "close") {
        const err = lastDisconnect?.error as Record<string, unknown> | undefined;
        const statusCode = (err?.output as Record<string, unknown>)?.statusCode;
        if (statusCode === Number(DisconnectReason.loggedOut)) {
          cleanup();
          reject(new Error("WhatsApp logged out during pairing"));
        }
        // Other close reasons: QR expired, will get a new one automatically
      }
    });
  });
}
