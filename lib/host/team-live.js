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
function clampText(value, max) {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function extractRecord(eventsOrSession, maybeEvents) {
  let events = [];
  if (Array.isArray(eventsOrSession)) {
    events = eventsOrSession;
  } else if (Array.isArray(maybeEvents)) {
    events = maybeEvents;
  } else if (eventsOrSession && Array.isArray(eventsOrSession.events)) {
    events = eventsOrSession.events;
  }

  let latestThinkingText = "";
  let latestThinkingTime = 0;
  let isThinking = false;
  let hasInFlightAttempt = false;

  const toolsMap = new Map();
  const messages = [];
  let latestActivityMs = 0;
  let lastEvent = null;

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    lastEvent = event;
    const seq = Number(event.seq);
    const time = Number(event.time || event.timestamp || event.timestampMs) || 0;
    if (time > latestActivityMs) latestActivityMs = time;
    const data = event.data && typeof event.data === "object" ? event.data : {};
    const type = String(event.type || event.kind || "");

    // 1. Thinking / reasoning
    if (type === "thinking_start") {
      isThinking = true;
      if (time > latestThinkingTime) latestThinkingTime = time;
    } else if (type === "reasoning" || type === "thought" || type === "thinking") {
      const text = String(data.text || data.reasoning || event.text || event.thought || event.content || "");
      if (text) {
        latestThinkingText = text;
        latestThinkingTime = time;
        isThinking = true;
      }
    } else if (type === "assistant/attempt") {
      hasInFlightAttempt = true;
      const reasoning = String(data.reasoning || data.delta?.reasoning || data.chunk || "");
      if (reasoning) {
        latestThinkingText = reasoning;
        latestThinkingTime = time;
        isThinking = true;
      }
    }

    // Check blocks in assistant/message
    if (type === "assistant/message") {
      hasInFlightAttempt = false;
      const content = data.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "thinking" || block.type === "reasoning") {
            const think = String(block.thinking || block.reasoning || block.text || "");
            if (think) {
              latestThinkingText = think;
              latestThinkingTime = time;
            }
          } else if (block.type === "tool_use" || block.type === "tool_call") {
            const id = String(block.id || block.tool_use_id || newId("tool"));
            const name = String(block.name || block.toolName || "tool");
            const summary = typeof block.input === "string" ? block.input : (typeof block.args === "string" ? block.args : JSON.stringify(block.input || block.args || {}));
            toolsMap.set(id, {
              id,
              name,
              summary: clampText(summary, 120),
              status: "running",
              outputExcerpt: "",
              timestampMs: time
            });
          } else if (block.type === "tool_result") {
            const id = String(block.tool_use_id || block.id || "");
            const existing = toolsMap.get(id);
            const status = block.is_error ? "error" : "done";
            const rawOutput = typeof block.content === "string" ? block.content : JSON.stringify(block.content || "");
            if (existing) {
              existing.status = status;
              existing.outputExcerpt = clampText(rawOutput, 240);
              existing.timestampMs = time;
            } else if (id) {
              toolsMap.set(id, {
                id,
                name: "tool",
                summary: "",
                status,
                outputExcerpt: clampText(rawOutput, 240),
                timestampMs: time
              });
            }
          }
        }
      }
      const text = textFromBlocks(content) || (typeof data.text === "string" ? data.text : "");
      if (text) {
        messages.push({
          role: "assistant",
          text: clampText(text, 1000),
          seq: Number.isFinite(seq) ? seq : messages.length + 1,
          timestampMs: time
        });
      }
    }

    // Direct tool_use / tool_call event
    if (type === "tool_use" || type === "tool_call" || type === "tool/call") {
      const id = String(data.id || event.id || newId("tool"));
      const name = String(event.toolName || data.name || event.name || "tool");
      const summary = typeof data.input === "string" ? data.input : (typeof event.args === "string" ? event.args : JSON.stringify(data.input || event.args || {}));
      toolsMap.set(id, {
        id,
        name,
        summary: clampText(summary, 120),
        status: "running",
        outputExcerpt: "",
        timestampMs: time
      });
    }

    // Direct tool_result event
    if (type === "tool_result" || type === "tool/result") {
      const id = String(data.tool_use_id || data.id || event.tool_use_id || event.id || "");
      const existing = toolsMap.get(id);
      const status = data.is_error || event.is_error || event.error ? "error" : "done";
      const rawOutput = typeof data.content === "string" ? data.content : (typeof event.result === "string" ? event.result : (typeof data.output === "string" ? data.output : JSON.stringify(data.content || event.result || data.output || "")));
      if (existing) {
        existing.status = status;
        existing.outputExcerpt = clampText(rawOutput, 240);
        existing.timestampMs = time;
      } else if (id) {
        toolsMap.set(id, {
          id,
          name: "tool",
          summary: "",
          status,
          outputExcerpt: clampText(rawOutput, 240),
          timestampMs: time
        });
      }
    }

    // User message
    if (type === "user/message" || type === "user_message" || (type === "message" && (event.role === "user" || data.role === "user"))) {
      const text = textFromBlocks(data.content) || (typeof data.text === "string" ? data.text : "") || (typeof event.text === "string" ? event.text : "");
      if (text) {
        messages.push({
          role: "user",
          text: clampText(text, 1000),
          seq: Number.isFinite(seq) ? seq : messages.length + 1,
          timestampMs: time
        });
      }
    }
  }

  // Determine isThinking
  const now = Date.now();
  if (lastEvent) {
    const ltype = String(lastEvent.type || lastEvent.kind || "");
    if (ltype === "reasoning" || ltype === "assistant/attempt" || ltype === "thought" || ltype === "thinking" || ltype === "thinking_start") {
      isThinking = true;
    } else if (ltype === "user/message" || ltype === "user_message" || ltype === "assistant/message") {
      isThinking = false;
    }
  }

  // Derive execution phase: "thinking" | "tool" | "responding" | "waiting" | "idle"
  let phase = "idle";
  const recentTools = Array.from(toolsMap.values()).slice(-8);
  const runningTool = recentTools.find((t) => t.status === "running");

  if (isThinking) {
    phase = "thinking";
  } else if (runningTool) {
    phase = "tool";
  } else if (hasInFlightAttempt) {
    phase = "responding";
  } else if (lastEvent?.type === "assistant/message") {
    phase = (now - latestActivityMs < 120000) ? "waiting" : "idle";
  } else if (now - latestActivityMs < WORKING_WINDOW_MS && latestActivityMs > 0) {
    phase = "responding";
  } else {
    phase = "idle";
  }

  const boundedMessages = messages.slice(-10);

  return {
    thinking: {
      text: clampText(latestThinkingText, 600),
      fullText: latestThinkingText,
      isThinking,
      timestampMs: latestThinkingTime
    },
    tools: recentTools,
    messages: boundedMessages,
    phase,
    lastActivityMs: latestActivityMs
  };
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
  const liveRecords = /* @__PURE__ */ new Map();
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
          const sessionQuery = ctx.get("sessionQuery");
          if (sessionQuery && typeof sessionQuery.observeSession === "function") {
            events = await sessionQuery.observeSession(id, { projectionMode: "none" });
          }
        } catch {
          events = null;
        }
        if (!events) {
          try {
            events = typeof session.snapshotEvents === "function" ? session.snapshotEvents(from) : null;
          } catch {
            events = null;
          }
        }
        if (Array.isArray(events) && events.length > 0) {
          const rec = extractRecord(events);
          liveRecords.set(id, rec);
          if (rec.lastActivityMs > 0) {
            let newest = Math.max(lastActivity.get(id) ?? 0, rec.lastActivityMs);
            lastActivity.set(id, newest);
          }
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
        liveRecords.delete(id);
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

      const rec = liveRecords.get(row.id) || {
        thinking: { text: "", fullText: "", isThinking: false, timestampMs: 0 },
        tools: [],
        messages: [],
        phase: "idle",
        lastActivityMs: row.lastActivityMs
      };
      let presence = "idle";
      if (rec.phase === "thinking" || rec.phase === "tool" || rec.phase === "responding") {
        presence = "working";
      } else if (rec.phase === "waiting") {
        presence = "waiting";
      } else if (now - row.lastActivityMs < WORKING_WINDOW_MS && row.lastActivityMs > 0) {
        presence = "working";
      }

      sessions2.push({
        ...row,
        thinking: rec.thinking,
        tools: rec.tools,
        messages: rec.messages,
        phase: rec.phase,
        presence
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
  evaluateWatchdog,
  extractRecord
};
