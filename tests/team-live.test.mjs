import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractRecord } from '../src/host/team-live.js';
import { reconcileLiveTeamState } from '../src/host/routes.js';
import { createTeamStore } from '../src/host/team-store.js';

function makeMockCtx() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-team-live-test-"));
  return {
    baseDir: tmpDir,
    get: (key) => key === "dshHomePath" ? (...segments) => path.join(tmpDir, ...segments) : null,
    logger: { warn: () => {}, info: () => {}, error: () => {} }
  };
}

test('extractRecord returns default structure on empty or invalid input', () => {
  const empty1 = extractRecord([]);
  assert.equal(empty1.thinking.text, '');
  assert.equal(empty1.thinking.isThinking, false);
  assert.deepEqual(empty1.tools, []);
  assert.deepEqual(empty1.messages, []);
  assert.equal(empty1.phase, 'idle');
  assert.equal(empty1.lastActivityMs, 0);

  const empty2 = extractRecord(null);
  assert.equal(empty2.phase, 'idle');
});

test('extractRecord captures thinking, caps at 600 chars, and detects active thinking', () => {
  const longThought = 'A'.repeat(800);
  const now = Date.now();
  const events = [
    { type: 'thought', text: longThought, timestamp: now },
    { type: 'thinking_start' }
  ];
  const record = extractRecord(events);
  assert.equal(record.thinking.text.length, 600);
  assert.equal(record.thinking.text.endsWith('…'), true);
  assert.equal(record.thinking.isThinking, true);
  assert.equal(record.phase, 'thinking');
  assert.equal(record.lastActivityMs, now);
});

test('extractRecord extracts tools and messages and tracks phase transitions', () => {
  const now = Date.now();
  const events = [
    { type: 'tool_call', toolName: 'web_search', id: 'call_1', args: { query: 'dsh' }, timestamp: now - 3000 },
    { type: 'tool_result', id: 'call_1', result: 'ok', timestamp: now - 2000 },
    { type: 'user_message', text: 'Hello', timestamp: now - 1000 },
    { type: 'tool_use', name: 'read_file', input: { path: 'foo.txt' }, timestamp: now }
  ];
  const record = extractRecord(events);
  assert.equal(record.tools.length, 2);
  assert.equal(record.tools[0].name, 'web_search');
  assert.equal(record.tools[0].status, 'done');
  assert.equal(record.tools[1].name, 'read_file');
  assert.equal(record.tools[1].status, 'running');
  assert.equal(record.phase, 'tool');
  assert.equal(record.messages.length, 1);
  assert.equal(record.messages[0].text, 'Hello');
});

test('reconcileLiveTeamState correlates subagent sessions and auto-completes finished tickets', () => {
  const ctx = makeMockCtx();
  const scope = { effect: (fn) => fn() };
  const teamStore = createTeamStore(ctx, scope);

  teamStore.apply('profile-add', {
    name: 'Alice',
    role: 'member',
    instructions: 'Developer'
  });

  const worker = teamStore.snapshot().profiles.find((p) => p.role !== 'resident_router');
  assert.ok(worker, 'Must have a worker profile');

  // Create a working ticket for this worker
  const ticketRes = teamStore.apply('ticket-add', {
    workerId: worker.id,
    title: 'Code Refactor Subtask',
    summary: 'Refactor client team module',
    status: 'working'
  });
  assert.equal(ticketRes.ok, true);
  const ticketId = ticketRes.ticket.id;

  // Simulate subagent session running and then becoming idle
  const now = Date.now();
  const liveSnapshot = {
    sessions: [
      {
        id: 'sess-worker-123',
        origin: 'subagent',
        teammate: true,
        title: `Subtask for ${worker.name}: Code Refactor`,
        phase: 'idle',
        presence: 'idle',
        lastActivityMs: now + 1000
      }
    ]
  };

  reconcileLiveTeamState(teamStore, liveSnapshot);

  const updatedState = teamStore.snapshot();
  const updatedTicket = updatedState.tickets.find((t) => t.id === ticketId);
  assert.equal(updatedTicket.status, 'ready');
  assert.equal(updatedTicket.recallRefs.sessionId, 'sess-worker-123');

  const updatedWorker = updatedState.profiles.find((p) => p.id === worker.id);
  assert.equal(updatedWorker.sessionId, 'sess-worker-123');
});
