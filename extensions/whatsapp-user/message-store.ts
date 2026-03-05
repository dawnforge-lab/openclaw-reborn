import type { WAMessage } from "@whiskeysockets/baileys";

export type StoredMessage = {
  id: string;
  chatJid: string;
  senderJid: string;
  fromMe: boolean;
  timestamp: number;
  text: string;
  mediaType?: string;
};

const messages: StoredMessage[] = [];
const MAX_MESSAGES = 10_000;

function extractText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    ""
  );
}

function extractMediaType(msg: WAMessage): string | undefined {
  const m = msg.message;
  if (!m) return undefined;
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage) return "audio";
  if (m.documentMessage) return "document";
  if (m.stickerMessage) return "sticker";
  if (m.contactMessage) return "contact";
  if (m.locationMessage) return "location";
  return undefined;
}

export function storeMessage(msg: WAMessage, chatJid: string): void {
  const text = extractText(msg);
  const mediaType = extractMediaType(msg);
  if (!text && !mediaType) return;

  const ts = msg.messageTimestamp;
  const timestamp = typeof ts === "number" ? ts * 1000 : Number(ts) * 1000;

  messages.push({
    id: msg.key.id ?? "",
    chatJid,
    senderJid: msg.key.participant ?? msg.key.remoteJid ?? chatJid,
    fromMe: msg.key.fromMe ?? false,
    timestamp,
    text,
    mediaType,
  });

  // Cap memory usage
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
  }
}

export function getMessages(chatJid: string, limit = 20): StoredMessage[] {
  return messages
    .filter((m) => m.chatJid === chatJid)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function getRecentChats(limit = 20): Array<{ chatJid: string; lastMessage: StoredMessage; count: number }> {
  const chatMap = new Map<string, { lastMessage: StoredMessage; count: number }>();

  for (const msg of messages) {
    const existing = chatMap.get(msg.chatJid);
    if (!existing || msg.timestamp > existing.lastMessage.timestamp) {
      chatMap.set(msg.chatJid, {
        lastMessage: msg,
        count: (existing?.count ?? 0) + 1,
      });
    } else {
      existing.count++;
    }
  }

  return Array.from(chatMap.entries())
    .map(([chatJid, data]) => ({ chatJid, ...data }))
    .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp)
    .slice(0, limit);
}

export function pruneOlderThan(days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const before = messages.length;
  const kept = messages.filter((m) => m.timestamp >= cutoff);
  messages.length = 0;
  messages.push(...kept);
  return before - messages.length;
}

export function getMessageCount(): number {
  return messages.length;
}
