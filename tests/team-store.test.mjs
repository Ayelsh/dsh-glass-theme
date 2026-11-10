import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createTeamStore, selectWorkerForDispatch, STORE_VERSION } from "../src/host/team-store.js";

function makeMockCtx() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-team-test-"));
  return {
    baseDir: tmpDir,
    get: (key) => key === "dshHomePath" ? (...segments) => path.join(tmpDir, ...segments) : null,
    logger: { warn: () => {}, info: () => {}, error: () => {} }
  };
}

describe("Team Store - Task 1.1: selectWorkerForDispatch & Dispatch Routing", () => {
  test("routes to explicit worker if valid member provided", () => {
    const state = {
      profiles: [
        { id: "lead-1", name: "Lead", role: "lead" },
        { id: "worker-1", name: "Alice", role: "member" },
        { id: "worker-2", name: "Bob", role: "member" }
      ],
      tickets: []
    };
    const selected = selectWorkerForDispatch(state, { workerId: "worker-2", text: "do task" });
    assert.equal(selected.id, "worker-2");
  });

  test("routes to worker by @mention in text", () => {
    const state = {
      profiles: [
        { id: "lead-1", name: "Lead", role: "lead" },
        { id: "worker-1", name: "Alice", role: "member" },
        { id: "worker-2", name: "Bob", role: "member" }
      ],
      tickets: []
    };
    const selected = selectWorkerForDispatch(state, { workerId: "auto", text: "Please help @Bob with this" });
    assert.equal(selected.id, "worker-2");
  });

  test("routes to room subscribed worker when roomId is provided", () => {
    const state = {
      profiles: [
        { id: "lead-1", name: "Lead", role: "lead" },
        { id: "worker-1", name: "Alice", role: "member" },
        { id: "worker-2", name: "Bob", role: "member" }
      ],
      rooms: [
        { id: "room-qa", name: "QA", subscribedWorkerIds: ["worker-2"] }
      ],
      tickets: []
    };
    const selected = selectWorkerForDispatch(state, { workerId: "auto", text: "Run tests", roomId: "room-qa" });
    assert.equal(selected.id, "worker-2");
  });

  test("routes by roleTitle or instructions keyword matching", () => {
    const state = {
      profiles: [
        { id: "lead-1", name: "Lead", role: "lead" },
        { id: "worker-1", name: "Alice", role: "member", roleTitle: "frontend", instructions: "React CSS" },
        { id: "worker-2", name: "Bob", role: "member", roleTitle: "backend", instructions: "Database SQL" }
      ],
      tickets: []
    };
    const selected = selectWorkerForDispatch(state, { text: "Fix database query performance" });
    assert.equal(selected.id, "worker-2");
  });

  test("routes by lowest active workload when ambiguous", () => {
    const state = {
      profiles: [
        { id: "lead-1", name: "Lead", role: "lead" },
        { id: "worker-1", name: "Alice", role: "member" },
        { id: "worker-2", name: "Bob", role: "member" }
      ],
      tickets: [
        { id: "t1", workerId: "worker-1", status: "working" },
        { id: "t2", workerId: "worker-1", status: "queued" }
      ]
    };
    const selected = selectWorkerForDispatch(state, { workerId: "auto", text: "Generic task" });
    assert.equal(selected.id, "worker-2"); // Bob has 0 active tickets vs Alice 2
  });

  test("ticket-add and trigger-intake route to worker instead of trapping on lead", () => {
    const ctx = makeMockCtx();
    const store = createTeamStore(ctx);
    // Add Alice as worker
    store.apply("profile-add", { name: "Alice", role: "member" });
    const snap = store.snapshot();
    const alice = snap.profiles.find(p => p.role === "member");
    assert.ok(alice);

    // Add ticket without workerId
    const res = store.apply("ticket-add", { title: "Fix login button" });
    assert.equal(res.ok, true);
    assert.equal(res.ticket.workerId, alice.id);

    // Intake trigger without explicit target
    const trgRes = store.apply("trigger-intake", { text: "Investigate crash", mode: "auto" });
    assert.equal(trgRes.ok, true);
    assert.equal(trgRes.ticket.workerId, alice.id);
  });
});

