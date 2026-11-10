// packages/contracts/src/package.ts
var PACKAGE_NAME = "dsh-glass-theme";

// packages/host/src/team-store.ts
// Team state for the glass skin's sidebar team mode: profiles, rooms, memory,
// side chats, learning cards, handoff checkpoints and read marks. One JSON
// document under the harness home, version-guarded, strictly normalized,
// atomically written — the same discipline the usage record follows.
import { existsSync, renameSync } from "node:fs";
import { pluginPath } from "./harness-home.js";
import { readJsonDocument, writeJsonDocument } from "./cache-file.js";

var STORE_VERSION = 1;
var STORE_SEGMENTS = ["team-state.json"];
var CAPS = {
  profiles: 32,
  rooms: 64,
  memoryPerMember: 200,
  sideMessages: 200,
  learning: 50,
  checkpoints: 50,
  avatarBytes: 64 * 1024,
  nameMax: 64,
  roleMax: 64,
  instructionsMax: 4000,
  textMax: 4000,
  goalMax: 240,
  roomNameMax: 120,
  triggers: 100,
  mandates: 64,
  tickets: 64,
  outbox: 100
};
var ROLES = ["lead", "member"];
var LEARNING_STATUSES = ["pending", "accepted", "discarded"];
var TICKET_STATUSES = ["observed", "queued", "working", "ready", "merged", "stalled"];

