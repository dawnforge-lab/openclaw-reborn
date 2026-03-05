# OpenClaw Reborn

A private fork of [OpenClaw](https://github.com/openclaw/openclaw) — a personal AI assistant you run on your own devices. This fork focuses on **autonomous agent behavior**, improved onboarding, and practical deployment changes.

## What's Different

### Autonomous Behavior (not just a chatbot)

The original OpenClaw heartbeat and cron systems train the agent to be passive — the rewarded path is replying `HEARTBEAT_OK` and summarizing tasks. This fork rewrites the autonomy prompts to encourage **action and engagement**:

- **Heartbeat prompt** — agent executes tasks from HEARTBEAT.md, reviews conversations for follow-ups, and proactively reaches out. `HEARTBEAT_OK` is a last resort, not the default.
- **Cron job prompts** — jobs execute tasks using tools and share results, instead of just relaying reminders.
- **Autonomous behavior skill** — always-loaded skill (`skills/autonomous-behavior/SKILL.md`) that teaches the agent proactive patterns: do don't report, always communicate, be a companion.

### ngrok Tunnel (alongside Tailscale)

Added ngrok as an alternative tunnel option for easier mobile app pairing and public access:

- Tunnel type selection in onboarding: **None / ngrok / Tailscale**
- Uses `@ngrok/ngrok` SDK — optional static domain, auto-loopback bind
- Tailscale Serve/Funnel still fully supported

### Memory-LanceDB in Onboarding

Vector memory setup is now part of the onboarding wizard instead of manual JSON editing:

- **Quickstart**: auto-enables if `OPENAI_API_KEY` is in the environment
- **Advanced**: prompts to enable, choose API key source (env var or manual)
- Configures `memory-lancedb` plugin with `autoCapture` and `autoRecall` enabled

## Install

Runtime: **Node >= 22**, **pnpm >= 9**.

### Quick install (isolated from source)

Install globally from GitHub — no need to clone the repo:

```bash
pnpm install -g "github:dawnforge-lab/openclaw-reborn"
```

Then run the onboarding wizard:

```bash
openclaw onboard --install-daemon
```

To update to the latest version:

```bash
pnpm install -g "github:dawnforge-lab/openclaw-reborn"
```

### Development setup

If you want to contribute or modify the source:

```bash
git clone https://github.com/dawnforge-lab/openclaw-reborn.git
cd openclaw-reborn

pnpm install
pnpm ui:build
pnpm build

pnpm openclaw onboard --install-daemon
```

Dev loop:

```bash
pnpm gateway:watch
```

## Architecture

```
Channels (WhatsApp / Telegram / Slack / Discord / Signal / iMessage / etc.)
               |
               v
+-------------------------------+
|           Gateway             |
|       (control plane)         |
|     ws://127.0.0.1:18789     |
+---------------+---------------+
                |
                +-- Pi agent (RPC)
                +-- CLI (openclaw ...)
                +-- Control UI / WebChat
                +-- ngrok / Tailscale tunnel
                +-- macOS / iOS / Android nodes
```

## Key Features (from upstream)

- **Multi-channel inbox** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, IRC, Teams, Matrix, and more
- **Gateway WebSocket control plane** — sessions, channels, tools, events, cron, webhooks
- **Browser control** — managed Chrome/Chromium with CDP
- **Voice Wake + Talk Mode** — wake words on macOS/iOS, continuous voice on Android
- **Live Canvas** — agent-driven visual workspace with A2UI
- **Skills platform** — bundled, managed, and workspace skills
- **Multi-agent routing** — route channels/accounts to isolated agents

## Security

Treat inbound DMs as untrusted input. Default DM policy is `pairing` (unknown senders get a code).

```bash
openclaw doctor              # surface misconfigurations
openclaw security audit      # security review
```

## Upstream

Based on [OpenClaw](https://github.com/openclaw/openclaw). Original docs: [docs.openclaw.ai](https://docs.openclaw.ai).

## License

[MIT](LICENSE)
