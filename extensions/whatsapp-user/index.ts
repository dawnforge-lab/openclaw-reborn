/**
 * WhatsApp User Plugin
 *
 * Gives the agent read/write access to the user's WhatsApp account.
 * Separate Baileys connection from the WhatsApp channel plugin.
 * The agent can list chats, read messages, send messages, and look up contacts.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/whatsapp-user";
import { whatsappUserConfigSchema } from "./config.js";
import { connect, disconnect, getSocket, isConnected } from "./connection.js";
import { getMessageCount, getMessages, getRecentChats, pruneOlderThan, storeMessage } from "./message-store.js";

let lastQr: string | null = null;

function formatJid(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, " (group)");
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function textResult(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? {},
  };
}

const plugin = {
  id: "whatsapp-user",
  name: "WhatsApp User Access",
  description: "Read and write WhatsApp messages as the user",
  configSchema: whatsappUserConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = whatsappUserConfigSchema.parse(api.pluginConfig);
    const authDir = api.resolvePath(cfg.authDir);

    // ------------------------------------------------------------------
    // Connection management
    // ------------------------------------------------------------------

    async function ensureConnected(): Promise<void> {
      if (isConnected()) return;
      await connect(authDir, {
        onMessage: (msg, chatJid) => storeMessage(msg, chatJid),
        onQr: (qr) => {
          lastQr = qr;
          api.logger.info("whatsapp-user: QR code ready — use wa_pair tool to retrieve it");
        },
        onReady: () => {
          lastQr = null;
          api.logger.info("whatsapp-user: connected and ready");
        },
        onClose: () => {
          api.logger.info("whatsapp-user: connection closed");
        },
        log: (msg) => api.logger.info(msg),
      });
    }

    // ------------------------------------------------------------------
    // Tools
    // ------------------------------------------------------------------

    api.registerTool(
      {
        name: "wa_pair",
        label: "WhatsApp Pair",
        description:
          "Get the QR code to pair your WhatsApp account. User scans this with WhatsApp > Linked Devices. Only needed once.",
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: unknown) {
          await ensureConnected();

          if (!lastQr) {
            if (isConnected()) {
              return textResult("Already paired and connected.");
            }
            return textResult("Connecting... try again in a few seconds.");
          }

          return textResult(
            `Scan this QR code with WhatsApp > Linked Devices:\n\n${lastQr}\n\nWaiting for scan...`,
          );
        },
      },
      { name: "wa_pair" },
    );

    api.registerTool(
      {
        name: "wa_status",
        label: "WhatsApp Status",
        description: "Check WhatsApp user connection status and cached message count.",
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: unknown) {
          const connected = isConnected();
          const sock = getSocket();
          const selfJid = sock?.user?.id;
          const msgCount = getMessageCount();

          return textResult(
            [
              `Connected: ${connected ? "yes" : "no"}`,
              selfJid ? `Account: ${formatJid(selfJid)}` : "Account: not paired",
              `Cached messages: ${msgCount}`,
            ].join("\n"),
            { connected, msgCount },
          );
        },
      },
      { name: "wa_status" },
    );

    api.registerTool(
      {
        name: "wa_list_chats",
        label: "WhatsApp List Chats",
        description:
          "List recent WhatsApp chats with last message preview. Shows both DMs and groups from cached messages.",
        parameters: Type.Object({
          limit: Type.Optional(Type.Number({ description: "Max chats to return (default: 20)" })),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { limit = 20 } = params as { limit?: number };
          await ensureConnected();

          const chats = getRecentChats(limit);
          if (chats.length === 0) {
            return textResult(
              "No cached messages yet. Messages are cached as they arrive. Try sending or receiving a message first.",
            );
          }

          const lines = chats.map((chat) => {
            const preview = chat.lastMessage.text.slice(0, 80) || `[${chat.lastMessage.mediaType}]`;
            const from = chat.lastMessage.fromMe ? "You" : formatJid(chat.lastMessage.senderJid);
            return `${formatJid(chat.chatJid)} (${chat.count} msgs)\n  ${from}: ${preview}\n  ${formatTimestamp(chat.lastMessage.timestamp)}`;
          });

          return textResult(lines.join("\n\n"), { count: chats.length });
        },
      },
      { name: "wa_list_chats" },
    );

    api.registerTool(
      {
        name: "wa_read_messages",
        label: "WhatsApp Read Messages",
        description:
          "Read messages from a specific WhatsApp chat. Provide the chat JID (phone@s.whatsapp.net for DMs, id@g.us for groups).",
        parameters: Type.Object({
          chatJid: Type.String({ description: "Chat JID (e.g. 1234567890@s.whatsapp.net or groupid@g.us)" }),
          limit: Type.Optional(Type.Number({ description: "Max messages to return (default: 20)" })),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { chatJid, limit = 20 } = params as { chatJid: string; limit?: number };
          await ensureConnected();

          const msgs = getMessages(chatJid, limit);
          if (msgs.length === 0) {
            return textResult(
              `No cached messages for ${formatJid(chatJid)}. Messages are cached as they arrive.`,
            );
          }

          const lines = msgs.reverse().map((msg) => {
            const sender = msg.fromMe ? "You" : formatJid(msg.senderJid);
            const media = msg.mediaType ? ` [${msg.mediaType}]` : "";
            return `[${formatTimestamp(msg.timestamp)}] ${sender}: ${msg.text}${media}`;
          });

          return textResult(
            `Messages in ${formatJid(chatJid)}:\n\n${lines.join("\n")}`,
            { count: msgs.length },
          );
        },
      },
      { name: "wa_read_messages" },
    );

    api.registerTool(
      {
        name: "wa_send_message",
        label: "WhatsApp Send Message",
        description:
          "Send a WhatsApp message to any contact or group as the user. Provide the chat JID.",
        parameters: Type.Object({
          chatJid: Type.String({ description: "Recipient JID (e.g. 1234567890@s.whatsapp.net)" }),
          text: Type.String({ description: "Message text to send" }),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { chatJid, text } = params as { chatJid: string; text: string };
          await ensureConnected();

          const sock = getSocket();
          if (!sock) {
            return textResult("Not connected. Use wa_pair first.");
          }

          const sent = await sock.sendMessage(chatJid, { text });
          return textResult(
            `Sent to ${formatJid(chatJid)}: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
            { messageId: sent?.key?.id },
          );
        },
      },
      { name: "wa_send_message" },
    );

    api.registerTool(
      {
        name: "wa_search_contacts",
        label: "WhatsApp Search Contacts",
        description:
          "Check if phone numbers exist on WhatsApp. Returns JIDs for numbers that are registered.",
        parameters: Type.Object({
          phoneNumbers: Type.Array(Type.String(), {
            description: "Phone numbers in international format (e.g. +1234567890)",
          }),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { phoneNumbers } = params as { phoneNumbers: string[] };
          await ensureConnected();

          const sock = getSocket();
          if (!sock) {
            return textResult("Not connected. Use wa_pair first.");
          }

          const results = await sock.onWhatsApp(
            ...phoneNumbers.map((n) => n.replace(/[^0-9]/g, "")),
          );

          if (!results || results.length === 0) {
            return textResult("None of the provided numbers are on WhatsApp.");
          }

          const lines = results.map(
            (r) => `${r.jid}: ${r.exists ? "on WhatsApp" : "not found"}`,
          );

          return textResult(lines.join("\n"), { results });
        },
      },
      { name: "wa_search_contacts" },
    );

    api.registerTool(
      {
        name: "wa_list_groups",
        label: "WhatsApp List Groups",
        description: "List all WhatsApp groups the user is participating in.",
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: unknown) {
          await ensureConnected();

          const sock = getSocket();
          if (!sock) {
            return textResult("Not connected. Use wa_pair first.");
          }

          const groups = await sock.groupFetchAllParticipating();
          const entries = Object.values(groups);

          if (entries.length === 0) {
            return textResult("No groups found.");
          }

          const lines = entries
            .sort((a, b) => (a.subject ?? "").localeCompare(b.subject ?? ""))
            .map((g) => `${g.id}: ${g.subject} (${g.participants?.length ?? 0} members)`);

          return textResult(
            `Groups (${entries.length}):\n\n${lines.join("\n")}`,
            { count: entries.length },
          );
        },
      },
      { name: "wa_list_groups" },
    );

    api.registerTool(
      {
        name: "wa_contact_info",
        label: "WhatsApp Contact Info",
        description: "Get profile picture URL and status for a WhatsApp contact.",
        parameters: Type.Object({
          jid: Type.String({ description: "Contact JID (e.g. 1234567890@s.whatsapp.net)" }),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { jid } = params as { jid: string };
          await ensureConnected();

          const sock = getSocket();
          if (!sock) {
            return textResult("Not connected. Use wa_pair first.");
          }

          let profilePic: string | undefined;
          try {
            profilePic = await sock.profilePictureUrl(jid, "image");
          } catch {
            // No profile picture or privacy settings
          }

          let status: string | undefined;
          try {
            const s = await sock.fetchStatus(jid) as unknown;
            if (Array.isArray(s)) {
              status = (s[0] as { status?: string })?.status;
            } else if (s && typeof s === "object") {
              status = (s as { status?: string }).status;
            }
          } catch {
            // No status or privacy settings
          }

          const lines = [
            `JID: ${jid}`,
            `Display: ${formatJid(jid)}`,
            profilePic ? `Profile picture: ${profilePic}` : "Profile picture: not available",
            status ? `Status: ${status}` : "Status: not available",
          ];

          return textResult(lines.join("\n"), { profilePic, status });
        },
      },
      { name: "wa_contact_info" },
    );

    // ------------------------------------------------------------------
    // Pruning (periodic cleanup)
    // ------------------------------------------------------------------

    const pruneInterval = setInterval(
      () => {
        const pruned = pruneOlderThan(cfg.messageRetentionDays);
        if (pruned > 0) {
          api.logger.info(`whatsapp-user: pruned ${pruned} old messages`);
        }
      },
      60 * 60 * 1000, // every hour
    );

    // ------------------------------------------------------------------
    // Service lifecycle
    // ------------------------------------------------------------------

    api.registerService({
      id: "whatsapp-user",
      async start() {
        api.logger.info(`whatsapp-user: plugin started (auth: ${authDir})`);
        await ensureConnected();
      },
      async stop() {
        clearInterval(pruneInterval);
        await disconnect();
        api.logger.info("whatsapp-user: stopped");
      },
    });
  },
};

export default plugin;
