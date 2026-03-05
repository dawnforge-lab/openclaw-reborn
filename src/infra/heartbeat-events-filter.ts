import { HEARTBEAT_TOKEN } from "../auto-reply/tokens.js";

// Build a dynamic prompt for cron events by embedding the actual event content.
// This ensures the model sees the reminder text directly instead of relying on
// "shown in the system messages above" which may not be visible in context.
export function buildCronEventPrompt(
  pendingEvents: string[],
  opts?: {
    deliverToUser?: boolean;
  },
): string {
  const deliverToUser = opts?.deliverToUser ?? true;
  const eventText = pendingEvents.join("\n").trim();
  if (!eventText) {
    return (
      "A scheduled event was triggered but had no specific content. " +
      "Use this as an opportunity: check on pending work, review recent conversations for follow-ups, " +
      "or reach out to the user if you have something worth sharing. Prefer engagement over silence."
    );
  }
  if (!deliverToUser) {
    return (
      "A scheduled task has been triggered. The task is:\n\n" +
      eventText +
      "\n\nExecute this task now using your tools. After completing it, think about whether the results are worth sharing with the user — if so, message them proactively. Do not just acknowledge the task. Take action, then communicate."
    );
  }
  return (
    "A scheduled task has been triggered. The task is:\n\n" +
    eventText +
    "\n\nExecute this task now using your tools. Once done, share results with the user and engage — ask if they need anything else, offer observations, or suggest next steps. Do not just acknowledge the task. Take action, then communicate."
  );
}

export function buildExecEventPrompt(opts?: { deliverToUser?: boolean }): string {
  const deliverToUser = opts?.deliverToUser ?? true;
  if (!deliverToUser) {
    return (
      "An async command you ran earlier has completed. The result is shown in the system messages above. " +
      "Handle the result internally. Do not relay it to the user unless explicitly requested."
    );
  }
  return (
    "An async command you ran earlier has completed. The result is shown in the system messages above. " +
    "Please relay the command output to the user in a helpful way. If the command succeeded, share the relevant output. " +
    "If it failed, explain what went wrong."
  );
}

const HEARTBEAT_OK_PREFIX = HEARTBEAT_TOKEN.toLowerCase();

// Detect heartbeat-specific noise so cron reminders don't trigger on non-reminder events.
function isHeartbeatAckEvent(evt: string): boolean {
  const trimmed = evt.trim();
  if (!trimmed) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith(HEARTBEAT_OK_PREFIX)) {
    return false;
  }
  const suffix = lower.slice(HEARTBEAT_OK_PREFIX.length);
  if (suffix.length === 0) {
    return true;
  }
  return !/[a-z0-9_]/.test(suffix[0]);
}

function isHeartbeatNoiseEvent(evt: string): boolean {
  const lower = evt.trim().toLowerCase();
  if (!lower) {
    return false;
  }
  return (
    isHeartbeatAckEvent(lower) ||
    lower.includes("heartbeat poll") ||
    lower.includes("heartbeat wake")
  );
}

export function isExecCompletionEvent(evt: string): boolean {
  return evt.toLowerCase().includes("exec finished");
}

// Returns true when a system event should be treated as real cron reminder content.
export function isCronSystemEvent(evt: string) {
  if (!evt.trim()) {
    return false;
  }
  return !isHeartbeatNoiseEvent(evt) && !isExecCompletionEvent(evt);
}
