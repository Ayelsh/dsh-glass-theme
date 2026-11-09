/**
 * Team store check — persistence, caps, guards, and the team route (task 1.1).
 *
 * WHY THIS EXISTS: the team store is user state; losing or corrupting it is
 * worse than a blank panel. This check runs the BUILT host module
 * (lib/host/team-store.js) against a temp harness home and asserts the whole
 * contract the sidebar depends on: round-trips across store instances, the
 * lead-first roster order, per-capacity pruning, cascade removal, the
 * foreign-version read-only guard, the corrupt-file move-aside, reset — and
 * then drives the real route handler from lib/host/routes.js the way the GUI
 * would: a fenced GET that folds live presence over the store, a POST
 * mutation, and the refusals in between.
 *
 *   node tools/build.mjs && node tools/team-store-check.mjs
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/* --- tiny assertion helpers ------------------------------------------- */

let failures = 0
let checks = 0
const ok = (label, condition) => {
  checks += 1
  if (!condition) {
    failures += 1
    console.log(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}
const section = (label) => console.log(`\n-- ${label}`)

/* --- harness home: a temp dir standing in for DSH_HOME ----------------- */

const home = mkdtempSync(join(tmpdir(), 'lg-team-store-'))
const services = new Map()
const ctx = {
  fiber: {},
  logger: { warn() {}, error() {} },
  get(name) {
    return services.get(name) ?? null
  },
}
services.set('dshHomePath', (...segments) => join(home, ...segments))
const statePath = join(home, 'dsh-glass-theme', 'team-state.json')

const storeHref = pathToFileURL(join(root, 'lib', 'host', 'team-store.js')).href
const routesHref = pathToFileURL(join(root, 'lib', 'host', 'routes.js')).href
const { createTeamStore, CAPS } = await import(storeHref)
const { registerRoutes } = await import(routesHref)

/* --- the store: round-trips, ordering, caps, guards -------------------- */

section('store basics')
{
  const store = createTeamStore(ctx)
  const fresh = store.snapshot()
  ok('fresh store has empty profiles', Array.isArray(fresh.profiles) && fresh.profiles.length === 0)
  ok('fresh store has empty rooms', Array.isArray(fresh.rooms) && fresh.rooms.length === 0)
  ok('fresh store carries version 1', fresh.version === 1)

  const add = store.apply('profile-add', { name: '阿耶', role: 'lead', instructions: '统筹' })
  ok('lead add is accepted', add.ok === true)
  const member = store.apply('profile-add', { name: 'Scout', role: 'member', instructions: '侦查' })
  ok('member add is accepted', member.ok === true)
  const second = store.apply('profile-add', { name: '缪斯', role: 'member' })
  ok('second member add is accepted', second.ok === true)

  const lead = store.snapshot().profiles[0]
  ok('lead sorts first', lead.role === 'lead' && lead.name === '阿耶')
  ok('member profile holds instructions', store.snapshot().profiles[1].instructions === '侦查')

  ok('state file exists under the plugin data dir', existsSync(statePath))

  /* A second instance over the same file is the restart path. */
  const reopened = createTeamStore(ctx)
  const again = reopened.snapshot()
  ok('reload round-trips three profiles', again.profiles.length === 3)
  ok('reload keeps lead first', again.profiles[0].role === 'lead')
}

section('rooms, memory, learning, checkpoints, seen')
{
  const store = createTeamStore(ctx)
  const lead = store.snapshot().profiles.find((profile) => profile.role === 'lead')
  const scout = store.snapshot().profiles.find((profile) => profile.name === 'Scout')
  const room = store.apply('room-add', { name: '侦查频道', memberIds: [lead.id, scout.id], goal: '摸清集成点' })
  ok('room add is accepted', room.ok === true)
  const roomId = store.snapshot().rooms[0].id
  ok('room holds goal', store.snapshot().rooms[0].goal === '摸清集成点')
  const update = store.apply('room-update', { id: roomId, patch: { goal: '摸清全部集成点' } })
  ok('room goal update is accepted', update.ok === true && store.snapshot().rooms[0].goal === '摸清全部集成点')

  const memory = store.apply('memory-add', { memberId: scout.id, text: '宿主会话 via sessions service' })
  ok('memory add is accepted', memory.ok === true)
  const entry = store.snapshot().memory[scout.id][0]
  const edit = store.apply('memory-edit', { memberId: scout.id, id: entry.id, text: '宿主会话 via sessions 服务' })
  ok('memory edit round-trips', edit.ok === true && store.snapshot().memory[scout.id][0].text === '宿主会话 via sessions 服务')

  const card = store.apply('learning-add', { memberId: scout.id, text: 'centerCol 被 --lg-team-width 推开' })
  ok('learning add is accepted', card.ok === true)
  const cardId = store.snapshot().learning[0].id
  ok('learning card starts pending', store.snapshot().learning[0].status === 'pending')
  const accepted = store.apply('learning-set', { id: cardId, status: 'accepted' })
  ok('learning accept moves status', accepted.ok === true && store.snapshot().learning[0].status === 'accepted')
  const dropped = store.apply('learning-add', { memberId: scout.id, text: '临时的' })
  const droppedId = store.snapshot().learning[1].id
  store.apply('learning-set', { id: droppedId, status: 'discarded' })
  ok('learning discard moves status', store.snapshot().learning[1].status === 'discarded')

  const checkpoint = store.apply('checkpoint-add', { memberId: scout.id, text: '交接：host plane 完成' })
  ok('checkpoint add is accepted', checkpoint.ok === true)

  const seen = store.apply('seen', { scope: 'session-1', seq: 7 })
  ok('seen records the scope watermark', seen.ok === true && store.snapshot().seen['session-1'] === 7)

  const side = store.apply('side-send', { memberId: scout.id, role: 'user', text: '旁聊一句' })
  ok('side chat append is accepted and generates read-only snapshot reply', side.ok === true && store.snapshot().sideChats[scout.id].length === 2 && typeof side.reply === 'string')

  /* Cascade removal: removing the member removes every trace of the member
     except history others hold — and the room survives minus the member. */
  const removed = store.apply('profile-remove', { id: scout.id })
  const after = store.snapshot()
  ok('member removal is accepted', removed.ok === true)
  ok('cascade drops member memory', after.memory[scout.id] === undefined)
  ok('cascade drops member side chat', after.sideChats[scout.id] === undefined)
  ok('cascade drops member learning cards', after.learning.every((card) => card.memberId !== scout.id))
  ok('cascade drops member checkpoints', after.checkpoints.every((card) => card.memberId !== scout.id))
  const roomAfter = after.rooms.find((candidate) => candidate.id === roomId)
  ok('cascade cleans room membership, room survives', roomAfter !== undefined && roomAfter.memberIds.includes(lead.id) && !roomAfter.memberIds.includes(scout.id))
}

section('caps and refusals')
{
  const store = createTeamStore(ctx)
  /* memory/side writes are keyed to a real profile — use one. */
  const anchor = store.apply('profile-add', { name: '压舱' })
  ok('cap anchor profile accepted', anchor.ok === true)
  const anchorId = store.snapshot().profiles[0].id

  /* Field sanitation before the cap loops — at the cap these would be
     refused for occupancy, not for content. */
  const badAvatar = store.apply('profile-add', { name: '头像测试', avatar: 'http://evil.example/face.png' })
  ok('non-data avatar is dropped', badAvatar.ok === true && store.snapshot().profiles.find((profile) => profile.name === '头像测试').avatar === '')
  const longName = store.apply('profile-add', { name: 'x'.repeat(CAPS.nameMax + 5) })
  ok('overlong name is clamped', longName.ok === true && store.snapshot().profiles.some((profile) => profile.name.length === CAPS.nameMax))

  let last = null
  for (let index = 0; index < CAPS.memoryPerMember + 10; index += 1) {
    last = store.apply('memory-add', { memberId: anchorId, text: `第 ${index} 条` })
  }
  ok(`memory caps at ${CAPS.memoryPerMember}`, last.ok === true && store.snapshot().memory[anchorId].length === CAPS.memoryPerMember)
  ok('memory prunes oldest first', store.snapshot().memory[anchorId][0].text === `第 10 条`)

  for (let index = 0; index < CAPS.sideMessages + 5; index += 1) {
    store.apply('side-send', { memberId: anchorId, role: index % 2 === 0 ? 'user' : 'assistant', text: `s${index}` })
  }
  ok(`side chat caps at ${CAPS.sideMessages}`, store.snapshot().sideChats[anchorId].length === CAPS.sideMessages)

  for (let index = store.snapshot().profiles.length; index < CAPS.profiles + 1; index += 1) {
    last = store.apply('profile-add', { name: `成员${index}` })
  }
  ok(`profiles cap at ${CAPS.profiles}`, last.ok === false && /at most/.test(String(last.error)))

  for (let index = store.snapshot().rooms.length; index < CAPS.rooms + 1; index += 1) {
    last = store.apply('room-add', { name: `房间${index}` })
  }
  ok(`rooms cap at ${CAPS.rooms}`, last.ok === false && /at most/.test(String(last.error)))

  const badKind = store.apply('no-such-kind', {})
  ok('unknown kind is refused', badKind.ok === false)
}

section('foreign version and corrupt file')
{
  /* Foreign version: the file is someone else's; read-only, never touched. */
  writeFileSync(statePath, JSON.stringify({ version: 999, profiles: [{ id: 'p1' }] }), 'utf8')
  const foreign = createTeamStore(ctx)
  ok('foreign store reads empty', foreign.snapshot().profiles.length === 0)
  const refused = foreign.apply('profile-add', { name: '不该进来' })
  ok('foreign store refuses writes', refused.ok === false && /foreign/.test(String(refused.error)))
  ok('foreign file untouched', JSON.parse(readFileSync(statePath, 'utf8')).version === 999)

  /* Corrupt file: moved aside with a .unreadable- suffix, store starts over. */
  writeFileSync(statePath, '{ this is not json', 'utf8')
  const rescued = createTeamStore(ctx)
  ok('corrupt file starts fresh', rescued.snapshot().profiles.length === 0)
  const aside = readdirSync(join(home, 'dsh-glass-theme')).filter((name) => name.startsWith('team-state.json.unreadable-'))
  ok('corrupt file moved aside', aside.length === 1)
  ok('aside keeps the broken bytes', readFileSync(join(home, 'dsh-glass-theme', aside[0]), 'utf8').includes('not json'))

  const reset = rescued.reset()
  ok('reset returns ok on a live store', reset.ok === true && rescued.snapshot().profiles.length === 0)
}

/* --- the route: the shape the browser actually sees -------------------- */

section('team route')
{
  const routes = []
  const scope = {
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    get(name) {
      return services.get(name) ?? null
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
  }
  /* One teammate session so the live fold has something to look at. */
  services.set('sessions', {
    list: () => [
      {
        id: 'session-1',
        header: { origin: 'subagent', title: 'Scout 会话' },
        seq: 3,
        snapshotEvents(from) {
          return from < 3
            ? [{ type: 'user/message', seq: 3, time: Date.now(), data: { source: { kind: 'user' }, content: [{ type: 'text', text: '@Scout 请看一下路由' }] } }]
            : []
        },
      },
    ],
  })
  registerRoutes(ctx, scope)
  const team = routes.find((route) => route.path === '/dsh-glass-theme/team')
  ok('team route is registered exact', team !== undefined && team.kind === 'exact')

  const makeRes = () => {
    const res = {
      status: 0,
      headers: null,
      body: null,
      headersSent: false,
      writeHead(status, headers) {
        res.status = status
        res.headers = headers
        res.headersSent = true
        return res
      },
      end(payload) {
        res.body = payload === undefined ? '' : payload.toString('utf8')
      },
      destroy() {},
    }
    return res
  }
  const request = {
    method: 'GET',
    headers: { host: '127.0.0.1:54188', origin: 'http://127.0.0.1:54188', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const settle = () => new Promise((done) => setTimeout(done, 40))
  const postBody = (body) => ({
    ...request,
    method: 'POST',
    on(type, fn) {
      if (type === 'data') setImmediate(() => fn(Buffer.from(JSON.stringify(body))))
      if (type === 'end') setImmediate(() => fn())
    },
  })

  /* The scout profile exists BEFORE the GET so the mention scan has a name
     to match against — mention counting is keyed to the store's roster. */
  const scoutRes = makeRes()
  team.handler(postBody({ kind: 'profile-add', name: 'Scout' }), scoutRes)
  await settle()
  ok('scout profile posted', scoutRes.status === 200 && JSON.parse(scoutRes.body).ok === true)

  const getRes = makeRes()
  team.handler({ ...request }, getRes)
  await settle()
  const getBody = JSON.parse(getRes.body)
  ok('GET answers ok', getRes.status === 200 && getBody.ok === true)
  ok('GET carries team state', getBody.team !== undefined && Array.isArray(getBody.team.profiles))
  ok('GET folds live presence', getBody.live !== undefined && Array.isArray(getBody.live.sessions) && getBody.live.sessions.length === 1)
  const liveRow = getBody.live.sessions[0]
  ok('live row is the teammate', liveRow.id === 'session-1' && liveRow.teammate === true)
  ok('recent activity reads as working', liveRow.presence === 'working')
  ok('mention counted against the store profile name', Number(getBody.live.mentions['session-1']) === 1)
  ok('unread counted from baseline', Number(getBody.live.unread['session-1']) === 1)

  const postRes = makeRes()
  team.handler(postBody({ kind: 'profile-add', name: '路由建的人' }), postRes)
  await settle()
  const postResult = JSON.parse(postRes.body)
  ok('POST mutation answers ok', postRes.status === 200 && postResult.ok === true)
  ok('POST result carries the new profile', postResult.team.profiles.some((profile) => profile.name === '路由建的人'))

  const badRes = makeRes()
  team.handler(postBody({ kind: 'profile-add' }), badRes)
  await settle()
  ok('POST without a name is 400', badRes.status === 400 && JSON.parse(badRes.body).ok === false)

  const unknownRes = makeRes()
  team.handler(postBody({ kind: 'no-such-kind' }), unknownRes)
  await settle()
  ok('POST with an unknown kind is 400', unknownRes.status === 400)

  const deleteRes = makeRes()
  team.handler({ ...request, method: 'DELETE' }, deleteRes)
  ok('DELETE is 405', deleteRes.status === 405)

  const strangerRes = makeRes()
  team.handler({ ...request, headers: { host: '127.0.0.1:54188', origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } }, strangerRes)
  ok('cross-origin POST is fenced', strangerRes.status === 403)
}

section('super-agent domain mutations and intake')
{
  const store = createTeamStore(ctx)
  const leadRes = store.apply('profile-add', { name: '主控', role: 'lead' })
  const workerRes = store.apply('profile-add', { name: '开发', role: 'member' })
  const workerId = store.snapshot().profiles.find((p) => p.name === '开发').id
  const roomRes = store.apply('room-add', { name: '功能开发室', memberIds: [workerId], goal: '实现侧边栏' })
  const roomId = store.snapshot().rooms.find((r) => r.name === '功能开发室').id

  // 1. Trigger classification & intake
  const ignoreRes = store.apply('trigger-intake', { text: '   ', threadId: roomId })
  ok('empty trigger classified as ignore', ignoreRes.ok === true && ignoreRes.ignored === true && ignoreRes.trigger.type === 'ignore')

  const observeCand = store.apply('trigger-intake', {
    requestId: 'req-obs-1',
    text: '调研一下 UI 布局方案',
    threadId: roomId,
    mode: 'observe',
  })
  ok('candidate in observe mode staged as observed ticket', observeCand.ok === true && observeCand.staged === true && observeCand.ticket.status === 'observed' && observeCand.mandate.status === 'observed')
  ok('ticket has chain of recall refs', observeCand.ticket.recallRefs && observeCand.ticket.recallRefs.mandateId === observeCand.mandate.id && observeCand.ticket.recallRefs.threadId === roomId)

  // Idempotency check with requestId
  const dupReq = store.apply('trigger-intake', {
    requestId: 'req-obs-1',
    text: '不同文本，但 requestId 相同',
    threadId: roomId,
    mode: 'observe',
  })
  ok('requestId idempotency returns cached result without duplicate ticket', dupReq.ticket.id === observeCand.ticket.id && store.snapshot().tickets.length === 1)

  // Explicit trigger with @mention in observe mode or auto mode
  const autoExp = store.apply('trigger-intake', {
    requestId: 'req-auto-1',
    text: '@开发 请实现侧边栏样式',
    threadId: roomId,
    mode: 'observe',
  })
  ok('mention trigger classified as explicit and dispatched immediately', autoExp.ok === true && autoExp.dispatched === true && autoExp.ticket.status === 'working' && autoExp.mandate.status === 'authorized')
  ok('explicit trigger assigns mentioned worker', autoExp.ticket.workerId === workerId)
  ok('worker is subscribed to thread', store.snapshot().rooms.find((r) => r.id === roomId).subscribedWorkerIds.includes(workerId))

  // 2. Thread Subscription Direct Pass-Through
  const passRes = store.apply('trigger-intake', {
    requestId: 'req-pt-1',
    text: '补充要求：保持毛玻璃圆角一致',
    threadId: roomId,
  })
  ok('subsequent trigger routes direct pass-through to active ticket', passRes.ok === true && passRes.passThrough === true && passRes.ticketId === autoExp.ticket.id)
  const activeTicketAfter = store.snapshot().tickets.find((t) => t.id === autoExp.ticket.id)
  ok('pass-through updates contextEvents', activeTicketAfter.contextEvents.some((e) => e.text.includes('补充要求')))
  ok('mandate invariance: mandate id untouched', passRes.mandateId === autoExp.mandate.id)

  // 3. Ticket approval
  const approveRes = store.apply('ticket-approve', { id: observeCand.ticket.id })
  ok('ticket approve transitions observed to working', approveRes.ok === true && approveRes.ticket.status === 'working' && approveRes.mandate.status === 'authorized')

  // 4. Context Steward auto-extraction on ticket-complete
  const completeRes = store.apply('ticket-complete', { id: autoExp.ticket.id, deliverable: '样式交付：完成 tokens 与毛玻璃类绑定' })
  ok('ticket complete transitions status to ready', completeRes.ok === true && completeRes.ticket.status === 'ready')
  ok('ticket complete synthesizes pending learning card', completeRes.learning && completeRes.learning.status === 'pending' && completeRes.learning.ticketId === autoExp.ticket.id)
  ok('ticket complete synthesizes handoff checkpoint', completeRes.checkpoint && completeRes.checkpoint.ticketId === autoExp.ticket.id)

  // 5. Watchdog check and resolve
  // Simulate retry cap stall
  store.apply('ticket-update', { id: observeCand.ticket.id, patch: { retryCount: 3 } })
  const wdCheck = store.apply('watchdog-check', { stallThresholdMs: 60000 })
  ok('watchdog flags ticket with retry cap >= 3 as stalled', wdCheck.ok === true && wdCheck.flagged.some((t) => t.id === observeCand.ticket.id && t.watchdogReason === 'retry_cap'))

  const wdRetry = store.apply('watchdog-resolve', { id: observeCand.ticket.id, action: 'retry' })
  ok('watchdog resolve retry resets status to working and retryCount to 0', wdRetry.ok === true && wdRetry.ticket.status === 'working' && wdRetry.ticket.retryCount === 0)

  const wdDismiss = store.apply('watchdog-resolve', { id: observeCand.ticket.id, action: 'dismiss' })
  ok('watchdog resolve dismiss sets status to merged', wdDismiss.ok === true && wdDismiss.ticket.status === 'merged')
}

rmSync(home, { recursive: true, force: true })
console.log(`\n${failures === 0 ? 'ok' : 'FAIL'} — ${checks - failures}/${checks} assertions hold`)
process.exit(failures === 0 ? 0 : 1)
