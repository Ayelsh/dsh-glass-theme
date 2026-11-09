/**
 * Team sidebar — the team panel living inside the app sidebar.
 *
 * The team UI registers into the sidebar's own surfaces, the way the app's
 * built-in panels do: a `sidebar.workspaces` slot entry renders the roster
 * (Lead first, then members) and the rooms in place of the session list, and
 * a `sidebar.footer.action` entry provides the 收纳/展开 toggle. Expanding
 * sets `data-lg-team-open="true"` on the document element; the team
 * stylesheet replaces the session browser with the team root while the
 * attribute holds, and gives the sidebar its content back the moment it
 * clears. Facts come from the host route /dsh-glass-theme/team, which folds
 * the harness sessions service into presence, unread and mention counts;
 * user state lives in the host team store. Every surface degrades to a hint
 * when the harness gives it nothing to read.
 *
 * Spliced into lib/client.js by tools/build.mjs; edit here, never there.
 */
function createTeam(require, ctx, catalog, shared, prefs) {
	const React = require('react');
	const ROUTE = '/dsh-glass-theme/team';
	const POLL_MS = 2500;
	const PANEL_ID = 'lg-team';
	const FEATURES_ALL = ['palette', 'memory', 'sideChat', 'handoff'];

	const state = {
		team: null,
		live: null,
		menu: null,
		palette: null,
		panel: null,
		panelEdit: null,
		newBox: null,
		confirm: null,
		expandedTickets: {},
		failed: 0,
	};
	let root = null;
	let timer = 0;
	let keyHandler = null;
	let stopPrefs = null;
	let stopped = true;

	/* --- tiny DOM helpers ------------------------------------------------- */

	const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
	const el = (tag, cls, text) => {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined && text !== null) node.textContent = text;
		return node;
	};
	const fmtTime = (ms) => {
		if (!Number.isFinite(ms) || ms <= 0) return '';
		try {
			const date = new Date(ms);
			const pad = (n) => String(n).padStart(2, '0');
			return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
		} catch {
			return '';
		}
	};

	/* --- identity ----------------------------------------------------------
	 * Deterministic identicon: FNV-1a over the id seeds a hue and a 5×5
	 * symmetric pixel field. Same id, same face — no avatar file needed. */

	const hashOf = (text) => {
		let hash = 0x811c9dc5;
		const source = String(text ?? '');
		for (let at = 0; at < source.length; at += 1) {
			hash ^= source.charCodeAt(at);
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
		return hash >>> 0;
	};
	const identicon = (id, cls) => {
		const seed = hashOf(id);
		const hue = seed % 360;
		const cells = [];
		for (let y = 0; y < 5; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				const bit = (hashOf(`${id}:${x}:${y}`) >>> 7) & 1;
				if (bit) {
					cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
					if (x < 2) cells.push(`<rect x="${4 - x}" y="${y}" width="1" height="1"/>`);
				}
			}
		}
		return `<svg class="${cls || 'lg-team-identicon'}" viewBox="0 0 5 5" role="img" aria-hidden="true" style="color:hsl(${hue} 62% 58%)"><rect x="0" y="0" width="5" height="5" fill="currentColor" opacity="0.14"/><g fill="currentColor">${cells.join('')}</g></svg>`;
	};
	const avatarHtml = (profile, cls) => {
		if (profile && typeof profile.avatar === 'string' && profile.avatar.startsWith('data:image/')) {
			return `<img class="${cls || 'lg-team-avatar'}" src="${esc(profile.avatar)}" alt="" draggable="false"/>`;
		}
		return identicon(profile ? profile.id : '?', cls || 'lg-team-avatar');
	};

	/* --- preferences ------------------------------------------------------
	 * The host entry is the source of truth; the browser mirror exists only
	 * so the column paints the right shape before the host speaks. While the
	 * host value is undefined (settings service not loaded yet), the mirror
	 * answers; the moment the host value arrives it wins and the mirror is
	 * corrected to match. The first such correction also plants a one-time
	 * flag, the skin-preferences migration pattern. */

	const MIRROR_KEY = 'dsh-glass-theme:team';
	const MIRROR_MIGRATED_KEY = 'dsh-glass-theme:team-reconciled';
	const storage = () => {
		try {
			return typeof localStorage !== 'undefined' ? localStorage : null;
		} catch {
			return null;
		}
	};
	const mirrorRead = () => {
		const store = storage();
		if (!store || typeof store.getItem !== 'function') return {};
		try {
			const raw = store.getItem(MIRROR_KEY);
			const doc = raw === null || raw === '' ? null : JSON.parse(raw);
			return doc !== null && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
		} catch {
			return {};
		}
	};
	const mirrorWrite = (patch) => {
		const store = storage();
		if (!store || typeof store.setItem !== 'function') return;
		try {
			store.setItem(MIRROR_KEY, JSON.stringify({ ...mirrorRead(), ...patch }));
		} catch {}
	};
	let optimistic = null;
	const prefRaw = (field) => {
		const host = prefs && typeof prefs.get === 'function' ? prefs.get(field) : undefined;
		/* A click must land on screen in the same interaction — not one host
		 * round trip later. The optimistic value holds the intent and is
		 * dropped the moment the host echo agrees with it. */
		if (optimistic !== null && Object.prototype.hasOwnProperty.call(optimistic, field)) {
			if (host === optimistic[field]) {
				delete optimistic[field];
				if (Object.keys(optimistic).length === 0) optimistic = null;
			} else {
				return optimistic[field];
			}
		}
		return host;
	};
	const reconcileMirror = () => {
		const enabled = prefRaw('teamSidebar');
		const collapsed = prefRaw('teamCollapsed');
		const autonomyMode = prefRaw('teamAutonomyMode');
		const watchdog = prefRaw('teamWatchdog');
		const patch = {};
		if (enabled !== undefined) patch.enabled = enabled !== false;
		if (collapsed !== undefined) patch.collapsed = collapsed === true;
		if (autonomyMode !== undefined) patch.autonomyMode = autonomyMode;
		if (watchdog !== undefined) patch.watchdog = watchdog !== false;
		if (Object.keys(patch).length > 0) mirrorWrite(patch);
		try {
			const store = storage();
			if (store && typeof store.setItem === 'function' && store.getItem(MIRROR_MIGRATED_KEY) !== '1') {
				store.setItem(MIRROR_MIGRATED_KEY, '1');
			}
		} catch {}
	};
	const watchPrefs = () => {
		if (!prefs || typeof prefs.subscribe !== 'function') return () => {};
		return prefs.subscribe(() => reconcileMirror());
	};

	const featureSet = () => {
		const list = prefRaw('teamFeatures');
		const wanted = Array.isArray(list) && list.length > 0 ? list : FEATURES_ALL;
		return new Set(wanted.filter((name) => FEATURES_ALL.includes(name)));
	};
	const hasFeature = (name) => featureSet().has(name);
	const enabledPref = () => {
		const host = prefRaw('teamSidebar');
		if (host !== undefined) return host !== false;
		return mirrorRead().enabled !== false;
	};
	const collapsedPref = () => {
		const host = prefRaw('teamCollapsed');
		if (host !== undefined) return host === true;
		const mirror = mirrorRead();
		if (typeof mirror.collapsed === 'boolean') return mirror.collapsed;
		return true; /* no recorded choice: stow by default so sessions paint first */
	};
	const autonomyModePref = () => {
		const host = prefRaw('teamAutonomyMode');
		if (host === 'auto' || host === 'observe') return host;
		const mirror = mirrorRead();
		if (mirror.autonomyMode === 'auto' || mirror.autonomyMode === 'observe') return mirror.autonomyMode;
		return 'observe';
	};
	const watchdogPref = () => {
		const host = prefRaw('teamWatchdog');
		if (host !== undefined) return host !== false;
		const mirror = mirrorRead();
		if (typeof mirror.watchdog === 'boolean') return mirror.watchdog;
		return true;
	};
	const toggleAutonomyMode = () => {
		const next = autonomyModePref() === 'observe' ? 'auto' : 'observe';
		mirrorWrite({ autonomyMode: next });
		optimistic = { ...(optimistic ?? {}), teamAutonomyMode: next };
		if (prefs && typeof prefs.write === 'function') void prefs.write('teamAutonomyMode', next);
		renderAll();
	};

	/* --- layout -----------------------------------------------------------
	 * Open state is one document-level attribute: `data-lg-team-open` on the
	 * document element. The team stylesheet pairs it with the app sidebar's
	 * region area — while it holds, the session browser yields and the team
	 * root fills the region; the moment it clears, the sidebar's own content
	 * comes back. No geometry is owned here: the sidebar keeps its width,
	 * its collapse button, everything. */

	const syncOpen = () => {
		const open = !stopped && enabledPref() && !collapsedPref();
		try {
			if (open) document.documentElement.setAttribute('data-lg-team-open', 'true');
			else document.documentElement.removeAttribute('data-lg-team-open');
		} catch {}
		if (root !== null) {
			root.dataset.collapsed = collapsedPref() ? 'true' : 'false';
			root.hidden = stopped || !enabledPref();
		}
		if (open) {
			slotsHandle.mountRegion();
		} else {
			slotsHandle.unmountRegion();
		}
	};

	/* --- data ------------------------------------------------------------- */

	const fetchTeam = async () => {
		const answer = await fetch(ROUTE, { method: 'GET', headers: { accept: 'application/json' } });
		if (!answer || answer.ok !== true) throw new Error(`team route answered ${answer ? answer.status : 'nothing'}`);
		const body = await answer.json();
		if (body === null || typeof body !== 'object' || body.ok !== true) throw new Error('team route refused the read');
		state.team = body.team !== null && typeof body.team === 'object' ? body.team : null;
		state.live = body.live !== null && typeof body.live === 'object' ? body.live : null;
		state.failed = 0;
	};
	const postTeam = async (kind, payload) => {
		const answer = await fetch(ROUTE, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ kind, ...(payload || {}) }),
		});
		if (!answer || answer.ok !== true) return null;
		const body = await answer.json();
		if (body === null || typeof body !== 'object' || body.ok !== true) return null;
		if (body.team !== null && typeof body.team === 'object') state.team = body.team;
		return body.team;
	};
	const liveRow = (sessionId) => {
		const rows = state.live && Array.isArray(state.live.sessions) ? state.live.sessions : [];
		return rows.find((row) => row.id === sessionId) || null;
	};
	const sessionTitle = (sessionId) => {
		const row = liveRow(sessionId);
		return row && typeof row.title === 'string' ? row.title.trim() : '';
	};
	const memberById = (id) => {
		const profiles = state.team && Array.isArray(state.team.profiles) ? state.team.profiles : [];
		return profiles.find((profile) => profile.id === id) || null;
	};
	const roomById = (id) => {
		const rooms = state.team && Array.isArray(state.team.rooms) ? state.team.rooms : [];
		return rooms.find((room) => room.id === id) || null;
	};
	const scopeCounts = (sessionId) => {
		if (!sessionId) return { unread: 0, mentions: 0 };
		const unread = state.live && state.live.unread ? Number(state.live.unread[sessionId]) || 0 : 0;
		const mentions = state.live && state.live.mentions ? Number(state.live.mentions[sessionId]) || 0 : 0;
		return { unread, mentions };
	};
	const currentSessionId = () => {
		try {
			const ui = ctx.get('uiSession');
			const current = ui && ui.current ? ui.current : null;
			const value = current && typeof current.get === 'function' ? current.get().value : current && current.value !== undefined ? current.value : current;
			if (value === null || value === undefined) return '';
			if (typeof value === 'string') return value;
			return String(value.key ?? value.sessionId ?? (value.live && value.live.current) ?? '');
		} catch {
			return '';
		}
	};
	const markSeen = async (sessionId) => {
		if (!sessionId) return;
		const row = liveRow(sessionId);
		if (row === null) return;
		await postTeam('seen', { scope: sessionId, seq: row.seq });
	};
	const autoSeen = () => {
		const focused = currentSessionId();
		if (!focused || !state.live) return;
		const scopes = new Set();
		for (const room of state.team?.rooms ?? []) if (room.sessionId) scopes.add(room.sessionId);
		for (const profile of state.team?.profiles ?? []) if (profile.sessionId) scopes.add(profile.sessionId);
		if (scopes.has(focused)) {
			const counts = scopeCounts(focused);
			if (counts.unread > 0 || counts.mentions > 0) void markSeen(focused);
		}
	};

	/* --- focus a conversation ----------------------------------------------
	 * The app's session rows are DOM; matching by title keeps the skin
	 * read-only. No match, ambiguous or blank title: stay put — the column
	 * never guesses its way into the wrong conversation. */

	const focusSession = (sessionId) => {
		const title = sessionTitle(sessionId);
		if (title === '') return false;
		let rows = [];
		try {
			rows = [...document.querySelectorAll("[class*='sessionRow']")];
		} catch {
			return false;
		}
		const hits = rows.filter((row) => typeof row.textContent === 'string' && row.textContent.includes(title));
		if (hits.length !== 1) return false;
		try {
			hits[0].click();
			void markSeen(sessionId);
			return true;
		} catch {
			return false;
		}
	};

	/* --- overlays --------------------------------------------------------- */

	const closeMenu = (info) => {
		if (state.menu === null) return;
		const menu = state.menu;
		state.menu = null;
		try {
			menu.handle.dispose({ focus: info && info.reason === 'outside' ? false : undefined });
		} catch {}
		if (menu.node && menu.node.parentElement) menu.node.parentElement.removeChild(menu.node);
	};
	const openMenu = (items, x, y, surface) => {
		closeMenu({});
		if (!items || items.length === 0) return;
		const node = el('div', 'lg-team-menu');
		node.setAttribute('role', 'menu');
		for (const item of items) {
			const row = el('button', `lg-team-menuItem${item.disabled ? ' is-disabled' : ''}${item.danger ? ' is-danger' : ''}`);
			row.type = 'button';
			row.setAttribute('role', 'menuitem');
			row.textContent = item.label;
			if (item.hint) {
				const hint = el('span', 'lg-team-menuHint', item.hint);
				row.appendChild(hint);
			}
			if (!item.disabled && typeof item.run === 'function') {
				row.addEventListener('click', () => {
					closeMenu({});
					item.run();
				});
			}
			node.appendChild(row);
		}
		node.style.left = `${Math.round(x)}px`;
		node.style.top = `${Math.round(y)}px`;
		document.body.appendChild(node);
		let handle = null;
		try {
			handle = shared.layers.acquire({
				owner: 'lg-team',
				kind: 'nonmodal',
				surface: node,
				onDismiss: (info) => closeMenu(info),
			});
		} catch {
			handle = null;
		}
		state.menu = { node, handle };
	};

	const closePalette = (info) => {
		if (state.palette === null) return;
		const palette = state.palette;
		state.palette = null;
		try {
			palette.handle.dispose({ focus: info && info.reason === 'outside' ? false : undefined });
		} catch {}
		if (palette.node && palette.node.parentElement) palette.node.parentElement.removeChild(palette.node);
	};
	const paletteEntries = () => {
		const entries = [];
		const team = state.team || { profiles: [], rooms: [] };
		for (const profile of team.profiles ?? []) {
			entries.push({ kind: 'member', id: profile.id, label: profile.name, caption: profile.role === 'lead' ? '主控' : '成员', keywords: 'member 成员' });
		}
		for (const room of team.rooms ?? []) {
			entries.push({ kind: 'room', id: room.id, label: room.name, caption: room.goal || '房间', keywords: 'room 房间' });
		}
		for (const name of FEATURES_ALL) {
			const labels = { palette: '命令面板', memory: '记忆面板', sideChat: '旁聊', handoff: '交接检查点' };
			entries.push({ kind: 'feature', id: name, label: `功能：${labels[name] || name}`, caption: hasFeature(name) ? '已启用' : '已停用', keywords: 'feature 功能' });
		}
		entries.push({ kind: 'collapse', id: collapsedPref() ? 'expand' : 'collapse', label: collapsedPref() ? '展开团队面板' : '收纳团队面板', caption: collapsedPref() ? '回到会话列表' : '替换侧栏内容', keywords: 'collapse 收纳 折叠 展开' });
		return entries;
	};
	const paletteMatches = (query, entry) => {
		const hay = `${entry.label} ${entry.caption} ${entry.keywords}`.toLowerCase();
		return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
	};
	const runPalette = (entry) => {
		if (entry.kind === 'member') openPanel('member', entry.id);
		else if (entry.kind === 'room') {
			const room = roomById(entry.id);
			if (room && room.sessionId) focusSession(room.sessionId);
		} else if (entry.kind === 'feature') toggleFeature(entry.id);
		else if (entry.kind === 'collapse') toggleCollapsed();
	};
	const renderPaletteList = (palette) => {
		const query = palette.input ? String(palette.input.value ?? '') : '';
		const hits = paletteEntries().filter((entry) => paletteMatches(query, entry)).slice(0, 9);
		palette.hits = hits;
		palette.active = Math.min(palette.active, Math.max(0, hits.length - 1));
		const list = palette.list;
		if (!list) return;
		list.innerHTML = '';
		if (hits.length === 0) {
			const empty = el('div', 'lg-team-paletteEmpty', '没有匹配项');
			list.appendChild(empty);
			return;
		}
		hits.forEach((entry, at) => {
			const row = el('button', `lg-team-paletteItem${at === palette.active ? ' is-active' : ''}`);
			row.type = 'button';
			const name = el('span', 'lg-team-paletteLabel', entry.label);
			const caption = el('span', 'lg-team-paletteCaption', entry.caption);
			row.appendChild(name);
			row.appendChild(caption);
			row.addEventListener('click', () => {
				closePalette({});
				runPalette(entry);
			});
			list.appendChild(row);
		});
	};
	const openPalette = () => {
		closePalette({});
		const node = el('div', 'lg-team-palette');
		node.setAttribute('role', 'dialog');
		node.setAttribute('aria-label', '团队命令面板');
		const input = el('input', 'lg-team-paletteInput');
		input.type = 'text';
		input.placeholder = '搜索成员、房间、功能…';
		const list = el('div', 'lg-team-paletteList');
		node.appendChild(input);
		node.appendChild(list);
		document.body.appendChild(node);
		const palette = { node, input, list, active: 0, hits: [] };
		let handle = null;
		try {
			handle = shared.layers.acquire({
				owner: 'lg-team',
				kind: 'nonmodal',
				surface: node,
				onDismiss: (info) => closePalette(info),
			});
		} catch {
			handle = null;
		}
		palette.handle = handle;
		input.addEventListener('input', () => {
			palette.active = 0;
			renderPaletteList(palette);
		});
		input.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				palette.active = Math.min(palette.active + 1, Math.max(0, palette.hits.length - 1));
				renderPaletteList(palette);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				palette.active = Math.max(palette.active - 1, 0);
				renderPaletteList(palette);
			} else if (event.key === 'Enter') {
				event.preventDefault();
				const entry = palette.hits[palette.active];
				if (entry) {
					closePalette({});
					runPalette(entry);
				}
			}
		});
		state.palette = palette;
		renderPaletteList(palette);
		try {
			input.focus();
		} catch {}
	};

	/* --- member panel ------------------------------------------------------ */

	const closePanel = () => {
		state.panel = null;
		state.panelEdit = null;
		if (root !== null) {
			const panel = root.querySelector('.lg-team-panel');
			if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
		}
	};
	const sideMessages = (memberId) => {
		const chats = state.team && state.team.sideChats && typeof state.team.sideChats === 'object' ? state.team.sideChats : {};
		return Array.isArray(chats[memberId]) ? chats[memberId] : [];
	};
	const memoryEntries = (memberId) => {
		const memory = state.team && state.team.memory && typeof state.team.memory === 'object' ? state.team.memory : {};
		return Array.isArray(memory[memberId]) ? memory[memberId] : [];
	};
	const renderPanel = () => {
		if (root === null) return;
		const old = root.querySelector('.lg-team-panel');
		const panel = state.panel;
		if (panel === null || panel.kind !== 'member') {
			if (old && old.parentElement) old.parentElement.removeChild(old);
			return;
		}
		const member = memberById(panel.id);
		if (member === null) {
			closePanel();
			return;
		}

		/* Preserve pending draft inputs and focus if re-rendering for the same member */
		const draftValues = {};
		let focusedKey = null;
		let selStart = null;
		let selEnd = null;
		if (old !== null && old.dataset.panelId === member.id) {
			const inputs = old.querySelectorAll('[data-panel-input]');
			for (const input of inputs) {
				const key = input.dataset.panelInput;
				if (key && input.value) draftValues[key] = input.value;
				if (document.activeElement === input) {
					focusedKey = key;
					try {
						selStart = input.selectionStart;
						selEnd = input.selectionEnd;
					} catch {}
				}
			}
		}

		if (old && old.parentElement) old.parentElement.removeChild(old);
		const node = el('aside', 'lg-team-panel');
		node.dataset.panelId = member.id;
		const head = el('header', 'lg-team-panelHead');
		head.appendChild(el('h3', 'lg-team-panelTitle', member.name));
		const close = el('button', 'lg-team-btn', '×');
		close.type = 'button';
		close.setAttribute('aria-label', '关闭面板');
		close.dataset.action = 'panel-close';
		head.appendChild(close);
		node.appendChild(head);

		const team = state.team || {};
		const learning = (Array.isArray(team.learning) ? team.learning : []).filter((card) => card.memberId === member.id && card.status === 'pending');
		const checkpoints = (Array.isArray(team.checkpoints) ? team.checkpoints : []).filter((card) => card.memberId === member.id || card.memberId === '');
		const memory = memoryEntries(member.id);
		const side = sideMessages(member.id);
		const tickets = (Array.isArray(team.tickets) ? team.tickets : []).filter((t) => t.workerId === member.id || t.workerId === '');

		if (tickets.length > 0) {
			const section = el('section', 'lg-team-section lg-team-recallSection');
			section.appendChild(el('h4', 'lg-team-label', '工单 / 召回 (Chain of Recall)'));
			const list = el('div', 'lg-team-ticketList');
			for (const t of tickets) {
				const item = el('div', `lg-team-card lg-team-ticketCard is-${t.status}`);
				item.dataset.ticketId = t.id;
				const header = el('div', 'lg-team-cardHeader');
				header.appendChild(el('span', 'lg-team-ticketTitle', t.title));
				const statusBadge = el('span', `lg-team-badge lg-team-statusBadge is-${t.status}`, t.status);
				header.appendChild(statusBadge);
				item.appendChild(header);

				if (t.summary) {
					item.appendChild(el('p', 'lg-team-ticketSummary', t.summary));
				}

				if (t.recallRefs) {
					const refsRow = el('div', 'lg-team-chips lg-team-recallRefs');
					if (t.recallRefs.mandateId) refsRow.appendChild(el('span', 'lg-team-chip', `授权: ${t.recallRefs.mandateId}`));
					if (t.recallRefs.threadId) refsRow.appendChild(el('span', 'lg-team-chip', `线程: ${t.recallRefs.threadId}`));
					if (Array.isArray(t.recallRefs.triggerIds) && t.recallRefs.triggerIds.length > 0) {
						refsRow.appendChild(el('span', 'lg-team-chip', `触发: ${t.recallRefs.triggerIds.length} 次`));
					}
					item.appendChild(refsRow);
				}

				const isExpanded = state.expandedTickets && state.expandedTickets[t.id];
				const toggleSpill = el('button', 'lg-team-btn lg-team-btnXs', isExpanded ? '收起详情 (Spill)' : '展开详情 (Spill)');
				toggleSpill.type = 'button';
				toggleSpill.dataset.action = 'ticket-spill-toggle';
				toggleSpill.dataset.arg = t.id;
				item.appendChild(toggleSpill);

				if (isExpanded) {
					const spillBox = el('div', 'lg-team-spillDetails');
					const detailsText = t.spill && typeof t.spill === 'object' ? (t.spill.details || JSON.stringify(t.spill)) : String(t.spill || t.summary || '');
					spillBox.appendChild(el('pre', 'lg-team-pre', detailsText));
					item.appendChild(spillBox);
				}

				const actRow = el('div', 'lg-team-cardRow');
				if (t.status === 'observed') {
					const appBtn = el('button', 'lg-team-btn', '批准');
					appBtn.type = 'button';
					appBtn.dataset.action = 'ticket-approve';
					appBtn.dataset.arg = t.id;
					actRow.appendChild(appBtn);
				}
				if (t.status === 'stalled') {
					const retryBtn = el('button', 'lg-team-btn', '重试');
					retryBtn.type = 'button';
					retryBtn.dataset.action = 'watchdog-retry';
					retryBtn.dataset.arg = t.id;
					const dismissBtn = el('button', 'lg-team-btn', '忽略');
					dismissBtn.type = 'button';
					dismissBtn.dataset.action = 'watchdog-dismiss';
					dismissBtn.dataset.arg = t.id;
					actRow.appendChild(retryBtn);
					actRow.appendChild(dismissBtn);
				}
				if (actRow.childNodes.length > 0) item.appendChild(actRow);

				list.appendChild(item);
			}
			section.appendChild(list);
			node.appendChild(section);
		}

		if (hasFeature('memory') && learning.length > 0) {
			const section = el('section', 'lg-team-section');
			section.appendChild(el('h4', 'lg-team-label', '学习卡片'));
			for (const card of learning) {
				const box = el('div', 'lg-team-card');
				box.appendChild(el('p', 'lg-team-cardText', card.text));
				const row = el('div', 'lg-team-cardRow');
				const yes = el('button', 'lg-team-btn', '采纳');
				yes.type = 'button';
				yes.dataset.action = 'learning-accept';
				yes.dataset.arg = card.id;
				const no = el('button', 'lg-team-btn', '丢弃');
				no.type = 'button';
				no.dataset.action = 'learning-discard';
				no.dataset.arg = card.id;
				row.appendChild(yes);
				row.appendChild(no);
				box.appendChild(row);
				section.appendChild(box);
			}
			node.appendChild(section);
		}

		if (hasFeature('memory')) {
			const section = el('section', 'lg-team-section');
			section.appendChild(el('h4', 'lg-team-label', '记忆'));
			const list = el('div', 'lg-team-memList');
			if (memory.length === 0) list.appendChild(el('p', 'lg-team-empty', '还没有记忆条目'));
			for (const entry of memory) {
				const item = el('div', 'lg-team-memItem');
				const pair = `${member.id}:${entry.id}`;
				if (state.panelEdit !== null && state.panelEdit.memberId === member.id && state.panelEdit.entryId === entry.id) {
					const editInput = el('input', 'lg-team-composerInput');
					editInput.type = 'text';
					editInput.value = draftValues['memory-edit'] !== undefined ? draftValues['memory-edit'] : entry.text;
					editInput.dataset.panelInput = 'memory-edit';
					item.appendChild(editInput);
					const row = el('div', 'lg-team-cardRow');
					const save = el('button', 'lg-team-btn', '保存');
					save.type = 'button';
					save.dataset.action = 'memory-edit-save';
					save.dataset.arg = pair;
					const cancel = el('button', 'lg-team-btn', '取消');
					cancel.type = 'button';
					cancel.dataset.action = 'memory-edit-cancel';
					editInput.addEventListener('keydown', (e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							save.click();
						} else if (e.key === 'Escape') {
							e.preventDefault();
							cancel.click();
						}
					});
					row.appendChild(save);
					row.appendChild(cancel);
					item.appendChild(row);
				} else {
					item.appendChild(el('p', 'lg-team-memText', entry.text));
					const row = el('div', 'lg-team-cardRow');
					const edit = el('button', 'lg-team-btn', '编辑');
					edit.type = 'button';
					edit.dataset.action = 'memory-edit-start';
					edit.dataset.arg = pair;
					const remove = el('button', 'lg-team-btn', '移除');
					remove.type = 'button';
					remove.dataset.action = 'memory-remove';
					remove.dataset.arg = pair;
					row.appendChild(edit);
					row.appendChild(remove);
					item.appendChild(row);
				}
				list.appendChild(item);
			}
			section.appendChild(list);
			const composer = el('div', 'lg-team-composer');
			const input = el('input', 'lg-team-composerInput');
			input.type = 'text';
			input.placeholder = '为这位成员记一条…';
			input.dataset.panelInput = 'memory';
			if (draftValues['memory']) input.value = draftValues['memory'];
			const add = el('button', 'lg-team-btn', '添加');
			add.type = 'button';
			add.dataset.action = 'memory-add';
			add.dataset.arg = member.id;
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					add.click();
				}
			});
			composer.appendChild(input);
			composer.appendChild(add);
			section.appendChild(composer);
			node.appendChild(section);
		}

		if (hasFeature('sideChat')) {
			const section = el('section', 'lg-team-section');
			section.appendChild(el('h4', 'lg-team-label', '旁聊'));
			const log = el('div', 'lg-team-sideLog');
			if (side.length === 0) log.appendChild(el('p', 'lg-team-empty', '旁聊只写自己的记录，不进入主对话'));
			for (const message of side) {
				const line = el('div', `lg-team-sideMsg is-${message.role === 'assistant' ? 'them' : 'me'}`);
				line.appendChild(el('span', 'lg-team-sideTime', fmtTime(message.time)));
				line.appendChild(el('p', 'lg-team-sideText', message.text));
				log.appendChild(line);
			}
			section.appendChild(log);
			const composer = el('div', 'lg-team-composer');
			const input = el('input', 'lg-team-composerInput');
			input.type = 'text';
			input.placeholder = '对这位成员说…';
			input.dataset.panelInput = 'side';
			if (draftValues['side']) input.value = draftValues['side'];
			const send = el('button', 'lg-team-btn', '发送');
			send.type = 'button';
			send.dataset.action = 'side-send';
			send.dataset.arg = member.id;
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					send.click();
				}
			});
			composer.appendChild(input);
			composer.appendChild(send);
			section.appendChild(composer);
			node.appendChild(section);
		}

		if (hasFeature('handoff')) {
			const section = el('section', 'lg-team-section');
			section.appendChild(el('h4', 'lg-team-label', '交接检查点'));
			const list = el('div', 'lg-team-ckptList');
			if (checkpoints.length === 0) list.appendChild(el('p', 'lg-team-empty', '没有待交接的检查点'));
			for (const card of checkpoints) {
				const item = el('div', 'lg-team-card');
				item.appendChild(el('p', 'lg-team-cardText', card.text));
				const row = el('div', 'lg-team-cardRow');
				const dismiss = el('button', 'lg-team-btn', '完成');
				dismiss.type = 'button';
				dismiss.dataset.action = 'checkpoint-remove';
				dismiss.dataset.arg = card.id;
				row.appendChild(dismiss);
				item.appendChild(row);
				list.appendChild(item);
			}
			section.appendChild(list);
			const composer = el('div', 'lg-team-composer');
			const input = el('input', 'lg-team-composerInput');
			input.type = 'text';
			input.placeholder = '手动记一条交接说明…';
			input.dataset.panelInput = 'checkpoint';
			if (draftValues['checkpoint']) input.value = draftValues['checkpoint'];
			const add = el('button', 'lg-team-btn', '记录');
			add.type = 'button';
			add.dataset.action = 'checkpoint-add';
			add.dataset.arg = member.id;
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					add.click();
				}
			});
			composer.appendChild(input);
			composer.appendChild(add);
			section.appendChild(composer);
			node.appendChild(section);
		}
		root.appendChild(node);

		if (focusedKey) {
			try {
				const active = node.querySelector(`[data-panel-input='${focusedKey}']`);
				if (active) {
					active.focus();
					if (selStart !== null && selEnd !== null) active.setSelectionRange(selStart, selEnd);
				}
			} catch {}
		}
	};

	/* --- new-member / new-room box ----------------------------------------- */

	const closeNewBox = () => {
		state.newBox = null;
		if (root !== null) {
			const box = root.querySelector('.lg-team-newBox');
			if (box && box.parentElement) box.parentElement.removeChild(box);
		}
	};
	const renderNewBox = () => {
		if (root === null) return;
		const old = root.querySelector('.lg-team-newBox');
		const box = state.newBox;
		if (box === null) {
			if (old && old.parentElement) old.parentElement.removeChild(old);
			return;
		}
		/* If already open for the same kind and target id, do not replace the DOM so user input and focus are never interrupted */
		if (old !== null && old.dataset.kind === box.kind && (box.id === undefined || old.dataset.id === box.id)) return;
		if (old && old.parentElement) old.parentElement.removeChild(old);
		const node = el('div', 'lg-team-newBox');
		node.dataset.kind = box.kind;
		if (box.id) node.dataset.id = box.id;

		if (box.kind === 'member' || box.kind === 'rename-member') {
			const profile = box.kind === 'rename-member' ? memberById(box.id) : null;
			node.appendChild(el('h4', 'lg-team-label', box.kind === 'member' ? '新建成员' : `编辑成员: ${profile ? profile.name : ''}`));
			const name = el('input', 'lg-team-newInput');
			name.type = 'text';
			name.placeholder = '成员名称';
			name.dataset.newInput = 'name';
			if (profile) name.value = profile.name;
			node.appendChild(name);

			const role = el('select', 'lg-team-newInput');
			role.dataset.newInput = 'role';
			const optMember = el('option', null, '成员');
			optMember.value = 'member';
			const optLead = el('option', null, '主控');
			optLead.value = 'lead';
			role.appendChild(optMember);
			role.appendChild(optLead);
			if (profile) role.value = profile.role || 'member';
			node.appendChild(role);

			const instructions = el('textarea', 'lg-team-newInput');
			instructions.rows = 2;
			instructions.placeholder = '职责说明（可空）';
			instructions.dataset.newInput = 'instructions';
			if (profile) instructions.value = profile.instructions || '';
			node.appendChild(instructions);
			if (box.kind === 'member' && box.spawn && box.spawn.hint) node.appendChild(el('p', 'lg-team-hint', box.spawn.hint));

			const row = el('div', 'lg-team-cardRow');
			const submit = el('button', 'lg-team-btn', box.kind === 'member' ? '创建' : '保存');
			submit.type = 'button';
			submit.dataset.action = box.kind === 'member' ? 'member-create' : 'member-update';
			const cancel = el('button', 'lg-team-btn', '取消');
			cancel.type = 'button';
			cancel.dataset.action = 'newbox-close';
			row.appendChild(submit);
			row.appendChild(cancel);
			node.appendChild(row);
		} else if (box.kind === 'room' || box.kind === 'rename-room') {
			const room = box.kind === 'rename-room' ? roomById(box.id) : null;
			node.appendChild(el('h4', 'lg-team-label', box.kind === 'room' ? '新建房间' : `编辑房间: ${room ? room.name : ''}`));
			const name = el('input', 'lg-team-newInput');
			name.type = 'text';
			name.placeholder = '房间名称';
			name.dataset.newInput = 'name';
			if (room) name.value = room.name;
			node.appendChild(name);

			const goal = el('input', 'lg-team-newInput');
			goal.type = 'text';
			goal.placeholder = '房间目标（可空）';
			goal.dataset.newInput = 'goal';
			if (room) goal.value = room.goal || '';
			node.appendChild(goal);

			if (box.kind === 'rename-room') {
				node.appendChild(el('h5', 'lg-team-label', '订阅成员'));
				const chipsContainer = el('div', 'lg-team-chips lg-team-chipsSelect');
				const profiles = state.team && Array.isArray(state.team.profiles) ? state.team.profiles : [];
				for (const p of profiles) {
					const isSubscribed = room && Array.isArray(room.memberIds) && room.memberIds.includes(p.id);
					const chip = el('button', 'lg-team-chip' + (isSubscribed ? ' is-selected' : ''), p.name);
					chip.type = 'button';
					chip.dataset.action = 'room-chip-toggle';
					chip.dataset.memberId = p.id;
					chip.setAttribute('aria-pressed', isSubscribed ? 'true' : 'false');
					chipsContainer.appendChild(chip);
				}
				node.appendChild(chipsContainer);
			}

			const row = el('div', 'lg-team-cardRow');
			const submit = el('button', 'lg-team-btn', box.kind === 'room' ? '创建' : '保存');
			submit.type = 'button';
			submit.dataset.action = box.kind === 'room' ? 'room-create' : 'room-update';
			const cancel = el('button', 'lg-team-btn', '取消');
			cancel.type = 'button';
			cancel.dataset.action = 'newbox-close';
			row.appendChild(submit);
			row.appendChild(cancel);
			node.appendChild(row);
		} else if (box.kind === 'ticket') {
			const profile = memberById(box.workerId);
			node.appendChild(el('h4', 'lg-team-label', `派发工单给: ${profile ? profile.name : '成员'}`));
			const titleInput = el('input', 'lg-team-newInput');
			titleInput.type = 'text';
			titleInput.placeholder = '工单标题';
			titleInput.dataset.newInput = 'title';
			node.appendChild(titleInput);

			const summaryInput = el('textarea', 'lg-team-newInput');
			summaryInput.rows = 2;
			summaryInput.placeholder = '工单要求 / 范围';
			summaryInput.dataset.newInput = 'summary';
			node.appendChild(summaryInput);

			const row = el('div', 'lg-team-cardRow');
			const submit = el('button', 'lg-team-btn', '派发');
			submit.type = 'button';
			submit.dataset.action = 'ticket-create';
			const cancel = el('button', 'lg-team-btn', '取消');
			cancel.type = 'button';
			cancel.dataset.action = 'newbox-close';
			row.appendChild(submit);
			row.appendChild(cancel);
			node.appendChild(row);
		}

		node.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && event.target && event.target.tagName !== 'TEXTAREA') {
				event.preventDefault();
				const submitBtn = node.querySelector("[data-action='member-create'], [data-action='member-update'], [data-action='room-create'], [data-action='room-update'], [data-action='ticket-create']");
				if (submitBtn) submitBtn.click();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				closeNewBox();
			}
		});

		root.appendChild(node);
		try {
			const firstInput = node.querySelector('input');
			if (firstInput) firstInput.focus();
		} catch {}
	};
	const newBoxValue = (kind, field) => {
		if (root === null) return '';
		const box = root.querySelector('.lg-team-newBox');
		if (box === null) return '';
		const input = box.querySelector(`[data-new-input='${field}']`);
		return input ? String(input.value ?? '').trim() : '';
	};

	/* --- member creation capability ----------------------------------------
	 * The skin never spawns teammates on its own; it offers the action only
	 * when the harness exposes a team capability, and otherwise renders the
	 * disabled entry with a hint (spec: feature-detect, degrade loudly). */

	const teamCapability = () => {
		try {
			for (const name of ['agentTeam', 'team', 'agent-team']) {
				const service = ctx.get(name);
				if (service !== null && service !== undefined && (typeof service === 'function' || typeof service === 'object')) return { ok: true, service };
			}
		} catch {}
		try {
			const global = window.__DSH_AGENT_TEAM__;
			if (global !== null && global !== undefined) return { ok: true, service: global };
		} catch {}
		return { ok: false, hint: '此环境没有暴露创建成员的能力' };
	};
	/** Best-effort spawn through a detected capability; failure never blocks the stored profile. */
	const spawnMember = (service, profile) => {
		if (service === null || service === undefined) return false;
		const payload = { name: profile.name, role: profile.role, instructions: profile.instructions };
		try {
			if (typeof service === 'function') {
				service(payload);
				return true;
			}
			if (typeof service.spawn === 'function') {
				service.spawn(payload);
				return true;
			}
			if (typeof service.create === 'function') {
				service.create(payload);
				return true;
			}
		} catch {}
		return false;
	};
	/** In-root confirmation card for destructive actions (cancellable without state change). */
	const renderConfirm = () => {
		if (root === null) return;
		const old = root.querySelector('.lg-team-confirm');
		if (old && old.parentElement) old.parentElement.removeChild(old);
		const confirm = state.confirm;
		if (confirm === null) return;
		const node = el('div', 'lg-team-confirm');
		node.setAttribute('role', 'alertdialog');
		node.setAttribute('aria-label', '确认操作');
		node.appendChild(el('p', 'lg-team-cardText', confirm.label));
		const row = el('div', 'lg-team-cardRow');
		const yes = el('button', 'lg-team-btn lg-team-danger', '确认');
		yes.type = 'button';
		yes.dataset.action = 'confirm-yes';
		const no = el('button', 'lg-team-btn', '取消');
		no.type = 'button';
		no.dataset.action = 'confirm-no';
		row.appendChild(yes);
		row.appendChild(no);
		node.appendChild(row);
		root.appendChild(node);
		try {
			no.focus();
		} catch {}
	};

	/* --- render ------------------------------------------------------------ */

	const badgeHtml = (sessionId) => {
		const counts = scopeCounts(sessionId);
		if (counts.mentions > 0) return `<span class="lg-team-badge is-mention" data-mention>@${counts.mentions}</span>`;
		if (counts.unread > 0) return `<span class="lg-team-badge">${counts.unread}</span>`;
		return '';
	};
	const askConfirm = (action, arg, label) => {
		state.confirm = { action, arg, label };
		renderAll();
	};
	const runConfirmed = (confirm) => {
		if (confirm.action === 'remove-member') void postTeam('profile-remove', { id: confirm.arg }).then(renderAll);
		else if (confirm.action === 'remove-room') void postTeam('room-remove', { id: confirm.arg }).then(renderAll);
		else if (confirm.action === 'memory-clear') void postTeam('memory-clear', { memberId: confirm.arg }).then(renderAll);
	};
	const rowMenu = (profile) => {
		const items = [];
		if (profile.sessionId) items.push({ label: '打开对话', run: () => focusSession(profile.sessionId) });
		if (hasFeature('memory') || hasFeature('sideChat') || hasFeature('handoff')) items.push({ label: '打开面板', run: () => openPanel('member', profile.id) });
		items.push({ label: '派发工单', run: () => {
			state.newBox = { kind: 'ticket', workerId: profile.id };
			renderNewBox();
		} });
		items.push({ label: '工单 / 召回', run: () => openPanel('member', profile.id) });
		items.push({ label: '重命名', run: () => {
			state.newBox = { kind: 'rename-member', id: profile.id };
			renderNewBox();
		} });
		if (hasFeature('memory')) items.push({ label: '清空记忆', run: () => askConfirm('memory-clear', profile.id, `清空 ${profile.name} 的全部记忆条目？`) });
		items.push({ label: '移出团队', danger: true, run: () => askConfirm('remove-member', profile.id, `把 ${profile.name} 移出团队？`) });
		return items;
	};
	const roomMenu = (room) => {
		const items = [];
		if (room.sessionId) items.push({ label: '打开对话', run: () => focusSession(room.sessionId) });
		items.push({ label: '编辑目标', run: () => {
			state.newBox = { kind: 'rename-room', id: room.id };
			renderNewBox();
		} });
		items.push({ label: '解散房间', danger: true, run: () => askConfirm('remove-room', room.id, `解散房间 ${room.name}？对话不会被删除。`) });
		return items;
	};
	const renderRoster = () => {
		const host = root.querySelector('.lg-team-roster');
		if (host === null) return;
		const team = state.team || { profiles: [] };
		const profiles = Array.isArray(team.profiles) ? team.profiles : [];
		const focused = currentSessionId();
		host.innerHTML = '';
		if (profiles.length === 0) {
			host.appendChild(el('p', 'lg-team-empty', '团队还没有成员，从下方添加'));
			return;
		}
		for (const profile of profiles) {
			const row = el('div', `lg-team-row${profile.role === 'lead' ? ' is-lead' : ''}`);
			row.dataset.action = 'row-menu';
			row.dataset.arg = profile.id;
			row.dataset.memberId = profile.id;
			row.dataset.sessionId = profile.sessionId || '';
			const counts = scopeCounts(profile.sessionId);
			const live = liveRow(profile.sessionId);
			const presence = live ? live.presence || 'idle' : 'idle';
			row.setAttribute('data-presence', presence);
			const shell = el('div', 'lg-team-rowMain');
			const shellAvatar = el('span', 'lg-team-avatarBox');
			shellAvatar.innerHTML = avatarHtml(profile);
			shell.appendChild(shellAvatar);
			const text = el('div', 'lg-team-rowText');
			text.appendChild(el('span', 'lg-team-name', profile.name));
			const roleLabel = profile.role === 'lead' ? '主控 (Router)' : '成员 (Worker)';
			text.appendChild(el('span', `lg-team-role lg-team-roleBadge is-${profile.role}`, roleLabel));
			shell.appendChild(text);
			row.appendChild(shell);
			const meta = el('div', 'lg-team-rowMeta');
			if (profile.sessionId === focused) row.classList.add('is-focused');
			meta.insertAdjacentHTML('beforeend', badgeHtml(profile.sessionId));

			const allTickets = Array.isArray(team.tickets) ? team.tickets : [];
			const activeTickets = allTickets.filter((t) => t.workerId === profile.id && (t.status === 'working' || t.status === 'queued'));
			if (activeTickets.length > 0) {
				const tktPill = el('span', 'lg-team-badge lg-team-ticketBadge', `${activeTickets.length} 工单`);
				tktPill.title = `进行中工单: ${activeTickets.length} 个`;
				meta.appendChild(tktPill);
			}

			const allRooms = Array.isArray(team.rooms) ? team.rooms : [];
			const subscribedRooms = allRooms.filter((r) => Array.isArray(r.subscribedWorkerIds) && r.subscribedWorkerIds.includes(profile.id));
			if (subscribedRooms.length > 0) {
				const passPill = el('span', 'lg-team-badge lg-team-passPill', '直通');
				passPill.title = `已订阅直通线程: ${subscribedRooms.map((r) => r.name).join(', ')}`;
				meta.appendChild(passPill);
			}

			const observedTickets = allTickets.filter((t) => (t.workerId === profile.id || !t.workerId) && t.status === 'observed');
			if (observedTickets.length > 0) {
				const quickApprove = el('button', 'lg-team-btn lg-team-btnXs lg-team-quickApprove', '批准工单');
				quickApprove.type = 'button';
				quickApprove.dataset.action = 'ticket-approve';
				quickApprove.dataset.arg = observedTickets[0].id;
				quickApprove.title = `一键批准: ${observedTickets[0].title}`;
				meta.appendChild(quickApprove);
			}

			const dot = el('span', 'lg-team-dot');
			dot.dataset.presence = presence;
			meta.appendChild(dot);
			row.appendChild(meta);
			host.appendChild(row);
			if (counts.mentions > 0 || counts.unread > 0) row.title = counts.mentions > 0 ? `有 ${counts.mentions} 条 @提及` : `有 ${counts.unread} 条新消息`;
		}
	};
	const renderRooms = () => {
		const host = root.querySelector('.lg-team-rooms');
		if (host === null) return;
		const team = state.team || { rooms: [] };
		const rooms = Array.isArray(team.rooms) ? team.rooms : [];
		host.innerHTML = '';
		if (rooms.length === 0) {
			host.appendChild(el('p', 'lg-team-empty', '还没有房间'));
			return;
		}
		for (const room of rooms) {
			const row = el('div', 'lg-team-room');
			row.dataset.action = 'room-menu';
			row.dataset.arg = room.id;
			const head = el('div', 'lg-team-roomHead');
			head.appendChild(el('span', 'lg-team-name', room.name));
			head.insertAdjacentHTML('beforeend', badgeHtml(room.sessionId));
			row.appendChild(head);
			if (room.goal) row.appendChild(el('p', 'lg-team-goal', room.goal));
			const chips = el('div', 'lg-team-chips');
			if (Array.isArray(room.subscribedWorkerIds) && room.subscribedWorkerIds.length > 0) {
				const passChip = el('span', 'lg-team-chip lg-team-passChip', '直通');
				passChip.title = '直通分派已启用';
				chips.appendChild(passChip);
			}
			for (const id of room.memberIds ?? []) {
				const member = memberById(id);
				if (member !== null) chips.appendChild(el('span', 'lg-team-chip', member.name));
			}
			if (chips.childNodes.length > 0) row.appendChild(chips);
			host.appendChild(row);
		}
	};
	const renderHead = () => {
		const head = root.querySelector('.lg-team-head');
		if (head === null) return;
		const title = head.querySelector('.lg-team-title');
		if (title !== null) title.textContent = '团队';
		const collapseBtn = head.querySelector('.lg-team-collapseBtn');
		if (collapseBtn !== null) collapseBtn.textContent = collapsedPref() ? '›' : '«';
		let modeBtn = head.querySelector('.lg-team-modeBtn');
		if (modeBtn === null) {
			modeBtn = el('button', 'lg-team-badge lg-team-modeBtn');
			modeBtn.type = 'button';
			modeBtn.dataset.action = 'autonomy-toggle';
			if (collapseBtn !== null) head.insertBefore(modeBtn, collapseBtn);
			else head.appendChild(modeBtn);
		}
		const mode = autonomyModePref();
		modeBtn.dataset.mode = mode;
		modeBtn.textContent = mode === 'auto' ? '自动' : '观察';
		modeBtn.title = `自治模式: ${mode === 'auto' ? '自动直派' : '观察待批'} (点击切换)`;
	};
	const renderAll = () => {
		if (root === null) return;
		renderHead();
		renderRoster();
		renderRooms();
		renderPanel();
		renderNewBox();
		renderConfirm();
	};

	/* --- actions ------------------------------------------------------------ */

	const toggleFeature = (name) => {
		if (!FEATURES_ALL.includes(name)) return;
		const current = featureSet();
		if (current.has(name)) current.delete(name);
		else current.add(name);
		const next = FEATURES_ALL.filter((feature) => current.has(feature));
		optimistic = { ...(optimistic ?? {}), teamFeatures: next };
		void prefs.write('teamFeatures', next);
	};
	const toggleCollapsed = () => {
		const next = !collapsedPref();
		mirrorWrite({ collapsed: next });
		optimistic = { ...(optimistic ?? {}), teamCollapsed: next };
		void prefs.write('teamCollapsed', next);
		renderAll();
		syncOpen();
	};
	const openPanel = (kind, id) => {
		if (!hasFeature('memory') && !hasFeature('sideChat') && !hasFeature('handoff')) return;
		state.panel = { kind, id };
		renderAll();
	};
	const dispatch = (action, arg, event) => {
		if (action === 'row-menu') {
			const member = memberById(arg);
			if (member === null) return;
			const rect = event && event.target && typeof event.target.getBoundingClientRect === 'function' ? event.target.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 };
			openMenu(rowMenu(member), rect.right, rect.top);
			return;
		}
		if (action === 'room-menu') {
			const room = roomById(arg);
			if (room === null) return;
			const rect = event && event.target && typeof event.target.getBoundingClientRect === 'function' ? event.target.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 };
			openMenu(roomMenu(room), rect.right, rect.top);
			return;
		}
		if (action === 'row-open') {
			const member = memberById(arg);
			if (member !== null && member.sessionId) focusSession(member.sessionId);
			else if (member !== null) openPanel('member', member.id);
			return;
		}
		if (action === 'panel-close') return closePanel();
		if (action === 'newbox-close') return closeNewBox();
		if (action === 'palette-open') return openPalette();
		if (action === 'collapse-toggle') return toggleCollapsed();
		if (action === 'member-add') {
			const capability = teamCapability();
			state.newBox = { kind: 'member', spawn: capability };
			renderNewBox();
			return;
		}
		if (action === 'room-add') {
			state.newBox = { kind: 'room' };
			renderNewBox();
			return;
		}
		if (action === 'member-create') {
			const name = newBoxValue('member', 'name');
			if (name === '') return;
			const role = newBoxValue('member', 'role') || 'member';
			const instructions = newBoxValue('member', 'instructions');
			const capability = state.newBox && state.newBox.spawn ? state.newBox.spawn : teamCapability();
			void postTeam('profile-add', { name, role, instructions }).then((team) => {
				if (capability && capability.ok === true) spawnMember(capability.service, { name, role, instructions });
				closeNewBox();
				renderAll();
				void team;
			});
			return;
		}
		if (action === 'room-create') {
			const name = newBoxValue('room', 'name');
			if (name === '') return;
			const goal = newBoxValue('room', 'goal');
			void postTeam('room-add', { name, goal }).then(() => {
				closeNewBox();
				renderAll();
			});
			return;
		}
		if (action === 'memory-add') {
			const box = root ? root.querySelector('.lg-team-panel') : null;
			const input = box ? box.querySelector("[data-panel-input='memory']") : null;
			const text = input ? String(input.value ?? '').trim() : '';
			if (text === '') return;
			if (input) input.value = '';
			void postTeam('memory-add', { memberId: arg, text }).then(renderAll);
			return;
		}
		if (action === 'memory-remove') {
			const at = String(arg).indexOf(':');
			if (at <= 0) return;
			void postTeam('memory-remove', { memberId: arg.slice(0, at), id: arg.slice(at + 1) }).then(renderAll);
			return;
		}
		if (action === 'memory-edit-start') {
			const at = String(arg).indexOf(':');
			if (at <= 0) return;
			state.panelEdit = { memberId: arg.slice(0, at), entryId: arg.slice(at + 1) };
			renderAll();
			return;
		}
		if (action === 'memory-edit-cancel') {
			state.panelEdit = null;
			renderAll();
			return;
		}
		if (action === 'memory-edit-save') {
			const at = String(arg).indexOf(':');
			if (at <= 0) return;
			const box = root ? root.querySelector('.lg-team-panel') : null;
			const input = box ? box.querySelector("[data-panel-input='memory-edit']") : null;
			const text = input ? String(input.value ?? '').trim() : '';
			if (text === '') return;
			state.panelEdit = null;
			void postTeam('memory-edit', { memberId: arg.slice(0, at), id: arg.slice(at + 1), text }).then(renderAll);
			return;
		}
		if (action === 'confirm-yes') {
			const confirm = state.confirm;
			state.confirm = null;
			if (confirm !== null) runConfirmed(confirm);
			else renderAll();
			return;
		}
		if (action === 'confirm-no') {
			state.confirm = null;
			renderAll();
			return;
		}
		if (action === 'learning-accept') {
			const card = (state.team?.learning ?? []).find((item) => item.id === arg);
			const member = card ? card.memberId : '';
			void (async () => {
				await postTeam('learning-set', { id: arg, status: 'accepted' });
				if (member && card) await postTeam('memory-add', { memberId: member, text: card.text });
				renderAll();
			})();
			return;
		}
		if (action === 'learning-discard') {
			void postTeam('learning-set', { id: arg, status: 'discarded' }).then(renderAll);
			return;
		}
		if (action === 'side-send') {
			const box = root ? root.querySelector('.lg-team-panel') : null;
			const input = box ? box.querySelector("[data-panel-input='side']") : null;
			const text = input ? String(input.value ?? '').trim() : '';
			if (text === '') return;
			if (input) input.value = '';
			void postTeam('side-send', { memberId: arg, role: 'user', text }).then(renderAll);
			return;
		}
		if (action === 'checkpoint-add') {
			const box = root ? root.querySelector('.lg-team-panel') : null;
			const input = box ? box.querySelector("[data-panel-input='checkpoint']") : null;
			const text = input ? String(input.value ?? '').trim() : '';
			if (text === '') return;
			if (input) input.value = '';
			void postTeam('checkpoint-add', { memberId: arg, text }).then(renderAll);
			return;
		}
		if (action === 'checkpoint-remove') {
			void postTeam('checkpoint-remove', { id: arg }).then(renderAll);
			return;
		}
		if (action === 'autonomy-toggle') return toggleAutonomyMode();
		if (action === 'member-update') {
			const id = state.newBox ? state.newBox.id : '';
			if (!id) return;
			const name = newBoxValue('rename-member', 'name');
			if (name === '') return;
			const role = newBoxValue('rename-member', 'role') || 'member';
			const instructions = newBoxValue('rename-member', 'instructions');
			void postTeam('profile-update', { id, patch: { name, role, instructions } }).then(() => {
				closeNewBox();
				renderAll();
			});
			return;
		}
		if (action === 'room-chip-toggle') {
			const chip = event && event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-action="room-chip-toggle"]') : null;
			if (chip) {
				const isSelected = chip.classList.contains('is-selected');
				chip.classList.toggle('is-selected', !isSelected);
				chip.setAttribute('aria-pressed', !isSelected ? 'true' : 'false');
			}
			return;
		}
		if (action === 'room-update') {
			const id = state.newBox ? state.newBox.id : '';
			if (!id) return;
			const name = newBoxValue('rename-room', 'name');
			if (name === '') return;
			const goal = newBoxValue('rename-room', 'goal');
			const box = root ? root.querySelector('.lg-team-newBox') : null;
			const chips = box ? box.querySelectorAll('[data-action="room-chip-toggle"]') : [];
			const memberIds = [];
			for (const chip of chips) {
				if (chip.classList.contains('is-selected')) {
					memberIds.push(chip.dataset.memberId);
				}
			}
			void postTeam('room-update', { id, patch: { name, goal, memberIds, subscribedWorkerIds: memberIds } }).then(() => {
				closeNewBox();
				renderAll();
			});
			return;
		}
		if (action === 'ticket-create') {
			const title = newBoxValue('ticket', 'title');
			if (title === '') return;
			const summary = newBoxValue('ticket', 'summary');
			const workerId = state.newBox ? state.newBox.workerId : '';
			void postTeam('ticket-add', { title, summary, workerId, mode: autonomyModePref() }).then(() => {
				closeNewBox();
				renderAll();
			});
			return;
		}
		if (action === 'ticket-approve') {
			void postTeam('ticket-approve', { id: arg }).then(renderAll);
			return;
		}
		if (action === 'watchdog-retry') {
			void postTeam('watchdog-resolve', { id: arg, action: 'retry' }).then(renderAll);
			return;
		}
		if (action === 'watchdog-dismiss') {
			void postTeam('watchdog-resolve', { id: arg, action: 'dismiss' }).then(renderAll);
			return;
		}
		if (action === 'ticket-spill-toggle') {
			if (!state.expandedTickets) state.expandedTickets = {};
			state.expandedTickets[arg] = !state.expandedTickets[arg];
			renderPanel();
			return;
		}
	};

	/* --- mount ------------------------------------------------------------- */

	const buildDom = () => {
		root = el('aside', 'lg-team lg-team-root');
		root.id = 'lg-team-root';
		root.setAttribute('aria-label', '团队');
		if (typeof window !== 'undefined') {
			try {
				window.__lgTeamRoot = root;
			} catch {}
		}
		const head = el('header', 'lg-team-head');
		head.appendChild(el('h2', 'lg-team-title', '团队'));
		const collapseBtn = el('button', 'lg-team-btn lg-team-collapseBtn', '«');
		collapseBtn.type = 'button';
		collapseBtn.setAttribute('aria-label', '收纳团队面板');
		collapseBtn.setAttribute('title', '收纳：回到会话列表');
		collapseBtn.dataset.action = 'collapse-toggle';
		head.appendChild(collapseBtn);
		root.appendChild(head);
		root.appendChild(el('div', 'lg-team-scroll'));
		const scroll = root.querySelector('.lg-team-scroll');
		scroll.appendChild(el('h3', 'lg-team-label', '成员'));
		scroll.appendChild(el('div', 'lg-team-roster'));
		scroll.appendChild(el('h3', 'lg-team-label', '房间'));
		scroll.appendChild(el('div', 'lg-team-rooms'));
		const foot = el('footer', 'lg-team-foot');
		const memberBtn = el('button', 'lg-team-btn', '＋ 成员');
		memberBtn.type = 'button';
		memberBtn.dataset.action = 'member-add';
		const roomBtn = el('button', 'lg-team-btn', '＋ 房间');
		roomBtn.type = 'button';
		roomBtn.dataset.action = 'room-add';
		const paletteBtn = el('button', 'lg-team-btn', '⌘K');
		paletteBtn.type = 'button';
		paletteBtn.dataset.action = 'palette-open';
		foot.appendChild(memberBtn);
		foot.appendChild(roomBtn);
		foot.appendChild(paletteBtn);
		root.appendChild(foot);
		root.addEventListener('click', (event) => {
			const node = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-action]') : null;
			if (node === null || !root.contains(node)) return;
			const action = node.dataset.action;
			if (action === 'row-menu') dispatch(action, node.dataset.arg, event);
			else if (action === 'room-menu') dispatch(action, node.dataset.arg, event);
			else if (action !== undefined && action !== '') dispatch(action, node.dataset.arg, event);
		});
		root.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' || event.target === null || typeof event.target.closest !== 'function') return;
			const input = event.target.closest("[data-panel-input]");
			if (input === null) return;
			const field = input.dataset.panelInput;
			const arg = field === 'memory' || field === 'side' || field === 'checkpoint' ? (state.panel ? state.panel.id : '') : '';
			const names = { memory: 'memory-add', side: 'side-send', checkpoint: 'checkpoint-add' };
			if (names[field]) dispatch(names[field], arg, event);
		});
	};

	const tick = async () => {
		try {
			await fetchTeam();
		} catch {
			state.failed += 1;
		}
		autoSeen();
		renderAll();
		syncOpen();
	};

	const start = () => {
		if (!stopped && root !== null) return;
		stopped = false;
		if (root === null) buildDom();
		slotsHandle.start();
		syncOpen();
		renderAll();
		void tick();
		timer = setInterval(() => {
			void tick();
		}, POLL_MS);
		keyHandler = (event) => {
			if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
				event.preventDefault();
				if (state.palette === null) openPalette();
				else closePalette({});
			}
		};
		document.addEventListener('keydown', keyHandler, true);
		reconcileMirror();
		stopPrefs = watchPrefs();
	};
	const stop = () => {
		stopped = true;
		if (timer !== 0) {
			clearInterval(timer);
			timer = 0;
		}
		if (stopPrefs !== null) {
			try {
				stopPrefs();
			} catch {}
			stopPrefs = null;
		}
		if (keyHandler !== null) {
			document.removeEventListener('keydown', keyHandler, true);
			keyHandler = null;
		}
		closeMenu({});
		closePalette({});
		closePanel();
		closeNewBox();
		state.confirm = null;
		if (root !== null) {
			const confirm = root.querySelector('.lg-team-confirm');
			if (confirm && confirm.parentElement) confirm.parentElement.removeChild(confirm);
		}
		slotsHandle.stop();
		if (root !== null) root.hidden = true;
		syncOpen();
	};

	/* --- sidebar integration ----------------------------------------------
	 * The team surface claims two sidebar slots and nothing else. The
	 * `sidebar.workspaces` entry gives the roster a seat inside the region
	 * area — a sibling of the session browser — and `sidebar.footer.action`
	 * gives the stow toggle a home beside the browser's own controls. While
	 * `data-lg-team-open` holds on the document element, the stylesheet lets
	 * only the team host show inside the region; the moment it clears, the
	 * session browser returns. The center column is never touched. */

	const regionRef = (node) => {
		if (node === null) {
			if (root !== null && root.parentElement) {
				try {
					root.parentElement.removeChild(root);
				} catch {}
			}
			return;
		}
		if (root === null) buildDom();
		if (root === null) return;
		root.hidden = stopped || !enabledPref() || collapsedPref();
		try {
			node.appendChild(root);
		} catch {}
	};

	const RegionError = class extends React.Component {
		constructor(...args) {
			super(...args);
			this.state = { error: null };
		}
		static getDerivedStateFromError(error) {
			return { error };
		}
		render() {
			if (this.state.error !== null) {
				return React.createElement(
					'div',
					{ className: 'lg-team-regionCrash', role: 'alert' },
					React.createElement('p', { className: 'lg-team-regionCrashTitle' }, '团队面板未能渲染'),
					React.createElement('p', { className: 'lg-team-regionCrashMsg' }, String(this.state.error.message || this.state.error))
				);
			}
			return React.createElement('div', { className: 'lg-team-regionHost', ref: regionRef });
		}
	};

	const ToggleButton = () =>
		React.createElement('button', {
			className: 'lg-team-sideToggle',
			type: 'button',
			'aria-pressed': collapsedPref() ? 'false' : 'true',
			'aria-label': collapsedPref() ? '展开团队面板' : '收纳团队面板',
			onClick: (event) => {
				toggleCollapsed();
				const node = event && event.currentTarget;
				if (node && typeof node.setAttribute === 'function') {
					const open = !collapsedPref();
					node.setAttribute('aria-pressed', open ? 'true' : 'false');
					node.setAttribute('aria-label', open ? '收纳团队面板' : '展开团队面板');
				}
			},
		}, '团队');

	const freePriority = (entries, targetPriority = -50) => {
		if (!Array.isArray(entries)) return targetPriority;
		const taken = entries.map((e) => (e && e.options && typeof e.options.priority === 'number' ? e.options.priority : 0) - 1);
		return Math.min(targetPriority, ...taken);
	};

	const slotsHandle = (() => {
		const slots = ctx && ctx.slots;
		if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
			return { start() {}, stop() {}, mountRegion() {}, unmountRegion() {} };
		}
		let footerHandle = null;
		let regionHandle = null;

		const mountFooter = () => {
			if (footerHandle !== null) return;
			try {
				footerHandle = slots.inject('sidebar.footer.action', () => {
					let off = null;
					try {
						off = slots.register({ name: 'sidebar.footer.action', id: 'lg-team-toggle', order: 30 }, ToggleButton);
					} catch {}
					return () => {
						if (typeof off === 'function') {
							try { off(); } catch {}
						}
					};
				});
			} catch {
				footerHandle = null;
			}
			if (footerHandle !== null && typeof footerHandle.start === 'function') {
				try { footerHandle.start(); } catch {}
			}
		};

		const unmountFooter = () => {
			if (footerHandle === null) return;
			const cur = footerHandle;
			footerHandle = null;
			try {
				if (typeof cur === 'function') cur();
				else if (typeof cur.stop === 'function') cur.stop();
			} catch {}
		};

		const mountRegion = () => {
			if (regionHandle !== null) return;
			try {
				regionHandle = slots.inject('sidebar.workspaces', () => {
					let off = null;
					try {
						const entries = typeof slots.entries === 'function' ? slots.entries('sidebar.workspaces') : [];
						const priority = freePriority(entries, -50);
						off = slots.register({ name: 'sidebar.workspaces', id: PANEL_ID, order: 30, priority }, RegionError);
					} catch (err) {
						console.warn('[dsh-liquid-glass] could not register sidebar.workspaces:', err);
					}
					return () => {
						if (typeof off === 'function') {
							try { off(); } catch {}
						}
					};
				});
			} catch {
				regionHandle = null;
			}
			if (regionHandle !== null && typeof regionHandle.start === 'function') {
				try { regionHandle.start(); } catch {}
			}
		};

		const unmountRegion = () => {
			if (regionHandle === null) return;
			const cur = regionHandle;
			regionHandle = null;
			try {
				if (typeof cur === 'function') cur();
				else if (typeof cur.stop === 'function') cur.stop();
			} catch {}
		};

		return {
			start() {
				mountFooter();
			},
			stop() {
				unmountRegion();
				unmountFooter();
			},
			mountRegion,
			unmountRegion,
		};
	})();

	const register = () => {
		return {
			start,
			stop,
			/* Test seams: the shell check drives these directly. */
			__lg: {
				root,
				slotsHandle,
				state,
				dispatch,
				openMenu,
				closeMenu,
				openPalette,
				closePalette,
				openPanel,
				closePanel,
				renderPanel,
				renderAll,
				syncOpen,
				tick,
				collapsedPref,
				toggleCollapsed,
				enabledPref,
				focusSession,
				markSeen,
				autoSeen,
				scopeCounts,
				currentSessionId,
				memberById,
				roomById,
				mirrorRead,
				reconcileMirror,
				identicon,
				avatarHtml,
				badgeHtml,
			},
		};
	};
	return { register };
}