describe("Team Store - Task 1.2: Session Binding & Migration", () => {
  test("profile-bind-session updates member sessionId and unbound tickets", () => {
    const ctx = makeMockCtx();
    const store = createTeamStore(ctx);
    store.apply("profile-add", { name: "Bob", role: "member" });
    const bob = store.snapshot().profiles.find(p => p.name === "Bob");
    store.apply("ticket-add", { title: "Subtask 1", workerId: bob.id });

    const bindRes = store.apply("profile-bind-session", { memberId: bob.id, sessionId: "sess-bob-99" });
    assert.equal(bindRes.ok, true);

    const updatedSnap = store.snapshot();
    const updatedBob = updatedSnap.profiles.find(p => p.id === bob.id);
    assert.equal(updatedBob.sessionId, "sess-bob-99");
    const ticket = updatedSnap.tickets.find(t => t.workerId === bob.id);
    assert.equal(ticket.recallRefs.sessionId, "sess-bob-99");
  });

  test("watchdog-resolve reassigns worker and resets ticket status", () => {
    const ctx = makeMockCtx();
    const store = createTeamStore(ctx);
    store.apply("profile-add", { name: "Worker1", role: "member" });
    store.apply("profile-add", { name: "Worker2", role: "member", sessionId: "sess-w2" });
    const snap = store.snapshot();
    const w1 = snap.profiles.find(p => p.name === "Worker1");
    const w2 = snap.profiles.find(p => p.name === "Worker2");

    const tktRes = store.apply("ticket-add", { title: "Stalled task", workerId: w1.id, status: "working" });
    const tktId = tktRes.ticket.id;

    // Simulate stall check
    tktRes.ticket.lastActivityMs = Date.now() - 100000;
    store.apply("watchdog-check", { stallThresholdMs: 50000 });

    const stalledTicket = store.snapshot().tickets.find(t => t.id === tktId);
    assert.equal(stalledTicket.status, "stalled");

    // Resolve by reassigning to Worker2
    const resolveRes = store.apply("watchdog-resolve", {
      id: tktId,
      action: "reassign",
      targetWorkerId: w2.id
    });
    assert.equal(resolveRes.ok, true);
    assert.equal(resolveRes.ticket.status, "working");
    assert.equal(resolveRes.ticket.workerId, w2.id);
    assert.equal(resolveRes.ticket.recallRefs.workerId, w2.id);
    assert.equal(resolveRes.ticket.recallRefs.sessionId, "sess-w2");
  });

  test("normalizeState migrates legacy tickets stuck on lead to eligible workers", () => {
    const ctx = makeMockCtx();
    const initialStore = createTeamStore(ctx);
    const storePath = initialStore.path;
    const rawData = {
      version: STORE_VERSION,
      profiles: [
        { id: "lead-0", name: "Lead", role: "lead" },
        { id: "worker-1", name: "Worker1", role: "member" }
      ],
      tickets: [
        {
          id: "tkt-legacy",
          title: "Legacy task trapped on lead",
          workerId: "lead-0",
          status: "working",
          summary: "Do legacy things",
          recallRefs: { workerId: "lead-0", sessionId: "" }
        }
      ]
    };
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(rawData), "utf8");

    const store = createTeamStore(ctx);
    const snap = store.snapshot();
    const migratedTicket = snap.tickets.find((t) => t.id === "tkt-legacy");
    assert.ok(migratedTicket, "Ticket should exist");
    assert.equal(migratedTicket.workerId, "worker-1");
    assert.equal(migratedTicket.recallRefs.workerId, "worker-1");
  });
});

describe("Team Store - Task 1.3: Telemetry-Grounded side-send", () => {
  test("synthesizes reply incorporating live thinking, tools, and phase without mutating main state", () => {
    const ctx = makeMockCtx();
    const store = createTeamStore(ctx);
    store.apply("profile-add", { name: "Researcher", role: "member" });
    const snap = store.snapshot();
    const researcher = snap.profiles.find(p => p.name === "Researcher");

    const telemetry = {
      phase: "tool",
      thinking: { text: "Analyzing query parameters for memory leak", fullText: "Analyzing query parameters for memory leak in detail" },
      tools: [
        { id: "tool-1", name: "grep", status: "done" },
        { id: "tool-2", name: "read", status: "running" }
      ]
    };

    const sideRes = store.apply("side-send", {
      memberId: researcher.id,
      text: "How is the investigation going?",
      telemetry
    });

    assert.equal(sideRes.ok, true);
    assert.match(sideRes.reply, /Researcher/);
    assert.match(sideRes.reply, /当前阶段: tool/);
    assert.match(sideRes.reply, /Analyzing query parameters/);
    assert.match(sideRes.reply, /read \(running\)/);
    assert.match(sideRes.reply, /主会话与工单状态保持未修改/);

    // Verify main conversation & tickets untouched
    const afterSnap = store.snapshot();
    assert.equal(afterSnap.tickets.length, 0);
    assert.equal(afterSnap.sideChats[researcher.id].length, 2); // user + assistant
  });
});
