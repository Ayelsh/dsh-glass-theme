// packages/contracts/src/package.ts
var PACKAGE_NAME = "dsh-glass-theme";

// packages/host/src/team-live.ts
// Live facts for the sidebar team mode: which sessions are open, which of
// them are teammates (origin "subagent"), who is working right now, and what
// arrived since the sidebar last looked. The harness `sessions` service is the
// only source — the store keeps user state, this keeps observations.
var LIVE_TTL_MS = 2e3;
var WORKING_WINDOW_MS = 30 * 1e3;
var MESSAGE_LOG_MAX = 200;
var MENTION_LOG_MAX = 100;
var TEAMMATE_ORIGIN = "subagent";
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const block of blocks) {
    if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
function messagesOf(events) {
  const messages = [];
  if (!Array.isArray(events)) return messages;
  for (const event of events) {
    if (event === null || typeof event !== "object") continue;
    const seq = Number(event.seq);
    if (!Number.isFinite(seq)) continue;
    const time = Number(event.time);
    const data = event.data !== null && typeof event.data === "object" ? event.data : {};
    if (event.type === "user/message" && data.source?.kind === "user") {
      const text = textFromBlocks(data.content);
      if (text !== "") messages.push({ seq, role: "user", text, time: Number.isFinite(time) ? time : 0 });
      continue;
    }
    if (event.type === "assistant/message") {
      const text = textFromBlocks(data.message?.content);
      if (text !== "") messages.push({ seq, role: "assistant", text, time: Number.isFinite(time) ? time : 0 });
    }
  }
  return messages;
}
function createTeamLive(ctx, nameProvider) {
  let sessions = null;
  try {
    const service = ctx.get("sessions");
    if (service !== null && service !== void 0 && typeof service.list === "function") sessions = service;
  } catch {
  }
  const lastSeq = /* @__PURE__ */ new Map();
  const baselineSeq = /* @__PURE__ */ new Map();
  const lastActivity = /* @__PURE__ */ new Map();
  const messageLog = /* @__PURE__ */ new Map();
  const mentionLog = /* @__PURE__ */ new Map();
  let value = null;
  let computing = false;
  let error = void 0;
  let disposed = false;
  let pending = null;
  function scanMentions(text, names) {
    if (names.length === 0 || text === "") return [];
    const pattern = new RegExp(`@(${names.map(escapeRegExp).join("|")})(?![A-Za-z0-9_-])`, "g");
    const found = /* @__PURE__ */ new Set();
    let match = pattern.exec(text);
    while (match !== null) {
      found.add(match[1]);
      match = pattern.exec(text);
    }
    return [...found];
  }
  async function compute(publish) {
    if (sessions === null) {
      publish({ sessions: [], mentions: {}, unread: {} });
      return;
    }
    const listed = sessions.list();
    const rows = [];
    const live = /* @__PURE__ */ new Set();
    const names = typeof nameProvider === "function" ? nameProvider() : [];
    for (const session of listed ?? []) {
      const id = typeof session === "string" ? session : session?.id;
      if (typeof id !== "string" || id === "") continue;
      live.add(id);
      const origin = typeof session === "object" ? session?.header?.origin ?? "" : "";
      const title = typeof session === "object" ? session?.header?.title ?? session?.title ?? "" : "";
      const seq = typeof session === "object" ? Number(session?.seq) : NaN;
      if (!lastSeq.has(id)) {
        /* First sighting: fold the whole retained window (from 0) so badges
           and presence reflect history, and hold the baseline at 0 — the
           store's seen watermark, planted when the user focuses the scope,
           is what clears them. */
        lastSeq.set(id, 0);
        baselineSeq.set(id, 0);
        if (!lastActivity.has(id)) lastActivity.set(id, 0);
      }
      if (Number.isFinite(seq) && seq > (lastSeq.get(id) ?? 0)) {
        const from = lastSeq.get(id) ?? 0;
        lastSeq.set(id, seq);
        let events = null;
        try {
          events = typeof session.snapshotEvents === "function" ? session.snapshotEvents(from) : null;
        } catch {
          events = null;
        }
        const messages = messagesOf(events);
        if (messages.length > 0) {
          let newest = lastActivity.get(id) ?? 0;
          for (const message of messages) if (Number.isFinite(message.time) && message.time > newest) newest = message.time;
          if (newest > 0) lastActivity.set(id, newest);
          let log = messageLog.get(id);
          if (log === void 0) {
            log = [];
            messageLog.set(id, log);
          }
          let mentions = mentionLog.get(id);
          if (mentions === void 0) {
            mentions = [];
            mentionLog.set(id, mentions);
          }
          for (const message of messages) {
            log.push(message.seq);
            const hit = scanMentions(message.text, names);
            if (hit.length > 0) mentions.push({ seq: message.seq, names: hit });
          }
          if (log.length > MESSAGE_LOG_MAX) log.splice(0, log.length - MESSAGE_LOG_MAX);
          if (mentions.length > MENTION_LOG_MAX) mentions.splice(0, mentions.length - MENTION_LOG_MAX);
        }
      }
      rows.push({
        id,
        origin,
        title: typeof title === "string" ? title.slice(0, 200) : "",
        seq: Number.isFinite(seq) ? seq : 0,
        lastActivityMs: lastActivity.get(id) ?? 0,
        teammate: origin === TEAMMATE_ORIGIN
      });
    }
    for (const id of [...lastSeq.keys()]) {
      if (!live.has(id)) {
        lastSeq.delete(id);
        baselineSeq.delete(id);
        lastActivity.delete(id);
        messageLog.delete(id);
        mentionLog.delete(id);
      }
    }
    publish({ sessions: rows, mentions: {}, unread: {} });
  }
  function payload(seen) {
    const marks = seen !== null && typeof seen === "object" ? seen : {};
    const now = Date.now();
    const sessions2 = [];
    const mentions = {};
    const unread = {};
    for (const row of value?.sessions ?? []) {
      const seenSeq = Number(marks[row.id]) ?? NaN;
      const floor = Number.isFinite(seenSeq) ? seenSeq : baselineSeq.get(row.id) ?? 0;
      const log = messageLog.get(row.id) ?? [];
      unread[row.id] = log.filter((seq) => seq > floor).length;
      const hits = mentionLog.get(row.id) ?? [];
      mentions[row.id] = hits.filter((entry) => entry.seq > floor).length;
      sessions2.push({
        ...row,
        presence: now - row.lastActivityMs < WORKING_WINDOW_MS ? "working" : "idle"
      });
    }
    return { sessions: sessions2, mentions, unread, now };
  }
  function snapshot() {
    return { value, computing: computing === true, error, payload };
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    if (pending !== null) return pending;
    computing = true;
    error = void 0;
    pending = compute((next) => {
      value = next;
    }).catch((failure) => {
      error = failure instanceof Error ? failure : new Error(String(failure));
    }).finally(() => {
      computing = false;
      pending = null;
    });
    return pending;
  }
  function dispose() {
    disposed = true;
  }
  return { snapshot, refresh, dispose, LIVE_TTL_MS };
}
function evaluateWatchdog(tickets, now = Date.now(), opts = {}) {
  const stallAgeMs = Number(opts.stallThresholdMs) || 60000;
  const flagged = [];
  for (const ticket of tickets ?? []) {
    if (ticket.status !== "working" && ticket.status !== "queued") continue;
    let reason = "";
    if (ticket.retryCount >= 3) {
      reason = "retry_cap";
    } else if (now - (ticket.lastActivityMs || ticket.createdAt) > stallAgeMs) {
      reason = "stall_age";
    } else if (Array.isArray(opts.driftTicketIds) && opts.driftTicketIds.includes(ticket.id)) {
      reason = "goal_drift";
    }
    if (reason !== "") {
      flagged.push({ id: ticket.id, reason });
    }
  }
  return flagged;
}
export {
  TEAMMATE_ORIGIN,
  WORKING_WINDOW_MS,
  createTeamLive,
  evaluateWatchdog
};