function storePath(ctx) {
  return pluginPath(ctx, ...STORE_SEGMENTS);
}
function emptyState() {
  return {
    version: STORE_VERSION,
    profiles: [],
    rooms: [],
    memory: {},
    sideChats: {},
    learning: [],
    checkpoints: [],
    seen: {},
    triggers: [],
    mandates: [],
    tickets: [],
    outbox: []
  };
}
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function clampText(value, max) {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) : value;
}
function avatarOf(value) {
  if (typeof value !== "string" || value === "") return "";
  if (!value.startsWith("data:image/")) return "";
  if (value.length > CAPS.avatarBytes) return "";
  return value;
}
function idList(value, knownIds, max) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const item of value) {
    if (typeof item !== "string" || item === "") continue;
    if (knownIds !== void 0 && !knownIds.has(item)) continue;
    if (ids.includes(item)) continue;
    ids.push(item);
    if (ids.length >= max) break;
  }
  return ids;
}
function profileFromStored(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const name = clampText(raw.name, CAPS.nameMax);
  if (name === "") return null;
  const role = ROLES.includes(raw.role) ? raw.role : "member";
  return {
    id: typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("member"),
    name,
    role,
    instructions: clampText(raw.instructions, CAPS.instructionsMax),
    avatar: avatarOf(raw.avatar),
    sessionId: typeof raw.sessionId === "string" && raw.sessionId !== "" ? raw.sessionId : "",
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  };
}
function roomFromStored(raw, memberIds) {
  if (raw === null || typeof raw !== "object") return null;
  const name = clampText(raw.name, CAPS.roomNameMax);
  if (name === "") return null;
  return {
    id: typeof raw.id === "string" && raw.id !== "" ? raw.id : newId("room"),
    name,
    memberIds: idList(raw.memberIds, memberIds, CAPS.profiles),
    subscribedWorkerIds: idList(raw.subscribedWorkerIds, memberIds, CAPS.profiles),
    sessionId: typeof raw.sessionId === "string" && raw.sessionId !== "" ? raw.sessionId : "",
    goal: clampText(raw.goal, CAPS.goalMax),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  };
}
function memoryFromStored(raw) {
  const memory = {};
  if (raw === null || typeof raw !== "object") return memory;
  for (const [memberId, entries] of Object.entries(raw)) {
    if (typeof memberId !== "string" || memberId === "" || !Array.isArray(entries)) continue;
    const kept = [];
    for (const entry of entries) {
      if (entry === null || typeof entry !== "object") continue;
      const text = clampText(entry.text, CAPS.textMax);
      if (text === "") continue;
      kept.push({
        id: typeof entry.id === "string" && entry.id !== "" ? entry.id : newId("mem"),
        text,
        time: Number.isFinite(entry.time) ? entry.time : Date.now()
      });
      if (kept.length >= CAPS.memoryPerMember) break;
    }
    if (kept.length > 0) memory[memberId] = kept;
  }
  return memory;
}
function sideChatsFromStored(raw) {
  const sideChats = {};
  if (raw === null || typeof raw !== "object") return sideChats;
  for (const [memberId, messages] of Object.entries(raw)) {
    if (typeof memberId !== "string" || memberId === "" || !Array.isArray(messages)) continue;
    const kept = [];
    for (const message of messages) {
      if (message === null || typeof message !== "object") continue;
      const text = clampText(message.text, CAPS.textMax);
      if (text === "") continue;
      kept.push({
        role: message.role === "assistant" ? "assistant" : "user",
        text,
        time: Number.isFinite(message.time) ? message.time : Date.now()
      });
      if (kept.length >= CAPS.sideMessages) break;
    }
    if (kept.length > 0) sideChats[memberId] = kept;
  }
  return sideChats;
}
function learningFromStored(raw, memberIds) {
  const learning = [];
  if (!Array.isArray(raw)) return learning;
  for (const card of raw) {
    if (card === null || typeof card !== "object") continue;
    const text = clampText(card.text, CAPS.textMax);
    if (text === "") continue;
    const memberId = typeof card.memberId === "string" ? card.memberId : "";
    if (memberId !== "" && memberIds !== void 0 && !memberIds.has(memberId)) continue;
    learning.push({
      id: typeof card.id === "string" && card.id !== "" ? card.id : newId("learn"),
      memberId,
      text,
      time: Number.isFinite(card.time) ? card.time : Date.now(),
      status: LEARNING_STATUSES.includes(card.status) ? card.status : "pending"
    });
    if (learning.length >= CAPS.learning) break;
  }
  return learning;
}
function checkpointsFromStored(raw, memberIds) {
  const checkpoints = [];
  if (!Array.isArray(raw)) return checkpoints;
  for (const card of raw) {
    if (card === null || typeof card !== "object") continue;
    const text = clampText(card.text, CAPS.textMax);
    if (text === "") continue;
    const memberId = typeof card.memberId === "string" ? card.memberId : "";
    if (memberId !== "" && memberIds !== void 0 && !memberIds.has(memberId)) continue;
    checkpoints.push({
      id: typeof card.id === "string" && card.id !== "" ? card.id : newId("ckpt"),
      memberId,
      text,
      time: Number.isFinite(card.time) ? card.time : Date.now()
    });
    if (checkpoints.length >= CAPS.checkpoints) break;
  }
  return checkpoints;
}
function seenFromStored(raw) {
  const seen = {};
  if (raw === null || typeof raw !== "object") return seen;
  for (const [scope, seq] of Object.entries(raw)) {
    if (typeof scope !== "string" || scope === "") continue;
    const value = Number(seq);
    if (!Number.isFinite(value) || value < 0) continue;
    seen[scope] = value;
  }
  return seen;
}
function triggersFromStored(raw) {
  const triggers = [];
  if (!Array.isArray(raw)) return triggers;
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const text = clampText(item.text, CAPS.textMax);
    if (text === "") continue;
    triggers.push({
      id: typeof item.id === "string" && item.id !== "" ? item.id : newId("trg"),
      threadId: typeof item.threadId === "string" ? item.threadId : "",
      source: typeof item.source === "string" ? item.source : "user",
      text,
      type: ["explicit", "candidate", "ignore"].includes(item.type) ? item.type : "candidate",
      targetMemberId: typeof item.targetMemberId === "string" ? item.targetMemberId : "",
      passThrough: item.passThrough === true,
      time: Number.isFinite(item.time) ? item.time : Date.now()
    });
    if (triggers.length >= CAPS.triggers) break;
  }
  return triggers;
}
function mandatesFromStored(raw) {
  const mandates = [];
  if (!Array.isArray(raw)) return mandates;
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const scope = clampText(item.scope, CAPS.textMax);
    mandates.push({
      id: typeof item.id === "string" && item.id !== "" ? item.id : newId("mnd"),
      threadId: typeof item.threadId === "string" ? item.threadId : "",
      scope,
      status: ["observed", "authorized", "revoked"].includes(item.status) ? item.status : "observed",
      time: Number.isFinite(item.time) ? item.time : Date.now()
    });
    if (mandates.length >= CAPS.mandates) break;
  }
  return mandates;
}
function ticketsFromStored(raw, memberIds) {
  const tickets = [];
  if (!Array.isArray(raw)) return tickets;
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const title = clampText(item.title, CAPS.nameMax);
    const workerId = typeof item.workerId === "string" ? item.workerId : "";
    if (workerId !== "" && memberIds !== void 0 && !memberIds.has(workerId)) continue;
    const recallRefs = item.recallRefs && typeof item.recallRefs === "object" ? {
      triggerIds: Array.isArray(item.recallRefs.triggerIds) ? item.recallRefs.triggerIds.map(String) : [],
      threadId: typeof item.recallRefs.threadId === "string" ? item.recallRefs.threadId : "",
      mandateId: typeof item.recallRefs.mandateId === "string" ? item.recallRefs.mandateId : "",
      ticketId: typeof item.recallRefs.ticketId === "string" ? item.recallRefs.ticketId : (item.id || ""),
      workerId: typeof item.recallRefs.workerId === "string" ? item.recallRefs.workerId : workerId,
      sessionId: typeof item.recallRefs.sessionId === "string" ? item.recallRefs.sessionId : ""
    } : {
      triggerIds: [],
      threadId: typeof item.threadId === "string" ? item.threadId : "",
      mandateId: typeof item.mandateId === "string" ? item.mandateId : "",
      ticketId: typeof item.id === "string" ? item.id : "",
      workerId,
      sessionId: ""
    };
    const contextEvents = Array.isArray(item.contextEvents) ? item.contextEvents.slice(0, 50).map(evt => ({
      text: clampText(evt.text, CAPS.textMax),
      time: Number.isFinite(evt.time) ? evt.time : Date.now(),
      source: typeof evt.source === "string" ? evt.source : "user",
      triggerId: typeof evt.triggerId === "string" ? evt.triggerId : ""
    })) : [];
    tickets.push({
      id: typeof item.id === "string" && item.id !== "" ? item.id : newId("tkt"),
      title: title !== "" ? title : "Untitled Ticket",
      threadId: typeof item.threadId === "string" ? item.threadId : "",
      mandateId: typeof item.mandateId === "string" ? item.mandateId : "",
      workerId,
      status: TICKET_STATUSES.includes(item.status) ? item.status : "observed",
      summary: clampText(item.summary, CAPS.goalMax),
      contextEvents,
      deliverable: clampText(item.deliverable, CAPS.textMax),
      recallRefs,
      spill: item.spill !== undefined && item.spill !== null ? item.spill : { details: item.summary || "", continuation: null },
      retryCount: Number.isFinite(item.retryCount) && item.retryCount >= 0 ? item.retryCount : 0,
      lastActivityMs: Number.isFinite(item.lastActivityMs) ? item.lastActivityMs : Date.now(),
      watchdogReason: typeof item.watchdogReason === "string" ? item.watchdogReason : "",
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now()
    });
    if (tickets.length >= CAPS.tickets) break;
  }
  return tickets;
}
function outboxFromStored(raw) {
  const outbox = [];
  if (!Array.isArray(raw)) return outbox;
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const requestId = typeof item.requestId === "string" ? item.requestId : "";
    if (requestId === "") continue;
    outbox.push({
      requestId,
      action: typeof item.action === "string" ? item.action : "",
      result: item.result,
      time: Number.isFinite(item.time) ? item.time : Date.now()
    });
    if (outbox.length >= CAPS.outbox) break;
  }
  return outbox;
}
function selectWorkerForDispatch(state, { workerId, text = "", roomId = "" } = {}) {
  const profiles = Array.isArray(state?.profiles) ? state.profiles : [];
  const workers = profiles.filter((p) => p && p.role === "member");
  const lead = profiles.find((p) => p && p.role === "lead") || profiles[0] || null;

  if (workers.length === 0) {
    return lead;
  }

  // 1. If explicit workerId given and is a valid Worker (and not lead/auto/""), use it
  if (workerId && workerId !== "auto" && (!lead || workerId !== lead.id)) {
    const explicitWorker = workers.find((w) => w.id === workerId);
    if (explicitWorker) return explicitWorker;
  }

  const rawText = typeof text === "string" ? text : "";

  // 2. Check for @mention matching Worker name or id
  if (rawText) {
    const mentionedWorker = workers.find(
      (w) => rawText.includes(`@${w.name}`) || rawText.includes(`@${w.id}`)
    );
    if (mentionedWorker) return mentionedWorker;
  }

  // 3. Narrow candidate pool by room if roomId is provided
  let candidates = workers;
  if (roomId && Array.isArray(state?.rooms)) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (room && Array.isArray(room.subscribedWorkerIds) && room.subscribedWorkerIds.length > 0) {
      const roomWorkers = workers.filter((w) => room.subscribedWorkerIds.includes(w.id));
      if (roomWorkers.length > 0) {
        candidates = roomWorkers;
      }
    }
  }

  // 4. Keyword matching on roleTitle or instructions
  if (rawText && candidates.length > 1) {
    const lowerText = rawText.toLowerCase();
    const keywordMatches = candidates.filter((w) => {
      const roleTitle = (w.roleTitle || "").toLowerCase();
      const instructions = (w.instructions || "").toLowerCase();
      const matchRole = roleTitle && (lowerText.includes(roleTitle) || roleTitle.split(/[\s,;]+/).some((t) => t.length > 2 && lowerText.includes(t)));
      const matchInst = instructions && (lowerText.includes(instructions) || instructions.split(/[\s,;]+/).some((t) => t.length > 2 && lowerText.includes(t)));
      return matchRole || matchInst;
    });
    if (keywordMatches.length === 1) {
      return keywordMatches[0];
    }
    if (keywordMatches.length > 1) {
      candidates = keywordMatches;
    }
  }

  // 5. Workload balancing: select candidate with lowest count of active tickets (working / queued)
  const tickets = Array.isArray(state?.tickets) ? state.tickets : [];
  const workload = new Map();
  for (const w of candidates) {
    workload.set(w.id, 0);
  }
  for (const t of tickets) {
    if ((t.status === "working" || t.status === "queued") && workload.has(t.workerId)) {
      workload.set(t.workerId, workload.get(t.workerId) + 1);
    }
  }

  let minWorker = candidates[0];
  let minCount = workload.get(minWorker.id) ?? 0;
  for (let i = 1; i < candidates.length; i++) {
    const count = workload.get(candidates[i].id) ?? 0;
    if (count < minCount) {
      minCount = count;
      minWorker = candidates[i];
    }
  }

  return minWorker;
}

