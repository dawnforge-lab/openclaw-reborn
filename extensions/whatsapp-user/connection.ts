import {
  type WASocket,
  type WAMessage,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";

export type ConnectionEvents = {
  onMessage: (msg: WAMessage, chatJid: string) => void;
  onQr: (qr: string) => void;
  onReady: () => void;
  onClose: () => void;
  log: (msg: string) => void;
};

let sock: WASocket | null = null;
let connecting = false;

export function getSocket(): WASocket | null {
  return sock;
}

export function isConnected(): boolean {
  return sock !== null;
}

export async function connect(authDir: string, events: ConnectionEvents): Promise<void> {
  if (sock || connecting) return;
  connecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        events.onQr(qr);
      }

      if (connection === "close") {
        sock = null;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          events.log("whatsapp-user: logged out — re-pair required");
          events.onClose();
        } else {
          events.log(`whatsapp-user: disconnected (${statusCode}), reconnecting...`);
          setTimeout(() => connect(authDir, events), 3000);
        }
      }

      if (connection === "open") {
        events.log("whatsapp-user: connected");
        events.onReady();
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;
      for (const msg of messages) {
        const chatJid = msg.key?.remoteJid;
        if (!chatJid) continue;
        events.onMessage(msg, chatJid);
      }
    });
  } finally {
    connecting = false;
  }
}

export async function disconnect(): Promise<void> {
  if (sock) {
    sock.ev.removeAllListeners("messages.upsert");
    sock.ev.removeAllListeners("connection.update");
    sock.ws?.close();
    sock = null;
  }
}