function normalizeState(raw) {
  const state = emptyState();
  if (raw === null || typeof raw !== "object") return state;
  if (raw.version !== STORE_VERSION) return state;
  const profiles = [];
  const profileIds = /* @__PURE__ */ new Set();
  if (Array.isArray(raw.profiles)) {
    for (const item of raw.profiles) {
      const profile = profileFromStored(item);
      if (profile === null || profileIds.has(profile.id)) continue;
      profiles.push(profile);
      profileIds.add(profile.id);
      if (profiles.length >= CAPS.profiles) break;
    }
  }
  state.profiles = profiles;
  const memberIds = new Set(profiles.map((profile) => profile.id));
  const rooms = [];
  const roomIds = /* @__PURE__ */ new Set();
  if (Array.isArray(raw.rooms)) {
    for (const item of raw.rooms) {
      const room = roomFromStored(item, memberIds);
      if (room === null || roomIds.has(room.id)) continue;
      rooms.push(room);
      roomIds.add(room.id);
      if (rooms.length >= CAPS.rooms) break;
    }
  }
  state.rooms = rooms;
  state.memory = memoryFromStored(raw.memory);
  state.sideChats = sideChatsFromStored(raw.sideChats);
  state.learning = learningFromStored(raw.learning, memberIds);
  state.checkpoints = checkpointsFromStored(raw.checkpoints, memberIds);
  state.seen = seenFromStored(raw.seen);
  state.triggers = triggersFromStored(raw.triggers);
  state.mandates = mandatesFromStored(raw.mandates);
  state.tickets = ticketsFromStored(raw.tickets, memberIds);
  state.outbox = outboxFromStored(raw.outbox);

  // Migrate legacy tickets stuck on lead or unassigned when Workers exist
  const workers = state.profiles.filter((p) => p.role === "member");
  const lead = state.profiles.find((p) => p.role === "lead") || state.profiles[0];
  if (workers.length > 0) {
    for (const t of state.tickets) {
      if (!t.workerId || (lead && t.workerId === lead.id)) {
        const selected = selectWorkerForDispatch(state, {
          text: `${t.title || ""} ${t.summary || ""}`,
          roomId: t.threadId
        });
        if (selected && selected.id !== (lead ? lead.id : "")) {
          t.workerId = selected.id;
          if (t.recallRefs) {
            t.recallRefs.workerId = selected.id;
            if (!t.recallRefs.sessionId && selected.sessionId) {
              t.recallRefs.sessionId = selected.sessionId;
            }
          }
        }
      }
    }
  }
  return state;
}
function stateOf(stored) {
  if (stored === void 0) return { kind: "fresh", state: emptyState() };
  if (stored === null || typeof stored !== "object") return { kind: "fresh", state: emptyState() };
  if (stored.version !== STORE_VERSION) {
    return { kind: "foreign", state: emptyState() };
  }
  return { kind: "ours", state: normalizeState(stored) };
}
function sortProfiles(profiles) {
  const rank = (profile) => profile.role === "lead" ? 0 : 1;
  return [...profiles].sort((one, two) => rank(one) - rank(two) || one.createdAt - two.createdAt);
}
function createTeamStore(ctx) {
  const path = storePath(ctx);
  const label = "team state";
  let loaded = stateOf(readJsonDocument(ctx, path, label));
  if (loaded.kind === "fresh" && existsSync(path)) {
    const aside = `${path}.unreadable-${Date.now()}`;
    try {
      renameSync(path, aside);
      ctx.logger?.warn?.(`${PACKAGE_NAME}: ${label} moved aside to ${aside}; it starts over`);
    } catch (error) {
      ctx.logger?.warn?.(`${PACKAGE_NAME}: ${label} unreadable and not movable: ${error?.message ?? String(error)}`);
    }
  }
  let state = loaded.state;
  let foreign = loaded.kind === "foreign";
  const persist = () => {
    if (foreign) return false;
    state.version = STORE_VERSION;
    return writeJsonDocument(ctx, path, label, state);
  };
  const snapshot = () => normalizeState(state);
  const reset = () => {
    if (foreign) return { ok: false, error: "team state holds a foreign version and is read-only" };
    state = emptyState();
    persist();
    return { ok: true };
  };
  const findProfile = (id) => state.profiles.find((profile) => profile.id === id);
  const findRoom = (id) => state.rooms.find((room) => room.id === id);
  const dropMember = (memberId) => {
    delete state.memory[memberId];
    delete state.sideChats[memberId];
    state.learning = state.learning.filter((card) => card.memberId !== memberId);
    state.checkpoints = state.checkpoints.filter((card) => card.memberId !== memberId);
    for (const room of state.rooms) {
      room.memberIds = room.memberIds.filter((id) => id !== memberId);
      if (Array.isArray(room.subscribedWorkerIds)) {
        room.subscribedWorkerIds = room.subscribedWorkerIds.filter((id) => id !== memberId);
      }
    }
    for (const ticket of state.tickets) {
      if (ticket.workerId === memberId) ticket.workerId = "";
    }
  };
  const checkOutbox = (requestId) => {
    if (typeof requestId !== "string" || requestId === "") return null;
    const entry = state.outbox.find((item) => item.requestId === requestId);
    return entry ? entry.result : null;
  };
  const recordOutbox = (requestId, action, result) => {
    if (typeof requestId !== "string" || requestId === "") return;
    state.outbox.push({ requestId, action, result, time: Date.now() });
    if (state.outbox.length > CAPS.outbox) state.outbox.splice(0, state.outbox.length - CAPS.outbox);
  };
  const apply = (kind, payload) => {
    if (foreign) return { ok: false, error: "team state holds a foreign version and is read-only" };
    const request = payload !== null && typeof payload === "object" ? payload : {};
    const cached = checkOutbox(request.requestId);
    if (cached !== null) return cached;
    switch (kind) {
      case "profile-add": {
        const name = clampText(request.name, CAPS.nameMax).trim();
        if (name === "") return { ok: false, error: "member needs a name" };
        if (state.profiles.length >= CAPS.profiles) return { ok: false, error: `team holds at most ${CAPS.profiles} members` };
        const profile = {
          id: newId("member"),
          name,
          role: ROLES.includes(request.role) ? request.role : "member",
          instructions: clampText(request.instructions, CAPS.instructionsMax),
          avatar: avatarOf(request.avatar),
          sessionId: clampText(request.sessionId, 200),
          createdAt: Date.now()
        };
        state.profiles.push(profile);
        state.profiles = sortProfiles(state.profiles);
        break;
      }
      case "profile-update": {
        const profile = findProfile(request.id);
        if (profile === void 0) return { ok: false, error: "unknown member" };
        const patch = request.patch !== null && typeof request.patch === "object" ? request.patch : request;
        if (patch.name !== void 0) {
          const name = clampText(patch.name, CAPS.nameMax).trim();
          if (name === "") return { ok: false, error: "member needs a name" };
          profile.name = name;
        }
        if (patch.role !== void 0 && ROLES.includes(patch.role)) profile.role = patch.role;
        if (patch.instructions !== void 0) profile.instructions = clampText(patch.instructions, CAPS.instructionsMax);
        if (patch.avatar !== void 0) profile.avatar = avatarOf(patch.avatar);
        if (patch.sessionId !== void 0) {
          profile.sessionId = clampText(patch.sessionId, 200);
          for (const t of state.tickets) {
            if (t.workerId === profile.id && t.recallRefs && !t.recallRefs.sessionId) {
              t.recallRefs.sessionId = profile.sessionId;
            }
          }
        }
        state.profiles = sortProfiles(state.profiles);
        break;
      }
      case "profile-bind-session": {
        const id = typeof request.memberId === "string" && request.memberId !== "" ? request.memberId : request.id;
        const profile = findProfile(id);
        if (profile === void 0) return { ok: false, error: "unknown member" };
        const sessionId = clampText(request.sessionId, 200);
        profile.sessionId = sessionId;
        for (const t of state.tickets) {
          if (t.workerId === profile.id && t.recallRefs && !t.recallRefs.sessionId) {
            t.recallRefs.sessionId = sessionId;
          }
        }
        break;
      }
      case "profile-remove": {
        const before = state.profiles.length;
        state.profiles = state.profiles.filter((profile) => profile.id !== request.id);
        if (state.profiles.length === before) return { ok: false, error: "unknown member" };
        dropMember(request.id);
        break;
      }
      case "room-add": {
        const name = clampText(request.name, CAPS.roomNameMax).trim();
        if (name === "") return { ok: false, error: "room needs a name" };
        if (state.rooms.length >= CAPS.rooms) return { ok: false, error: `team holds at most ${CAPS.rooms} rooms` };
        const memberIds = new Set(state.profiles.map((profile) => profile.id));
        state.rooms.push({
          id: typeof request.id === "string" && request.id !== "" ? request.id : newId("room"),
          name,
          memberIds: idList(request.memberIds, memberIds, CAPS.profiles),
          subscribedWorkerIds: idList(request.subscribedWorkerIds, memberIds, CAPS.profiles),
          sessionId: clampText(request.sessionId, 200),
          goal: clampText(request.goal, CAPS.goalMax),
          createdAt: Date.now()
        });
        break;
      }
      case "room-update": {
        const room = findRoom(request.id);
        if (room === void 0) return { ok: false, error: "unknown room" };
        const patch = request.patch !== null && typeof request.patch === "object" ? request.patch : request;
        if (patch.name !== void 0) {
          const name = clampText(patch.name, CAPS.roomNameMax).trim();
          if (name === "") return { ok: false, error: "room needs a name" };
          room.name = name;
        }
        if (patch.memberIds !== void 0) {
          const memberIds = new Set(state.profiles.map((profile) => profile.id));
          room.memberIds = idList(patch.memberIds, memberIds, CAPS.profiles);
        }
        if (patch.subscribedWorkerIds !== void 0) {
          const memberIds = new Set(state.profiles.map((profile) => profile.id));
          room.subscribedWorkerIds = idList(patch.subscribedWorkerIds, memberIds, CAPS.profiles);
        }
        if (patch.goal !== void 0) room.goal = clampText(patch.goal, CAPS.goalMax);
        if (patch.sessionId !== void 0) room.sessionId = clampText(patch.sessionId, 200);
        break;
      }
      case "room-remove": {
        const before = state.rooms.length;
        state.rooms = state.rooms.filter((room) => room.id !== request.id);
        if (state.rooms.length === before) return { ok: false, error: "unknown room" };
        break;
      }
      case "memory-add": {
        const member = findProfile(request.memberId);
        if (member === void 0) return { ok: false, error: "unknown member" };
        const text = clampText(request.text, CAPS.textMax).trim();
        if (text === "") return { ok: false, error: "memory entry needs text" };
        const entries = state.memory[member.id] ?? (state.memory[member.id] = []);
        entries.push({ id: newId("mem"), text, time: Date.now() });
        if (entries.length > CAPS.memoryPerMember) entries.splice(0, entries.length - CAPS.memoryPerMember);
        break;
      }
      case "memory-edit": {
        const entries = state.memory[request.memberId];
        const entry = Array.isArray(entries) ? entries.find((item) => item.id === request.id) : void 0;
        if (entry === void 0) return { ok: false, error: "unknown memory entry" };
        const text = clampText(request.text, CAPS.textMax).trim();
        if (text === "") return { ok: false, error: "memory entry needs text" };
        entry.text = text;
        entry.time = Date.now();
        break;
      }
      case "memory-remove": {
        const entries = state.memory[request.memberId];
        if (!Array.isArray(entries)) return { ok: false, error: "unknown memory entry" };
        state.memory[request.memberId] = entries.filter((item) => item.id !== request.id);
        if (state.memory[request.memberId].length === 0) delete state.memory[request.memberId];
        break;
      }
      case "memory-clear": {
        const member = findProfile(request.memberId);
        if (member === void 0) return { ok: false, error: "unknown member" };
        delete state.memory[member.id];
        break;
      }
      case "learning-add": {
        const member = findProfile(request.memberId);
        if (member === void 0) return { ok: false, error: "unknown member" };
        const text = clampText(request.text, CAPS.textMax).trim();
        if (text === "") return { ok: false, error: "learning card needs text" };
        state.learning.push({ id: newId("learn"), memberId: member.id, text, time: Date.now(), status: "pending" });
        if (state.learning.length > CAPS.learning) state.learning.splice(0, state.learning.length - CAPS.learning);
        break;
      }
      case "learning-set": {
        const card = state.learning.find((item) => item.id === request.id);
        if (card === void 0) return { ok: false, error: "unknown learning card" };
        if (!LEARNING_STATUSES.includes(request.status)) return { ok: false, error: "unknown learning status" };
        card.status = request.status;
        break;
      }
      case "checkpoint-add": {
        const text = clampText(request.text, CAPS.textMax).trim();
        if (text === "") return { ok: false, error: "checkpoint needs text" };
        const memberId = findProfile(request.memberId) !== void 0 ? request.memberId : "";
        state.checkpoints.push({ id: newId("ckpt"), memberId, text, time: Date.now() });
        if (state.checkpoints.length > CAPS.checkpoints) state.checkpoints.splice(0, state.checkpoints.length - CAPS.checkpoints);
        break;
      }
      case "checkpoint-remove": {
        const before = state.checkpoints.length;
        state.checkpoints = state.checkpoints.filter((item) => item.id !== request.id);
        if (state.checkpoints.length === before) return { ok: false, error: "unknown checkpoint" };
        break;
      }
      case "side-send": {
        const member = findProfile(request.memberId);
        if (member === void 0) return { ok: false, error: "unknown member" };
        const text = clampText(request.text, CAPS.textMax).trim();
        if (text === "") return { ok: false, error: "side chat message needs text" };
        const role = request.role === "assistant" ? "assistant" : "user";
        const messages = state.sideChats[member.id] ?? (state.sideChats[member.id] = []);
        messages.push({ role, text, time: Date.now() });

        let reply = null;
        if (role !== "assistant") {
          const memoryEntries = state.memory[member.id] ?? [];
          const activeTickets = state.tickets.filter((t) => t.workerId === member.id && (t.status === "working" || t.status === "queued"));
          const latestCheckpoint = state.checkpoints.filter((c) => c.memberId === member.id).slice(-1)[0];

          let telemetrySummary = "";
          const telemetry = request.telemetry && typeof request.telemetry === "object"
            ? request.telemetry
            : (request.context && typeof request.context === "object" ? request.context : null);
          if (telemetry) {
            const phaseStr = telemetry.phase ? `当前阶段: ${telemetry.phase}` : "";
            const thinkingText = telemetry.thinking && (telemetry.thinking.text || telemetry.thinking.fullText)
              ? `思考摘要: "${clampText(telemetry.thinking.text || telemetry.thinking.fullText, 80)}"`
              : "";
            const latestTool = Array.isArray(telemetry.tools) && telemetry.tools.length > 0
              ? telemetry.tools[telemetry.tools.length - 1]
              : null;
            const toolStr = latestTool ? `最近工具: ${latestTool.name} (${latestTool.status || "done"})` : "";
            const parts = [phaseStr, thinkingText, toolStr].filter(Boolean);
            if (parts.length > 0) {
              telemetrySummary = ` [实时遥测] ${parts.join(" | ")}。`;
            }
          }

          reply = `[${member.name}] 收到关于 "${text}" 的咨询。角色: ${member.role === "lead" ? "主控(Router)" : "成员(Worker)"}；活跃工单: ${activeTickets.length} 个；记忆条目: ${memoryEntries.length} 条；最新交接: ${latestCheckpoint ? latestCheckpoint.text : "暂无"}。${telemetrySummary}主会话与工单状态保持未修改。`;
          messages.push({ role: "assistant", text: reply, time: Date.now() });
        }
        if (messages.length > CAPS.sideMessages) messages.splice(0, messages.length - CAPS.sideMessages);
        persist();
        const res = { ok: true, reply };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "side-clear": {
        delete state.sideChats[request.memberId];
        break;
      }
      case "trigger-intake": {
        const rawText = typeof request.text === "string" ? request.text : "";
        const text = clampText(rawText, CAPS.textMax).trim();
        const threadId = typeof request.threadId === "string" ? request.threadId : "";
        const room = findRoom(threadId);
        const source = typeof request.source === "string" ? request.source : "user";
        
        let type = "candidate";
        let targetMemberId = typeof request.targetMemberId === "string" ? request.targetMemberId : "";
        
        if (text === "") {
          type = "ignore";
        } else {
          const mentioned = state.profiles.find((p) => text.includes(`@${p.name}`) || text.includes(`@${p.id}`));
          if (mentioned !== void 0) {
            type = "explicit";
            targetMemberId = mentioned.id;
          } else if (targetMemberId !== "" && findProfile(targetMemberId) !== void 0) {
            type = "explicit";
          } else {
            type = "candidate";
          }
        }

        if (room && Array.isArray(room.subscribedWorkerIds) && room.subscribedWorkerIds.length > 0) {
          const activeTicket = state.tickets.find((t) => 
            t.threadId === room.id && 
            room.subscribedWorkerIds.includes(t.workerId) && 
            (t.status === "working" || t.status === "queued")
          );
          if (activeTicket !== void 0) {
            const trigger = {
              id: newId("trg"),
              threadId: room.id,
              source,
              text,
              type,
              targetMemberId: activeTicket.workerId,
              passThrough: true,
              time: Date.now()
            };
            state.triggers.push(trigger);
            if (state.triggers.length > CAPS.triggers) state.triggers.splice(0, state.triggers.length - CAPS.triggers);

            activeTicket.contextEvents.push({ text, time: Date.now(), source, triggerId: trigger.id });
            if (activeTicket.contextEvents.length > 50) activeTicket.contextEvents.splice(0, activeTicket.contextEvents.length - 50);
            activeTicket.lastActivityMs = Date.now();
            activeTicket.updatedAt = Date.now();
            if (!activeTicket.recallRefs.triggerIds.includes(trigger.id)) {
              activeTicket.recallRefs.triggerIds.push(trigger.id);
            }
            persist();
            const res = { ok: true, trigger, passThrough: true, ticketId: activeTicket.id, mandateId: activeTicket.mandateId };
            if (request.requestId) recordOutbox(request.requestId, kind, res);
            return res;
          }
        }

        const trigger = {
          id: newId("trg"),
          threadId: room ? room.id : threadId,
          source,
          text,
          type,
          targetMemberId,
          passThrough: false,
          time: Date.now()
        };
        state.triggers.push(trigger);
        if (state.triggers.length > CAPS.triggers) state.triggers.splice(0, state.triggers.length - CAPS.triggers);

        if (type === "ignore") {
          persist();
          const res = { ok: true, trigger, ignored: true };
          if (request.requestId) recordOutbox(request.requestId, kind, res);
          return res;
        }

        const mode = request.mode === "auto" ? "auto" : "observe";
        const worker = selectWorkerForDispatch(state, {
          workerId: targetMemberId,
          text,
          roomId: room ? room.id : threadId
        });
        const workerId = worker ? worker.id : "";

        if (mode === "observe" && type === "candidate") {
          const mandate = {
            id: newId("mnd"),
            threadId: trigger.threadId,
            scope: `Speculative candidate for thread: ${room ? room.name : trigger.threadId}`,
            status: "observed",
            time: Date.now()
          };
          state.mandates.push(mandate);
          if (state.mandates.length > CAPS.mandates) state.mandates.splice(0, state.mandates.length - CAPS.mandates);

          const ticketId = newId("tkt");
          const ticket = {
            id: ticketId,
            title: clampText(text.split("\n")[0], CAPS.nameMax),
            threadId: trigger.threadId,
            mandateId: mandate.id,
            workerId,
            status: "observed",
            summary: clampText(text, CAPS.goalMax),
            contextEvents: [{ text, time: Date.now(), source: trigger.source, triggerId: trigger.id }],
            deliverable: "",
            recallRefs: {
              triggerIds: [trigger.id],
              threadId: trigger.threadId,
              mandateId: mandate.id,
              ticketId,
              workerId,
              sessionId: worker ? worker.sessionId : ""
            },
            spill: { details: text, continuation: null },
            retryCount: 0,
            lastActivityMs: Date.now(),
            watchdogReason: "",
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          state.tickets.push(ticket);
          if (state.tickets.length > CAPS.tickets) state.tickets.splice(0, state.tickets.length - CAPS.tickets);

          persist();
          const res = { ok: true, trigger, mandate, ticket, mode: "observe", staged: true };
          if (request.requestId) recordOutbox(request.requestId, kind, res);
          return res;
        }

        const mandate = {
          id: newId("mnd"),
          threadId: trigger.threadId,
          scope: `Authorized execution for: ${clampText(text, 120)}`,
          status: "authorized",
          time: Date.now()
        };
        state.mandates.push(mandate);
        if (state.mandates.length > CAPS.mandates) state.mandates.splice(0, state.mandates.length - CAPS.mandates);

        const ticketId = newId("tkt");
        const ticket = {
          id: ticketId,
          title: clampText(text.split("\n")[0], CAPS.nameMax),
          threadId: trigger.threadId,
          mandateId: mandate.id,
          workerId,
          status: "working",
          summary: clampText(text, CAPS.goalMax),
          contextEvents: [{ text, time: Date.now(), source: trigger.source, triggerId: trigger.id }],
          deliverable: "",
          recallRefs: {
            triggerIds: [trigger.id],
            threadId: trigger.threadId,
            mandateId: mandate.id,
            ticketId,
            workerId,
            sessionId: worker ? worker.sessionId : ""
          },
          spill: { details: text, continuation: null },
          retryCount: 0,
          lastActivityMs: Date.now(),
          watchdogReason: "",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        state.tickets.push(ticket);
        if (state.tickets.length > CAPS.tickets) state.tickets.splice(0, state.tickets.length - CAPS.tickets);

        if (room && workerId !== "") {
          if (!Array.isArray(room.subscribedWorkerIds)) room.subscribedWorkerIds = [];
          if (!room.subscribedWorkerIds.includes(workerId)) room.subscribedWorkerIds.push(workerId);
        }

        persist();
        const res = { ok: true, trigger, mandate, ticket, mode, dispatched: true };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "ticket-add": {
        const src = request.ticket && typeof request.ticket === "object" ? { ...request, ...request.ticket } : request;
        const title = clampText(src.title, CAPS.nameMax).trim();
        if (title === "") return { ok: false, error: "ticket needs a title" };
        const threadId = typeof src.threadId === "string" ? src.threadId : "";
        const room = findRoom(threadId);
        const worker = selectWorkerForDispatch(state, {
          workerId: src.workerId,
          text: `${title} ${src.summary || ""}`,
          roomId: threadId
        });
        const workerId = worker ? worker.id : "";
        if (src.sessionId && worker && !worker.sessionId) {
          worker.sessionId = clampText(src.sessionId, 200);
        }
        const summary = clampText(src.summary, CAPS.goalMax);
        const mode = src.mode === "observe" ? "observe" : "auto";
        const mandateStatus = mode === "observe" ? "observed" : "authorized";
        const ticketStatus = src.status && TICKET_STATUSES.includes(src.status) ? src.status : (mode === "observe" ? "observed" : "working");

        const mandate = {
          id: src.mandateId || newId("mnd"),
          threadId,
          scope: clampText(src.mandateScope || title, CAPS.textMax),
          status: mandateStatus,
          time: Date.now()
        };
        state.mandates.push(mandate);
        if (state.mandates.length > CAPS.mandates) state.mandates.splice(0, state.mandates.length - CAPS.mandates);

        const ticketId = src.id || newId("tkt");
        const ticket = {
          id: ticketId,
          title,
          threadId,
          mandateId: mandate.id,
          workerId,
          status: ticketStatus,
          summary,
          contextEvents: [],
          deliverable: clampText(src.deliverable, CAPS.textMax),
          recallRefs: src.recallRefs && typeof src.recallRefs === "object" ? {
            triggerIds: Array.isArray(src.recallRefs.triggerIds) ? src.recallRefs.triggerIds.map(String) : [],
            threadId: typeof src.recallRefs.threadId === "string" ? src.recallRefs.threadId : threadId,
            mandateId: typeof src.recallRefs.mandateId === "string" ? src.recallRefs.mandateId : mandate.id,
            ticketId,
            workerId,
            sessionId: typeof src.recallRefs.sessionId === "string" ? src.recallRefs.sessionId : (src.sessionId || (worker ? worker.sessionId : ""))
          } : {
            triggerIds: Array.isArray(src.triggerIds) ? src.triggerIds.map(String) : [],
            threadId,
            mandateId: mandate.id,
            ticketId,
            workerId,
            sessionId: src.sessionId || (worker ? worker.sessionId : "")
          },
          spill: src.spill !== undefined && src.spill !== null ? src.spill : { details: summary || title, continuation: null },
          retryCount: 0,
          lastActivityMs: Date.now(),
          watchdogReason: "",
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        state.tickets.push(ticket);
        if (state.tickets.length > CAPS.tickets) state.tickets.splice(0, state.tickets.length - CAPS.tickets);

        if (ticket.status === "working" && room && workerId !== "") {
          if (!Array.isArray(room.subscribedWorkerIds)) room.subscribedWorkerIds = [];
          if (!room.subscribedWorkerIds.includes(workerId)) room.subscribedWorkerIds.push(workerId);
        }

        persist();
        const res = { ok: true, ticket, mandate };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "ticket-approve": {
        const ticketId = request.id || request.ticketId;
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (ticket === void 0) return { ok: false, error: "unknown ticket" };
        if (ticket.status === "observed") {
          ticket.status = "working";
          ticket.lastActivityMs = Date.now();
          ticket.updatedAt = Date.now();
        }
        const mandate = state.mandates.find((m) => m.id === ticket.mandateId);
        if (mandate !== void 0) {
          mandate.status = "authorized";
        }
        const room = findRoom(ticket.threadId);
        if (room && ticket.workerId !== "") {
          if (!Array.isArray(room.subscribedWorkerIds)) room.subscribedWorkerIds = [];
          if (!room.subscribedWorkerIds.includes(ticket.workerId)) room.subscribedWorkerIds.push(ticket.workerId);
        }
        persist();
        const res = { ok: true, ticket, mandate };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "ticket-complete": {
        const ticketId = request.id || request.ticketId;
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (ticket === void 0) return { ok: false, error: "unknown ticket" };
        ticket.status = "ready";
        if (request.deliverable !== void 0) ticket.deliverable = clampText(request.deliverable, CAPS.textMax);
        if (request.sessionId) {
          const sessId = clampText(request.sessionId, 200);
          if (ticket.recallRefs) ticket.recallRefs.sessionId = sessId;
          const worker = findProfile(ticket.workerId);
          if (worker && !worker.sessionId) worker.sessionId = sessId;
        }
        ticket.lastActivityMs = Date.now();
        ticket.updatedAt = Date.now();

        let learnCard = null;
        let checkpoint = null;
        if (ticket.workerId !== "") {
          learnCard = {
            id: newId("learn"),
            memberId: ticket.workerId,
            text: `[工单经验] ${ticket.title}: ${clampText(ticket.deliverable || ticket.summary, 180)}`,
            ticketId: ticket.id,
            time: Date.now(),
            status: "pending"
          };
          state.learning.push(learnCard);
          if (state.learning.length > CAPS.learning) state.learning.splice(0, state.learning.length - CAPS.learning);

          checkpoint = {
            id: newId("chk"),
            memberId: ticket.workerId,
            text: `[工单交付] ${ticket.title}: ${clampText(ticket.deliverable || ticket.summary, 180)}`,
            ticketId: ticket.id,
            threadId: ticket.threadId,
            time: Date.now()
          };
          state.checkpoints.push(checkpoint);
          if (state.checkpoints.length > CAPS.checkpoints) state.checkpoints.splice(0, state.checkpoints.length - CAPS.checkpoints);
        }

        persist();
        const res = { ok: true, ticket, learning: learnCard, checkpoint };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "ticket-update": {
        const ticketId = request.id || request.ticketId;
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (ticket === void 0) return { ok: false, error: "unknown ticket" };
        const patch = request.patch !== null && typeof request.patch === "object" ? request.patch : request;
        if (patch.title !== void 0) {
          const title = clampText(patch.title, CAPS.nameMax).trim();
          if (title !== "") ticket.title = title;
        }
        if (patch.status !== void 0 && TICKET_STATUSES.includes(patch.status)) ticket.status = patch.status;
        if (patch.summary !== void 0) ticket.summary = clampText(patch.summary, CAPS.goalMax);
        if (patch.deliverable !== void 0) ticket.deliverable = clampText(patch.deliverable, CAPS.textMax);
        if (patch.spill !== void 0) ticket.spill = patch.spill;
        if (Number.isFinite(patch.retryCount)) ticket.retryCount = Math.max(0, Number(patch.retryCount));
        if (patch.watchdogReason !== void 0) ticket.watchdogReason = String(patch.watchdogReason);
        if (patch.workerId !== void 0) {
          ticket.workerId = typeof patch.workerId === "string" ? patch.workerId : "";
          if (ticket.recallRefs) ticket.recallRefs.workerId = ticket.workerId;
        }
        ticket.updatedAt = Date.now();
        ticket.lastActivityMs = Date.now();
        persist();
        const res = { ok: true, ticket };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "watchdog-check": {
        const now = Date.now();
        const stallAgeMs = Number(request.stallThresholdMs) || 60000;
        const driftList = Array.isArray(request.driftTicketIds) ? request.driftTicketIds : [];
        const flagged = [];
        for (const ticket of state.tickets) {
          if (ticket.status !== "working" && ticket.status !== "queued") continue;
          let reason = "";
          if (ticket.retryCount >= 3) {
            reason = "retry_cap";
          } else if (now - (ticket.lastActivityMs || ticket.createdAt) > stallAgeMs) {
            reason = "stall_age";
          } else if (driftList.includes(ticket.id)) {
            reason = "goal_drift";
          }
          if (reason !== "") {
            ticket.status = "stalled";
            ticket.watchdogReason = reason;
            ticket.updatedAt = now;
            flagged.push(ticket);
          }
        }
        persist();
        const res = { ok: true, flagged, count: flagged.length };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "watchdog-resolve": {
        const ticket = state.tickets.find((t) => t.id === request.id);
        if (ticket === void 0) return { ok: false, error: "unknown ticket" };
        const targetWorkerId = request.workerId || request.targetWorkerId;
        if (targetWorkerId) {
          const newWorker = findProfile(targetWorkerId);
          if (newWorker) {
            ticket.workerId = newWorker.id;
            if (ticket.recallRefs) {
              ticket.recallRefs.workerId = newWorker.id;
              if (newWorker.sessionId) ticket.recallRefs.sessionId = newWorker.sessionId;
            }
          }
        }
        const action = request.action === "dismiss" ? "dismiss" : (request.action === "reassign" ? "reassign" : "retry");
        if (action === "dismiss") {
          ticket.status = "merged";
          ticket.watchdogReason = "dismissed";
        } else {
          ticket.status = "working";
          ticket.retryCount = 0;
          ticket.lastActivityMs = Date.now();
          ticket.watchdogReason = "";
        }
        ticket.updatedAt = Date.now();
        persist();
        const res = { ok: true, ticket, action };
        if (request.requestId) recordOutbox(request.requestId, kind, res);
        return res;
      }
      case "seen": {
        const scope = clampText(request.scope, 240);
        if (scope === "") return { ok: false, error: "seen needs a scope" };
        const seq = Number(request.seq);
        if (!Number.isFinite(seq) || seq < 0) return { ok: false, error: "seen needs a sequence" };
        state.seen[scope] = seq;
        break;
      }
      case "seen-all": {
        for (const scope of Object.keys(state.seen)) delete state.seen[scope];
        break;
      }
      case "reset": {
        return reset();
      }
      default:
        return { ok: false, error: `unknown team mutation: ${String(kind)}` };
    }
    persist();
    return { ok: true };
  };
  return { snapshot, apply, reset, path };
}
export {
  CAPS,
  STORE_VERSION,
  createTeamStore,
  selectWorkerForDispatch
};
