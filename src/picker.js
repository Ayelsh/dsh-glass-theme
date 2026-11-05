/**
 * Liquid Glass — model picker (ported).
 *
 * This is a 1:1 port of the reference implementation's model picker
 * (dsh-claude-style, MIT, Copyright (c) 2026 Nwflower): the same two-level
 * popover, the same provider grouping, the same brand lockups, the same
 * description cascade and the same peak/off-peak badge. What changes is only
 * the material — every surface here is drawn with this skin's glass tokens
 * instead of the reference's Claude palette.
 *
 * WHY A REACT LAYER AND NOT A DECORATOR
 * The decorator this replaces could only add nodes INSIDE the third-party
 * `dsh-codex-subscription` menu, which owns its own width, row heights and
 * grouping. A menu cannot be redesigned from inside another component's tree
 * without fighting it on every render. The reference solves this by rendering
 * its own seat, and that is what this does: it hides the host trigger and
 * renders the picker itself.
 *
 * Contract used (all read from the shipped app, not guessed):
 *   ctx.get('modelDirectories').directoryFor(sessionId)
 *     -> { store: { subscribe, getSnapshot }, load(), select(selection) }
 *   store snapshot = { current, routable, groups, failures, status, pending, error }
 *   group = { id, name?, models: [{ id, name, description?, reasoning? }] }
 *   current = { provider, model, reasoningEffort? }
 *
 * Injected by tools/build.mjs over the literal `/*__PICKER__*​/null`, so this
 * file is authored as a bare function expression, never as a module.
 */
function createPicker(require, ctx, catalog, shared) {
	const React = require('react');
	const ReactDOM = require('react-dom/client');
	const ReactDOMShared = require('react-dom');

	/** Reference-compatible provider monograms, drawn as text. */
	const MARK = {
		'DeepSeek Account': 'DS',
		workbuddy: 'WB',
		'zai-coding-cn': 'GLM',
		Gemini: 'GM',
		Grok: 'X',
		'ChatGPT subscription': 'GPT',
	};

	/** The class names this layer emits. Plain, unhashed, ours. */
	const C = {
		root: 'lg-picker',
		trigger: 'lg-picker-trigger',
		lockup: 'lg-picker-lockup',
		label: 'lg-picker-label',
		effort: 'lg-picker-effort',
		chevron: 'lg-picker-chevron',
		card: 'lg-picker-card',
		cardAll: 'lg-picker-card-all',
		section: 'lg-picker-section',
		heading: 'lg-picker-heading',
		mark: 'lg-picker-mark',
		count: 'lg-picker-count',
		option: 'lg-picker-option',
		copy: 'lg-picker-copy',
		name: 'lg-picker-name',
		desc: 'lg-picker-desc',
		check: 'lg-picker-check',
		badge: 'lg-picker-badge',
		more: 'lg-picker-more',
		search: 'lg-picker-search',
		empty: 'lg-picker-empty',
		headingName: 'lg-picker-headingName',
		/* The thinking-effort control: an inline segmented control that is
		   visible AT THE SAME TIME as the model list (the pane swap it
		   replaced hid one to show the other). One pill, translated — never
		   cross-faded — so the selection reads as one object moving. */
		seg: 'lg-picker-seg',
		segThumb: 'lg-picker-seg-thumb',
		segItem: 'lg-picker-seg-item',
	};

	/* ---- quick providers ------------------------------------------------
	   Which providers are "quick", and which of their models, is the user's
	   choice and has to survive a reload. The host preference is now the
	   AUTHORITATIVE copy (the settings page writes it); this namespaced key is
	   a boot-time PROJECTION of it, mirrored into localStorage by src/client.js
	   so the picker can read the selection synchronously during its first
	   render. An async host read here would paint the whole catalog first and
	   reflow the card a frame later — the exact flash the mirror exists to
	   avoid.

	   The record is `{ providers: [providerId], models: { providerId:
	   [modelId] } }`. A pinned provider with NO entry in `models` was never
	   narrowed, so all of its models show — including models the catalog
	   gained after the pin. An entry of `[]` means every one of its models was
	   explicitly deselected, which is a different fact from "never chosen".
	   The unit of selection is the PAIR (provider, model): the same model id
	   under two providers is two independent choices. */
	const QUICK_KEY = shared.key;
	/* Read from the same record the settings page writes, so the page and the
	   picker can never disagree about the cap. The picker only RENDERS what is
	   stored — the cap is an editing rule enforced where the list is edited —
	   but the number still comes from one place instead of a second literal. */
	const QUICK_MAX = shared.max;
/* The skin's layer coordinator (design D4), handed in through the shared
   opts. Null when the component is driven directly, as in the feedback
   harness: then dismissal keeps running on the local listeners below. */
const LAYERS = shared.layers || null;
	/* Strings only, trimmed, de-duplicated. The mirror is user-writable storage,
	   so nothing read out of it may be trusted to have the shape it should. */
	function quickStrings(value) {
		if (!Array.isArray(value)) return [];
		const out = [];
		for (const item of value) {
			if (typeof item !== 'string') continue;
			const text = item.trim();
			if (text === '' || out.indexOf(text) >= 0) continue;
			out.push(text);
		}
		return out;
	}

	/* A missing key and unparsable JSON both mean "not configured", which is
	   what `null` means to the caller: list everything. An empty selection
	   parses to `{ providers: [], models: {} }` and renders the same way, but
	   stays distinguishable so the settings page can say "nothing pinned yet"
	   rather than "not loaded". */
	function readQuick() {
		try {
			const raw = window.localStorage.getItem(QUICK_KEY);
			if (raw === null) return null;
			const parsed = JSON.parse(raw);
			/* The pre-object shape was a bare provider id list. Reading it as
			   "pinned, models never narrowed" reproduces the old behaviour
			   exactly, so an upgrade does not silently empty the quick list. */
			if (Array.isArray(parsed)) return { providers: quickStrings(parsed), models: {} };
			if (parsed === null || typeof parsed !== 'object') return null;
			const models = {};
			if (parsed.models !== null && typeof parsed.models === 'object' && !Array.isArray(parsed.models)) {
				for (const provider of Object.keys(parsed.models)) {
					const value = parsed.models[provider];
					/* `__proto__` is a real own key once it has been through
					   JSON.parse, and assigning it would set this object's
					   prototype instead of adding an entry — a stored id can
					   never be that, so it is dropped rather than special-cased
					   at every read. */
					if (provider === '' || provider === '__proto__' || !Array.isArray(value)) continue;
					/* An empty array is KEPT: it is the explicit "none of these",
					   which must not collapse into "never configured". */
					models[provider] = quickStrings(value);
				}
			}
			return { providers: quickStrings(parsed.providers), models };
		} catch (error) {
			return null;
		}
	}

	/** The quick list changed on the settings page (or in another window). */
	function subscribeQuick(onChange) {
		try {
			window.addEventListener('lg-quick-providers', onChange);
			window.addEventListener('storage', onChange);
			return () => {
				window.removeEventListener('lg-quick-providers', onChange);
				window.removeEventListener('storage', onChange);
			};
		} catch (error) {
			return () => {};
		}
	}

	/** Reference's description cascade: exact table, then family, then tier. */
	const descriptions = (catalog && catalog.descriptions) || {};
	/* The catalog is authored as a bare object expression, so its matchers
	   arrive as REGEX LITERALS, not strings — `typeof test` is "object" and a
	   string-only guard silently drops every one of them. Read `source` so
	   both authoring styles work. */
	const ruleSource = (rule) => {
		if (typeof rule === 'string') return rule;
		if (rule && typeof rule.source === 'string') return rule.source;
		return '';
	};
	const tierRules = [];
	for (const rule of (catalog && catalog.descriptionRules) || []) {
		const source = ruleSource(rule && rule.test);
		if (source === '' || typeof rule.text !== 'string') continue;
		try {
			tierRules.push({ re: new RegExp(source, 'i'), text: rule.text });
		} catch (error) {
			/* skipped */
		}
	}
	for (const rule of (catalog && catalog.tierRules) || []) {
		const source = ruleSource(rule && rule.test);
		if (source === '' || typeof rule.text !== 'string') continue;
		try {
			tierRules.push({ re: new RegExp(source, 'i'), text: rule.text });
		} catch (error) {
			/* skipped */
		}
	}

	const normalise = (value) => String(value == null ? '' : value).toLowerCase().replace(/[\s._·\-–—]/g, '');

	/* "Fast · x0.34" → { name: "Fast", mult: "×0.34" }. The ratio is a
	   RESELLER price ratio, not the peak/off-peak factor; keeping them apart
	   stops one number from being read as the other. */
	const MULTIPLIER_RE = /^(.*?)\s*·\s*x\s*([\d.]+)\s*$/i;
	function splitMultiplier(label) {
		const raw = String(label == null ? '' : label);
		const match = MULTIPLIER_RE.exec(raw);
		if (!match) return { name: raw, mult: '' };
		return { name: match[1].trim(), mult: '×' + match[2] };
	}

	/* The table is keyed by the human model name ("DeepSeek-V4.1-Flash") while
	   lookups are normalised, so the table has to be normalised ONCE at build
	   time — comparing a normalised key against raw keys silently missed all
	   35 entries and pushed every row down to the generic family line. */
	const descTable = new Map();
	for (const key of Object.keys(descriptions)) {
		const value = descriptions[key];
		if (typeof value !== 'string' || value.trim() === '') continue;
		descTable.set(normalise(key), value.trim());
	}

	/** The reference's lookup order, preserved: explicit, exact, family, tier. */
	function describe(name, explicit) {
		const key = normalise(name);
		/* The curated table wins over the host's own `description`. That field is
		   raw provider copy — the live directory returns full ENGLISH sentences
		   for some rows ("Stronger agentic coding, knowledge, and difficult
		   reasoning; suited to complex or quality-critical tasks at higher
		   cost."), which in a 360px card ellipsises after three words and leaves
		   the reader with a truncated sentence instead of a one-line summary.
		   A localised, hand-written line is the better answer wherever we have
		   one; the host text is the fallback, not the headline. */
		if (descTable.has(key)) return descTable.get(key);
		if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
		/* `families` exists to pick a MARK and a TONE; it carries no copy, so it
		   must not be consulted for text — returning its empty `text` would end
		   the cascade before the tier rules ever ran. */
		for (const rule of tierRules) if (rule.re.test(name)) return rule.text || '';
		return '';
	}

	/** Provider monogram: the reference's lockups, reduced to a readable mark. */
	function markFor(group) {
		const named = MARK[group && group.name ? group.name : ''] || MARK[group && group.id ? group.id : ''];
		if (named) return named;
		const source = String((group && (group.name || group.id)) || '?').replace(/[^A-Za-z0-9]/g, '');
		return (source.slice(0, 2) || '?').toUpperCase();
	}

	/* ---- peak / off-peak --------------------------------------------------
	   The reference fetches a catalog from its host half. This port keeps the
	   schedule local so the badge works with no network, and states the reason
	   rather than only the state: "off-peak" on a Wednesday and "off-peak" on
	   National Day are different facts and the chip says which applies. */
	const PRICING = (catalog && catalog.pricing) || null;
	const SCHEDULES = PRICING && PRICING.providers ? PRICING.providers : null;
	/* catalog.providers is keyed by provider ID ("zai-coding-cn") and each
	   entry carries the short key ("zai") the schedules are keyed by. The
	   directory's live ids do not always match the catalog's casing or
	   spacing ("deepseek-account" vs "DeepSeek Account"), so the map also
	   indexes a slug of every id and the lookup slugs what it is handed. */
	const slugOf = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
	const PROVIDER_KEYS = (() => {
		const map = new Map();
		const table = catalog && catalog.providers ? catalog.providers : {};
		for (const id of Object.keys(table)) {
			const entry = table[id];
			if (!entry || typeof entry.key !== 'string') continue;
			map.set(id, entry.key);
			map.set(slugOf(id), entry.key);
		}
		return map;
	})();

	/** The schedule for a provider ID, or null when that provider has none. */
	function scheduleFor(providerId) {
		if (SCHEDULES === null || providerId == null) return null;
		const key =
			PROVIDER_KEYS.get(providerId) ||
			PROVIDER_KEYS.get(slugOf(providerId)) ||
			providerId;
		const schedule = SCHEDULES[key];
		return schedule && Array.isArray(schedule.windows) ? schedule : null;
	}

	const OFFSET = (PRICING && PRICING.utcOffsetMinutes) || 480;

	function stampIn(ms) {
		const shifted = new Date(ms + OFFSET * 60000);
		const year = shifted.getUTCFullYear();
		const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
		const day = String(shifted.getUTCDate()).padStart(2, '0');
		return {
			weekday: shifted.getUTCDay(),
			minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
			md: month + '-' + day,
			year: String(year),
		};
	}

	function holidayTable() {
		if (!PRICING || !PRICING.holidays) return null;
		return PRICING.holidays;
	}

	function isHoliday(stamp) {
		const table = holidayTable();
		if (!table) return false;
		const year = table[stamp.year];
		return Array.isArray(year) && year.indexOf(stamp.md) >= 0;
	}

	function isPeak(stamp, schedule) {
		if (stamp.weekday === 0 || stamp.weekday === 6) return false;
		if (isHoliday(stamp)) return false;
		for (const span of schedule.windows) {
			if (stamp.minutes >= span[0] && stamp.minutes < span[1]) return true;
		}
		return false;
	}

	function humanLeft(ms) {
		const total = Math.max(0, Math.round(ms / 60000));
		const days = Math.floor(total / 1440);
		const hours = Math.floor((total % 1440) / 60);
		const minutes = total % 60;
		if (days > 0) return days + ' 天 ' + hours + ' 小时';
		if (hours > 0) return hours + ' 小时 ' + minutes + ' 分';
		return minutes + ' 分';
	}

	/* One cache entry per provider: switching models must re-read the other
	   schedule immediately, not serve the neighbour's clock for 20 seconds. */
	const priceCache = new Map();
	function price(providerId) {
		const schedule = scheduleFor(providerId);
		if (schedule === null) return null;
		const now = Date.now();
		const hit = priceCache.get(providerId);
		if (hit && now - hit.at < 20000) return hit.value;
		const today = stampIn(now);
		const peak = isPeak(today, schedule);
		/* Walk forward a minute at a time to the next boundary. The windows are
		   at most a day apart, so eight days is a safe ceiling for a holiday. */
		let switchAt = null;
		const limit = now + 8 * 86400000;
		for (let probe = now + 60000; probe < limit; probe += 60000) {
			if (isPeak(stampIn(probe), schedule) !== peak) {
				switchAt = probe;
				break;
			}
		}
		let reason = 'window';
		if (isHoliday(today)) reason = 'holiday';
		else if (today.weekday === 0 || today.weekday === 6) reason = 'weekend';
		const value = {
			peak,
			reason,
			switchAt,
			/* The factor is stated from the provider's own convention: DeepSeek
			   prices (peak 2× / off 1×), 智谱 quota (peak 1× / off 0.5×). */
			factor: peak ? schedule.peakFactor : schedule.offPeakFactor,
			note: typeof schedule.note === 'string' ? schedule.note : '',
		};
		priceCache.set(providerId, { at: now, value });
		return value;
	}

	/** 2 -> "≈2×", 0.5 -> "≈0.5×". For a subscription plan the factor reads
	   "how much of the quota one use burns", not a currency price. */
	function factorText(value) {
		const n = Number(value);
		if (!isFinite(n) || n <= 0) return '';
		return '≈' + String(Math.round(n * 100) / 100) + '×';
	}

	/* ---- the seat -------------------------------------------------------- */

	/** Read the session id the way the reference does, then fall back. */
	function sessionIdFor() {
		try {
			const ui = ctx.get('uiSession');
			const live = ui && ui.current && ui.current.value;
			if (live && typeof live.key === 'string') return live.key;
		} catch (error) {
			/* service absent */
		}
		try {
			const sessions = ctx.get('sessions');
			const current = sessions && sessions.list && sessions.list.getSnapshot().current;
			if (typeof current === 'string') return current;
		} catch (error) {
			/* service absent */
		}
		return null;
	}

	function directoryFor(sessionId) {
		try {
			const models = ctx.get('modelDirectories');
			if (!models || typeof models.directoryFor !== 'function') return null;
			return models.directoryFor(sessionId);
		} catch (error) {
			return null;
		}
	}

	function Picker() {
		const [sessionId, setSessionId] = React.useState(sessionIdFor);
		const [directory, setDirectory] = React.useState(() => directoryFor(sessionIdFor()));
		const [snapshot, setSnapshot] = React.useState(() => {
			const first = directoryFor(sessionIdFor());
			try {
				return first && first.store ? first.store.getSnapshot() : null;
			} catch (error) {
				return null;
			}
		});
		const [open, setOpen] = React.useState(false);
		const [query, setQuery] = React.useState('');
		const [tick, setTick] = React.useState(0);
		const [placement, setPlacement] = React.useState(null);
		const [quick, setQuick] = React.useState(() => readQuick());
		const anchor = React.useRef(null);
		const cardRef = React.useRef(null);
		const allRef = React.useRef(null);
		/* The second card. It exists only when a quick-provider list is
		   configured: without one the first card already lists everything, so a
		   second panel would be a door into the same room. */
		const [allOpen, setAllOpen] = React.useState(false);
		const [allQuery, setAllQuery] = React.useState('');
		const [allPlacement, setAllPlacement] = React.useState(null);
		/* The visually active row of each listbox, as a flat index into
		   the card's filtered options. null = nothing active. The stored
		   value is CLAMPED against the live list at render time (see
		   activeMainIdx/activeAllIdx): when the active result disappears
		   the index moves to a remaining result, or to nothing when the
		   list is empty — never a dangling reference. */
		const [activeMain, setActiveMain] = React.useState(null);
		const [activeAll, setActiveAll] = React.useState(null);

		React.useEffect(() => {
			if (activeMain === null || typeof document === 'undefined' || !document.getElementById) return;
			const node = document.getElementById('lg-picker-opt-' + activeMain);
			if (node && typeof node.scrollIntoView === 'function') {
				try { node.scrollIntoView({ block: 'nearest' }); } catch (e) {}
			}
		}, [activeMain]);

		React.useEffect(() => {
			if (activeAll === null || typeof document === 'undefined' || !document.getElementById) return;
			const node = document.getElementById('lg-picker-aopt-' + activeAll);
			if (node && typeof node.scrollIntoView === 'function') {
				try { node.scrollIntoView({ block: 'nearest' }); } catch (e) {}
			}
		}, [activeAll]);

		/* ---- selection feedback (model-picker-feedback) ---------------------
		   The confirmed indicator is owned by the HOST snapshot alone. What
		   activation owns locally is a notice: pending / failed / acknowledged /
		   unconfirmed, bound to an operation record with everything a late
		   callback needs to prove it still speaks for the card on screen —
		   the directory object identity, the session, a monotonic sequence,
		   and the picker opening generation the card belongs to. */
		const [feedback, setFeedback] = React.useState(null);
		const openGenRef = React.useRef(0);
		const sessionIdRef = React.useRef(sessionId);
		const directoryRef = React.useRef(directory);
		const snapshotRef = React.useRef(snapshot);
		const openRef = React.useRef(open);
		const opsRef = React.useRef({ seq: 0, live: null });
		/* Focus restore targets inside the main card: the effort control for
		   the level a completed operation chose, and the all-providers opener
		   that started an all-card operation. */
		const effortButtonsRef = React.useRef({});
		const allOpenerRef = React.useRef(null);
		/* Focus return for the trigger: Escape on the main card comes back here. */
		const triggerRef = React.useRef(null);
		sessionIdRef.current = sessionId;
		directoryRef.current = directory;
		snapshotRef.current = snapshot;
		openRef.current = open;

		/* The card is `position: fixed` (a popover must escape the composer's
		   overflow), so it has no anchor of its own: place it above the trigger,
		   right-aligned, then clamp it into the viewport. The composer sits at the
		   bottom of the window, so "above" is the only side with room. */
		React.useLayoutEffect(() => {
			if (!open) {
				setPlacement(null);
				setAllPlacement(null);
				return;
			}
			const place = () => {
				const trigger = anchor.current;
				const card = cardRef.current;
				if (trigger === null || card === null) return;
				const a = trigger.getBoundingClientRect();
				/* Sizes come from the LAYOUT box (offset*), not the visual one:
				   the open animation starts at scale(.96), and a rect read
				   during those 240ms returns a card ~4% short — placing by it
				   anchored the card 20px too low for its whole lifetime. The
				   trigger is not animated, so its rect is safe for the anchor. */
				const bHeight = card.offsetHeight;
				const bWidth = card.offsetWidth;
				const gap = 8;
				const margin = 10;
				let top = a.top - bHeight - gap;
				if (top < margin) top = Math.min(a.bottom + gap, window.innerHeight - bHeight - margin);
				let left = a.right - bWidth;
				if (left < margin) left = margin;
				if (left + bWidth > window.innerWidth - margin) left = window.innerWidth - margin - bWidth;
				top = Math.max(margin, Math.min(top, window.innerHeight - bHeight - margin));

				/* Which corner the card grows out of: the side of the trigger it landed
				   on, and the edge it hangs from. CSS turns this into a
				   transform-origin so the open/close scale reads as emerging FROM the
				   trigger instead of from one fixed corner. */
				const vertical = top + bHeight <= a.top ? 'above' : 'below';
				const horizontal = Math.abs(left - a.left) < Math.abs(left + bWidth - a.right) ? 'start' : 'end';
				setPlacement({ top: Math.round(top), left: Math.round(left), side: vertical + '-' + horizontal });
				/* The sub-card opens to the LEFT of the card it extends, the way a
				   submenu opens away from the edge it is anchored to. If there is
				   no room it opens to the right instead of going off-screen.
				   Both cards carry the same width rule, so the distance is
				   computed from the main card's LAID-OUT width: the sub-card is
				   still hidden at auto position when this runs, and measuring it
				   there once returned a pre-layout width 14px shy of the real
				   one, which pushed the placed card 8px into the one it
				   extends. */
				const extra = allRef.current;
				if (extra === null) {
					setAllPlacement(null);
					return;
				}
				const allWidth = bWidth;
				const allHeight = extra.offsetHeight > 0 ? extra.offsetHeight : bHeight;
				/* 12px reads as a deliberate gutter between two sibling cards;
				   anything tighter and the pair reads as one torn surface. */
				let allLeft = left - allWidth - 12;
				if (allLeft < margin) allLeft = Math.min(left + bWidth + 12, window.innerWidth - margin - allWidth);
				let allTop = top;
				if (allTop + allHeight > window.innerHeight - margin) allTop = window.innerHeight - margin - allHeight;
				setAllPlacement({ top: Math.round(Math.max(margin, allTop)), left: Math.round(Math.max(margin, allLeft)) });
			};
			place();
			window.addEventListener('resize', place);
			/* Placement is not a one-shot decision: the card's height moves
			   under it while it is open — picking a model outside the quick
			   list appends that provider's group to the card (and picking one
			   inside the list takes it away), and search filtering shrinks the
			   list live. The position must follow the size, or the card's
			   bottom edge drifts off the trigger it is anchored to. A
			   ResizeObserver re-runs `place` on every actual size change; the
			   state it sets does not itself change any size, so this cannot
			   loop. Both cards are observed: the sub-card's own height clamp
			   depends on it too. */
			const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
			if (observer !== null) {
				if (cardRef.current !== null) observer.observe(cardRef.current);
				if (allRef.current !== null) observer.observe(allRef.current);
			}
			return () => {
				window.removeEventListener('resize', place);
				if (observer !== null) observer.disconnect();
			};
		}, [open, allOpen]);

		/* The session can change under us (a new conversation, a switch in the
		   sidebar). Re-resolve on a slow poll rather than subscribing to a service
		   we do not own; the reference does the same through its own hook. */
		React.useEffect(() => {
			const sync = () => {
				const next = sessionIdFor();
				if (next === sessionId) return;
				setSessionId(next);
				setDirectory(directoryFor(next));
			};
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(sync, 900);
			return () => clearInterval(timer);
		}, [sessionId]);

		React.useEffect(() => {
			if (!directory || !directory.store) return undefined;
			let live = true;
			const read = () => {
				if (!live) return;
				try {
					setSnapshot(directory.store.getSnapshot());
				} catch (error) {
					/* a torn store read is not fatal */
				}
			};
			read();
			try {
				directory.load && directory.load();
			} catch (error) {
				/* the host may be offline */
			}
			let stop = null;
			try {
				stop = directory.store.subscribe(read);
			} catch (error) {
				stop = null;
			}
			return () => {
				live = false;
				if (typeof stop === 'function') stop();
			};
		}, [directory]);

		/* The badge counts down, so it needs a heartbeat while it is visible. */
		React.useEffect(() => {
			if (!open) return undefined;
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(() => setTick((value) => value + 1), 20000);
			return () => clearInterval(timer);
		}, [open]);

		/* The quick list is edited on the settings page, which is a different
		   React tree in a different part of the DOM. Without this the picker keeps
		   showing the old list until a reload, which reads as "the setting did not
		   save". */
		React.useEffect(() => subscribeQuick(() => setQuick(readQuick())), []);

		/* Dismissal routing (skin-overlay-navigation). With the skin's layer
		   coordinator the cards register as NONMODAL layers: Escape resolves
		   top-first (the all-providers card above the main card, one layer per
		   press), an outside press dismisses without stealing focus from what
		   the user activated, and Tab order stays natural — a nonmodal panel
		   never traps. Without a coordinator (the component driven directly,
		   as in the feedback harness) the same top-first rules run on local
		   listeners. */
		React.useEffect(() => {
			if (!open || LAYERS !== null) return undefined;
			const onDown = (event) => {
				const node = anchor.current;
				if (node && event.target instanceof Node && node.contains(event.target)) return;
				if (event.target instanceof Element && event.target.closest('.' + C.card)) return;
				setOpen(false);
				setAllOpen(false);
			};
			const onKey = (event) => {
				if (event.key !== 'Escape') return;
				/* The sub-card is the topmost layer, so Escape closes it first and
				   leaves the picker behind it open. */
				if (allOpen) {
					setAllOpen(false);
					return;
				}
				setOpen(false);
			};
			document.addEventListener('pointerdown', onDown, true);
			document.addEventListener('keydown', onKey, true);
			return () => {
				document.removeEventListener('pointerdown', onDown, true);
				document.removeEventListener('keydown', onKey, true);
			};
		}, [open, allOpen]);

		/* Coordinator path: the main card is one nonmodal layer. */
		React.useEffect(() => {
			if (!open || LAYERS === null) return undefined;
			let done = false;
			const handle = LAYERS.acquire({
				owner: 'picker.main',
				kind: 'nonmodal',
				surface: null,
				contains: (node) => {
					const wrap = anchor.current;
					const card = cardRef.current;
					return Boolean((wrap && wrap.contains(node)) || (card && card.contains(node)));
				},
				onDismiss: (info) => {
					if (done) return;
					done = true;
					setOpen(false);
					setAllOpen(false);
					/* Escape is a keyboard act: focus goes back to the trigger.
					   An outside press leaves focus on what the user activated. */
					handle.dispose({ focus: info.reason === 'escape' ? triggerRef.current : false });
				},
			});
			return () => {
				if (!done) {
					done = true;
					/* Closed by state (a selection, a completion, the trigger):
					   the component already placed focus where it belongs. */
					handle.dispose({ focus: false });
				}
			};
		}, [open]);

		/* Coordinator path: the all-providers card is a second nonmodal layer
		   ABOVE the main card. */
		React.useEffect(() => {
			if (!allOpen || LAYERS === null) return undefined;
			let done = false;
			const handle = LAYERS.acquire({
				owner: 'picker.all',
				kind: 'nonmodal',
				surface: allRef.current,
				onDismiss: (info) => {
					if (done) return;
					done = true;
					setAllOpen(false);
					setAllQuery('');
					handle.dispose({ focus: info.reason === 'escape' ? allOpenerRef.current : false });
				},
			});
			return () => {
				if (!done) {
					done = true;
					handle.dispose({ focus: false });
				}
			};
		}, [allOpen]);

		/* Entering a card places focus on its search field: the card declares
		   role=dialog, and the search field is where a list interaction
		   starts. It waits for placement — a visibility:hidden card cannot
		   take focus — and runs once per opening, so a later re-place while
		   the user is working inside the card never steals focus back. */
		const enteredRef = React.useRef(false);
		React.useEffect(() => {
			if (!open) {
				enteredRef.current = false;
				return;
			}
			if (enteredRef.current || placement === null) return;
			const card = cardRef.current;
			/* Test harnesses hand refs that are not DOM nodes; only a real
			   card can take focus. */
			if (card === null || typeof card.querySelector !== 'function') return;
			const target = card.querySelector('input');
			if (target !== null && typeof target.focus === 'function') {
				target.focus();
				enteredRef.current = true;
			}
		}, [open, placement]);

		const allEnteredRef = React.useRef(false);
		React.useEffect(() => {
			if (!allOpen) {
				allEnteredRef.current = false;
				return;
			}
			if (allEnteredRef.current || allPlacement === null) return;
			const card = allRef.current;
			if (card === null || typeof card.querySelector !== 'function') return;
			const target = card.querySelector('input');
			if (target !== null && typeof target.focus === 'function') {
				target.focus();
				allEnteredRef.current = true;
			}
		}, [allOpen, allPlacement]);

		const current = snapshot && snapshot.current ? snapshot.current : null;
		const groups = snapshot && Array.isArray(snapshot.groups) ? snapshot.groups : [];
		const routable = snapshot && snapshot.routable ? snapshot.routable : null;

		/* A model id is only unique INSIDE its provider. The live catalog has
		   `deepseek-v4.1-flash` under both DeepSeek Account and workbuddy (and
		   two workbuddy rows share the same label with different ratios), so a
		   selection test on the model id alone reports every same-named row as
		   selected. Both halves of the pair are required. */
		const isCurrent = (group, model) =>
			current !== null && current.provider === group.id && current.model === model.id;

		const currentLabel = (() => {
			if (!current) return '选择模型';
			for (const group of groups) {
				if (group.id !== current.provider) continue;
				for (const model of group.models || []) {
					if (model.id === current.model) return model.name || model.id;
				}
			}
			/* The provider may have dropped the model since it was chosen; fall
			   back to any provider so the trigger still names something real. */
			for (const group of groups) {
				for (const model of group.models || []) {
					if (model.id === current.model) return model.name || model.id;
				}
			}
			return current.model || '选择模型';
		})();

		/* The reasoning ladder belongs to the SELECTED MODEL, not the picker:
		   `reasoning` is optional per model and its `efforts` are the only legal
		   values. Read it from the same (provider, model) pair. */
		const currentModel = (() => {
			if (!current) return null;
			for (const group of groups) {
				if (group.id !== current.provider) continue;
				for (const model of group.models || []) if (model.id === current.model) return model;
			}
			return null;
		})();
		const reasoning = currentModel && currentModel.reasoning ? currentModel.reasoning : null;
		const effortChoices = reasoning && Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
		/* The trigger is the narrowest place the ratio appears (the composer
		   dock), so the badge form used inside the card is too heavy here — the
		   name is shown bare and the ratio becomes a quiet suffix. */
		const currentBare = splitMultiplier(currentLabel);
		/* The effort the session is actually running on: an explicit choice when
		   one was made, the model's own default when it was not. A fresh session
		   carries no `reasoningEffort` at all — showing "默认" there would hide
		   the number the host is really using. */
		const activeEffort = current !== null && current.reasoningEffort !== undefined && current.reasoningEffort !== null
			? current.reasoningEffort
			: reasoning && reasoning.defaultEffort !== undefined
			? reasoning.defaultEffort
			: null;
		const isDefaultEffort = activeEffort !== null && (current === null || current.reasoningEffort === undefined || current.reasoningEffort === null);
		const effortLabel = (() => {
			if (activeEffort === null) return '';
			for (const level of effortChoices) if (level.id === activeEffort) return level.name || level.id;
			return activeEffort;
		})();

		/* ================================================================== *
		 * Selection operations (model-picker-feedback).
		 *
		 * A pick is an OPERATION, not a fire-and-forget: the command's own
		 * outcome is a fact about the COMMAND, while the confirmed indicator
		 * only ever moves with the host's published `current`. Locally, an
		 * activation owns pending → (failed | acknowledged → unconfirmed)
		 * → completed, and every transition re-proves ownership against the
		 * operation's directory, session, sequence, and the picker opening
		 * generation, so a late or stale callback can never close a newer
		 * card, reopen a dismissed one, steal focus, replace newer feedback,
		 * or claim a selection for a different session.
		 * ================================================================== */

		/* The PAIR (provider, model) plus the effort axis is the identity.
		   The same model id under two providers is a different selection, and
		   a model change and an effort change are different operations even
		   when they name the same provider+model. */
		const sameTarget = (a, b) =>
			a.kind === b.kind && a.provider === b.provider && a.model === b.model && (a.effort || null) === (b.effort || null);

		/* The default that CONFIRMS is the one the model itself declares. A
		   model with no declared default confirms nothing on the effort axis:
		   `undefined === wanted` is false for every real choice, so a missing
		   projection effort is never read as a default invented on this side. */
		const declaredDefaultEffort = (provider, modelId) => {
			const snap = snapshotRef.current;
			const list = snap && Array.isArray(snap.groups) ? snap.groups : groups;
			for (const group of list) {
				if (group.id !== provider) continue;
				for (const model of group.models || []) {
					if (model.id === modelId && model.reasoning && model.reasoning.defaultEffort !== undefined) return model.reasoning.defaultEffort;
				}
			}
			return undefined;
		};

		/* Does the published snapshot confirm `target`? The pair decides;
		   effort confirms on the explicit value, or on the model's declared
		   default when the projection omits it. */
		const confirmsTarget = (target, snap) => {
			if (!snap || !snap.current) return false;
			if (snap.current.provider !== target.provider || snap.current.model !== target.model) return false;
			const wanted = target.effort == null ? null : target.effort;
			if (wanted === null) return true;
			if (snap.current.reasoningEffort === wanted) return true;
			if (snap.current.reasoningEffort === undefined || snap.current.reasoningEffort === null) {
				return declaredDefaultEffort(target.provider, target.model) === wanted;
			}
			return false;
		};

		const opSpeaksForNow = (op) =>
			op !== null &&
			opsRef.current.live === op &&
			op.directory === directoryRef.current &&
			op.sessionId === sessionIdRef.current;

		const clearOpTimer = (op) => {
			if (op && op.timer !== null) {
				clearTimeout(op.timer);
				op.timer = null;
			}
		};

		/* Best-effort focus restore: only within the opening that started the
		   operation, only while the main card is on screen, and only onto a
		   node still connected to the document. A full focus coordinator is a
		   later layer; this stays local to the picker. */
		const focusMainTarget = (op) => {
			if (op.openGen !== openGenRef.current || !openRef.current) return;
			const order = [];
			if (op.target.effort != null && effortButtonsRef.current[op.target.effort]) order.push(effortButtonsRef.current[op.target.effort]);
			if (allOpenerRef.current) order.push(allOpenerRef.current);
			for (const node of order) {
				if (node && node.isConnected === true && typeof node.focus === 'function') {
					node.focus();
					return;
				}
			}
		};

		/* Completion clears the local notice. The all-providers card closes
		   ONLY on a successful command outcome AND a matching confirmed
		   current; a projection that arrives BEFORE the command's own ack is
		   remembered and closes the card when that ack lands. The main card
		   always stays open. */
		const completeOp = (op) => {
			if (!opSpeaksForNow(op)) return;
			clearOpTimer(op);
			if (op.origin === 'all' && op.acked === true) {
				opsRef.current.live = null;
				setFeedback(null);
				setAllOpen(false);
				setAllQuery('');
				focusMainTarget(op);
				return;
			}
			if (op.origin === 'all') {
				op.confirmedEarly = true;
				setFeedback(null);
				return;
			}
			opsRef.current.live = null;
			setFeedback(null);
		};

		const settleOp = (op, result) => {
			if (!opSpeaksForNow(op)) return;
			if (result && result.ok === false) {
				/* A failed command is visible and actionable, and it moves
				   NOTHING: the confirmed indicator keeps following the host's
				   current, and the query stays as typed. */
				clearOpTimer(op);
				op.state = 'failed';
				op.error = result.error;
				setFeedback({ ...op });
				return;
			}
			op.acked = true;
			op.state = 'acknowledged';
			if (confirmsTarget(op.target, snapshotRef.current) || op.confirmedEarly === true) {
				completeOp(op);
				return;
			}
			setFeedback({ ...op });
			op.timer = setTimeout(() => {
				op.timer = null;
				if (!opSpeaksForNow(op)) return;
				if (confirmsTarget(op.target, snapshotRef.current)) {
					completeOp(op);
					return;
				}
				/* Eight seconds with an acknowledged command and no matching
				   projection: say exactly that, keep reflecting the host's
				   current, offer a manual retry — never roll back silently. A
				   later matching projection can still resolve it. */
				op.state = 'unconfirmed';
				setFeedback({ ...op });
			}, 8000);
		};

		const beginSelect = (target, origin) => {
			if (!directory || typeof directory.select !== 'function') return;
			/* A duplicate activation of the SAME pending choice submits once;
			   a different target supersedes whatever was pending before it. */
			const live = opsRef.current.live;
			if (live !== null && live.state === 'pending' && sameTarget(live.target, target)) return;
			if (live !== null) {
				clearOpTimer(live);
				opsRef.current.live = null;
			}
			const seq = opsRef.current.seq + 1;
			opsRef.current.seq = seq;
			const op = {
				seq: seq,
				sessionId: sessionId,
				directory: directory,
				target: target,
				origin: origin,
				openGen: openGenRef.current,
				acked: false,
				confirmedEarly: false,
				state: 'pending',
				error: undefined,
				timer: null,
			};
			opsRef.current.live = op;
			setFeedback({ ...op });
			const selection = { provider: target.provider, model: target.model };
			if (target.effort != null) selection.reasoningEffort = target.effort;
			let outcome;
			try {
				outcome = directory.select(selection);
			} catch (error) {
				/* A synchronous throw is a failed operation like any other. */
				op.state = 'failed';
				op.error = error;
				setFeedback({ ...op });
				return;
			}
			if (outcome && typeof outcome.catch === 'function') {
				outcome.then(
					(result) => settleOp(op, result),
					(error) => settleOp(op, { ok: false, error: error })
				);
			} else {
				settleOp(op, outcome);
			}
		};

		const retryFeedback = () => {
			const live = opsRef.current.live;
			if (live === null || (live.state !== 'failed' && live.state !== 'unconfirmed')) return;
			beginSelect(live.target, live.origin);
		};

		/* The published snapshot outranks every local state: a matching
		   projection completes the operation in ANY state — it can resolve a
		   failure notice or an unconfirmed one, because the host is the only
		   authority on what the session runs. */
		React.useEffect(() => {
			const op = opsRef.current.live;
			if (op === null) return;
			if (confirmsTarget(op.target, snapshot)) completeOp(op);
		}, [snapshot, feedback]);

		/* A session switch retires the old operation's local presentation: its
		   callbacks may still resolve, but they may not claim a selection —
		   or render a notice — for the new session's card. */
		React.useEffect(() => {
			const op = opsRef.current.live;
			if (op === null) return;
			if (op.directory !== directory || op.sessionId !== sessionId) {
				clearOpTimer(op);
				opsRef.current.live = null;
				setFeedback(null);
			}
		}, [directory, sessionId]);

		/* A dead mount schedules nothing. */
		React.useEffect(
			() => () => {
				const op = opsRef.current.live;
				opsRef.current.live = null;
				clearOpTimer(op);
			},
			[]
		);

		/* `fromAll` marks a pick made in the second card. The picker stays
		   open either way — the effort ladder that usually follows is one
		   click away in the main card, and closing here would force the
		   two-open dance the inline effort control exists to avoid. The
		   all-card itself closes only when the operation completes (see
		   completeOp): its job (reach beyond the pinned providers) is done
		   once the host confirms the pick, and the main card — with the
		   effort control — stays behind it. */
		const select = (group, model, fromAll) => {
			/* Carry the new model's own default effort through the command:
			   `select` otherwise re-derives it, and a stale ladder id from the
			   previous model is rejected by the host. */
			const declared =
				model && model.reasoning && model.reasoning.defaultEffort !== undefined ? model.reasoning.defaultEffort : null;
			beginSelect({ provider: group.id, model: model.id, effort: declared, kind: 'model' }, fromAll === true ? 'all' : 'main');
		};

		const pickEffort = (level) => {
			if (current === null) return;
			beginSelect({ provider: current.provider, model: current.model, effort: level, kind: 'effort' }, 'main');
		};

		/* ================================================================== *
		 * Selection
		 * ================================================================== */

		const trigger = React.createElement(
			'button',
			{
				type: 'button',
				className: C.trigger,
				'aria-haspopup': 'dialog',
				'aria-expanded': open ? 'true' : 'false',
				'aria-label': '选择模型',
				ref: triggerRef,
				onClick: () => {
					if (!open) openGenRef.current += 1;
					setOpen((value) => !value);
					setQuery('');
					setAllOpen(false);
					setAllQuery('');
				},
			},
			React.createElement('span', { className: C.lockup, 'aria-hidden': 'true' }, markFor({ id: current ? current.provider : '', name: current ? current.provider : '' })),
			React.createElement('span', { className: C.label }, currentBare.name),
			currentBare.mult === '' ? null : React.createElement('span', { className: C.effort }, currentBare.mult),
			effortLabel ? React.createElement('span', { className: C.effort }, effortLabel) : null,
			React.createElement(
				'span',
				{ className: C.chevron, 'aria-hidden': 'true' },
				React.createElement(
					'svg',
					{ viewBox: '0 0 12 12', width: 12, height: 12 },
					React.createElement('path', {
						d: 'M3 4.5 6 7.5 9 4.5',
						fill: 'none',
						stroke: 'currentColor',
						strokeWidth: '1.4',
						strokeLinecap: 'round',
						strokeLinejoin: 'round',
					})
				)
			)
		);

		if (!open) return React.createElement('span', { className: C.root, ref: anchor }, trigger);

		const activePrice = current !== null ? price(current.provider) : null;
		const filtered = query.trim() === '' ? null : normalise(query);

		const sectionFor = (group, models, filterOverride, fromAll, indexMap) => {
			const filter = filterOverride === undefined ? filtered : filterOverride;
			const shown = models.filter((model) => filter === null || normalise(model.name || model.id).indexOf(filter) >= 0);
			if (shown.length === 0) return null;
			return React.createElement(
				'section',
				{
					className: C.section,
					key: group.id,
					/* A labelled group inside the listbox: the heading names
					   a slice of the list, it is not a control. */
					role: 'group',
					'aria-label': group.name || group.id,
				},
				/* A provider heading is a LABEL, not a control: the list it names
				   is always open, so a chevron or a collapse state would promise an
				   interaction that does not exist. */
				React.createElement(
					'div',
					{ className: C.heading },
					React.createElement('span', { className: C.mark, 'aria-hidden': 'true' }, markFor(group)),
					React.createElement('span', { className: C.headingName }, group.name || group.id),
					React.createElement('span', { className: C.count }, shown.length)
				),
				shown.map((model) => {
					/* Reseller rows embed the price ratio in the label itself
					   ("Fast · x0.34"). Splitting it out keeps the model name and
					   the ratio legible as two different kinds of fact — and the
					   ratio is NOT the peak/off-peak factor, so it must never be
					   merged with the badge above. */
					const bare = splitMultiplier(model.name || model.id);
					const chosen = isCurrent(group, model);
					/* Pending marks the row a live operation names; it is NOT a
					   confirmed state, so aria-checked stays on `chosen` alone. */
					const pending =
						feedback !== null &&
						feedback.state !== 'failed' &&
						feedback.target.kind === 'model' &&
						feedback.target.provider === group.id &&
						feedback.target.model === model.id;
					/* The flat position of this row in its card's listbox, for
					   combobox activedescendant + data-lg-active styling. */
					const flatIndex = indexMap === undefined ? undefined : indexMap.get(group.id + '\u0000' + model.id);
					const isActive = flatIndex !== undefined && (fromAll === true ? activeAllIdx : activeMainIdx) === flatIndex;
					return React.createElement(
						'button',
						{
							type: 'button',
							/* Two rows can share an id across providers, and two
							   workbuddy rows can share a LABEL, so the key is the pair
							   plus the label. */
							key: group.id + '\u0000' + model.id + '\u0000' + (model.name || ''),
							className: C.option,
							role: 'option',
							'aria-selected': chosen ? 'true' : 'false',
							id: flatIndex === undefined ? undefined : (fromAll === true ? 'lg-picker-aopt-' : 'lg-picker-opt-') + flatIndex,
							'data-lg-active': isActive ? 'true' : undefined,
							'data-lg-provider': group.id,
							'data-lg-model': model.id,
							'data-lg-pending': pending ? 'true' : undefined,
							onClick: () => select(group, model, fromAll === true),
						},
						React.createElement(
							'span',
							{ className: C.copy },
							React.createElement('span', { className: C.name }, bare.name, bare.mult === '' ? null : React.createElement('span', { className: 'lg-picker-mult' }, bare.mult)),
							(() => {
								const text = describe(bare.name, model.description);
								return text ? React.createElement('span', { className: C.desc }, text) : null;
							})()
						),
						React.createElement('span', { className: C.check, 'aria-hidden': 'true' }, chosen ? '✓' : pending ? '…' : '')
					);
				})
			);
		};

		/* Thinking effort is an INLINE segmented control, not a second pane:
		   the selector and the model list are on screen at the same time, and
		   one pill translates under the labels instead of cross-fading — the
		   selection reads as one object moving. */
		const hasActiveEffort = activeEffort !== null;
		const effortIndex = Math.max(0, effortChoices.findIndex((level) => level.id === activeEffort));
		const effortSeg =
			effortChoices.length === 0
				? null
				: React.createElement(
					'div',
					{
						className: C.seg,
						role: 'radiogroup',
						'aria-label': '思考强度',
						title: '思考强度：' + (hasActiveEffort ? effortLabel + (isDefaultEffort ? '（模型默认）' : '') : '跟随模型默认（未显式选择）'),
					},
					/* One thumb, translated by whole segments; the percentage is
					   of the thumb's own width, so index*100% lands on each stop.
					   The thumb HIDES when nothing is chosen: many models declare
					   no defaultEffort and the host leaves the choice unset —
					   parking the pill on the first stop would claim a selection
					   that does not exist. */
					React.createElement('span', {
						className: C.segThumb,
						'aria-hidden': 'true',
						style: {
							width: 'calc((100% - 4px) / ' + effortChoices.length + ')',
							transform: 'translateX(' + effortIndex * 100 + '%)',
							opacity: hasActiveEffort ? 1 : 0,
						},
					}),
					effortChoices.map((level, segIndex) => {
						const chosen = activeEffort === level.id;
						/* Pending marks the level a live operation names; the thumb
						   and aria-checked keep following the host's current. */
						const pending =
							feedback !== null &&
							feedback.state !== 'failed' &&
							feedback.target.kind === 'effort' &&
							feedback.target.effort === level.id;
						return React.createElement(
							'button',
							{
								type: 'button',
								key: level.id,
								className: C.segItem,
								role: 'radio',
								'aria-checked': chosen ? 'true' : 'false',
								'data-lg-effort': level.id,
								'data-lg-pending': pending ? 'true' : undefined,
								title: level.description || level.name || level.id,
								onClick: () => pickEffort(level.id),
								onKeyDown: (event) => {
									const count = effortChoices.length;
									let next = null;
									if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(segIndex + 1, count - 1);
									else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(segIndex - 1, 0);
									else if (event.key === 'Home') next = 0;
									else if (event.key === 'End') next = count - 1;
									if (next === null) return;
									event.preventDefault();
									const target = effortChoices[next];
									pickEffort(target.id);
									const node = effortButtonsRef.current[target.id];
									if (node && typeof node.focus === 'function') {
										try { node.focus(); } catch (e) {}
									}
								},
								/* Kept for the focus restore after an all-card
								   operation completes. */
								ref: (node) => {
									if (node === null) delete effortButtonsRef.current[level.id];
									else effortButtonsRef.current[level.id] = node;
								},
							},
							level.name || level.id
						);
					})
				);

		/* Which providers and models the card lists by default. A configured
		   selection narrows both levels; an absent one leaves the picker exactly
		   as it was before the setting existed, and the rest of the catalog
		   stays one click away.

		   The PAIR is the unit. A provider appears when it is pinned, and under
		   it only the models whose id was selected — kept in catalog order, so
		   narrowing never reshuffles the list the user is looking at. */
		const quickProviders = quick === null ? [] : quick.providers;

		/* `models[id]` is the explicit model choice for one pinned provider.
		   NO entry (`undefined`) means the provider was pinned before its models
		   were ever narrowed, so all of them show — including models the catalog
		   gained after the pin, which is why "not configured" must not be
		   materialised into an id list anywhere. An array, even an EMPTY one, is
		   an explicit choice and is honoured as written. The test is an OWN
		   property on purpose: a miss must fall back to "show everything"
		   (harmless), never to a prototype method or a stale key's list. */
		const modelEntryFor = (providerId) => {
			if (quick === null) return undefined;
			const map = quick.models;
			return Object.prototype.hasOwnProperty.call(map, providerId) ? map[providerId] : undefined;
		};

		const pinnedGroups = groups.filter((group) => quickProviders.indexOf(group.id) >= 0);
		const hasQuick = pinnedGroups.length > 0;
		const currentGroupId = (() => {
			if (current === null) return null;
			for (const group of groups) {
				if (group.id === current.provider || slugOf(group.id) === slugOf(current.provider)) return group.id;
			}
			return null;
		})();
		const missingCurrentGroup =
			hasQuick && currentGroupId !== null && !pinnedGroups.some((group) => group.id === currentGroupId)
				? groups.filter((group) => group.id === currentGroupId)
				: [];
		/* The rows one pinned provider contributes. No entry → its whole list.
		   Otherwise exactly the chosen ids, PLUS the running model when it lives
		   under this provider: a provider whose every model was deselected then
		   contributes a single-row section instead of vanishing, so the model
		   the session is actually using can never be filtered out of sight. The
		   same clause re-admits the current model when a non-empty entry simply
		   omits it. */
		const rowsFor = (group) => {
			const all = group.models || [];
			const entry = modelEntryFor(group.id);
			if (entry === undefined) return all;
			const here = current !== null && currentGroupId === group.id;
			return all.filter((model) => entry.indexOf(model.id) >= 0 || (here && model.id === current.model));
		};
		/* The current provider's group leads when it is not pinned: the user
		   opened the picker with that model running, so its row — and the
		   effort ladder under it — should be visible without scrolling past
		   28 pinned rows to reach it. An unpinned group is never narrowed: its
		   models were never configured, so it shows what it always showed. */
		const wholeGroup = (group) => ({ group, models: group.models || [] });
		const pinnedEntries = pinnedGroups.map((group) => ({ group, models: rowsFor(group) }));
		const shownGroups = !hasQuick ? groups.map(wholeGroup) : missingCurrentGroup.map(wholeGroup).concat(pinnedEntries);
		const allFilter = allQuery.trim() === '' ? null : normalise(allQuery);

		/* Flat lists and index maps for grouped combobox / listbox keyboard
		   navigation, visible active item tracking, and recovery when results
		   are filtered or removed. */
		const flatOf = (entries, filter) => {
			const flat = [];
			for (const entry of entries) {
				for (const model of entry.models || []) {
					if (filter === null || normalise(model.name || model.id).indexOf(filter) >= 0) {
						flat.push({ group: entry.group, model });
					}
				}
			}
			return flat;
		};
		const mainFlat = flatOf(shownGroups, filtered);
		const allFlat = flatOf(groups.map(wholeGroup), allFilter);
		const mapOf = (flat) => {
			const map = new Map();
			for (let i = 0; i < flat.length; i++) {
				map.set(flat[i].group.id + '\u0000' + flat[i].model.id, i);
			}
			return map;
		};
		const mainIndexMap = mapOf(mainFlat);
		const allIndexMap = mapOf(allFlat);

		const clampActive = (value, count) => (value === null || count === 0 ? null : Math.min(value, count - 1));
		const activeMainIdx = clampActive(activeMain, mainFlat.length);
		const activeAllIdx = clampActive(activeAll, allFlat.length);

		const mainKey = (event) => {
			const count = mainFlat.length;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				if (count === 0) return;
				if (event.key === 'Home') setActiveMain(0);
				else if (event.key === 'End') setActiveMain(count - 1);
				else if (event.key === 'ArrowDown') setActiveMain(activeMainIdx === null ? 0 : Math.min(activeMainIdx + 1, count - 1));
				else setActiveMain(activeMainIdx === null ? count - 1 : Math.max(activeMainIdx - 1, 0));
				return;
			}
			if (event.key === 'Enter' && activeMainIdx !== null && mainFlat[activeMainIdx]) {
				event.preventDefault();
				const pick = mainFlat[activeMainIdx];
				select(pick.group, pick.model, false);
			}
		};

		const allKey = (event) => {
			const count = allFlat.length;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				if (count === 0) return;
				if (event.key === 'Home') setActiveAll(0);
				else if (event.key === 'End') setActiveAll(count - 1);
				else if (event.key === 'ArrowDown') setActiveAll(activeAllIdx === null ? 0 : Math.min(activeAllIdx + 1, count - 1));
				else setActiveAll(activeAllIdx === null ? count - 1 : Math.max(activeAllIdx - 1, 0));
				return;
			}
			if (event.key === 'Enter' && activeAllIdx !== null && allFlat[activeAllIdx]) {
				event.preventDefault();
				const pick = allFlat[activeAllIdx];
				select(pick.group, pick.model, true);
			}
		};

		/* ------------------------------------------------------------------ *
		 * Selection feedback note: failure and unconfirmed states are
		 * visible, actionable, and name their target. Pending and
		 * acknowledged states mark the rows themselves instead — a waiting
		 * state is not a fact worth interrupting the list for.
		 * ------------------------------------------------------------------ */
		const errorText = (error) => {
			if (error == null) return '未知错误';
			if (typeof error === 'string') return error;
			if (error.message !== undefined && error.message !== null) return String(error.message);
			try {
				return JSON.stringify(error);
			} catch (failed) {
				return String(error);
			}
		};
		const modelLabel = (providerId, modelId) => {
			for (const group of groups) {
				if (group.id !== providerId) continue;
				for (const model of group.models || []) if (model.id === modelId) return model.name || model.id;
			}
			return modelId;
		};
		const feedbackNote = (() => {
			if (feedback === null) return null;
			if (feedback.state !== 'failed' && feedback.state !== 'unconfirmed') return null;
			const targetName =
				feedback.target.kind === 'effort'
					? '思考强度「' + (feedback.target.effort == null ? '' : feedback.target.effort) + '」'
					: '「' + modelLabel(feedback.target.provider, feedback.target.model) + '」';
			const whereNow = current === null ? '未选择' : '「' + currentLabel + '」';
			const text =
				feedback.state === 'failed'
					? '未能切换到' + targetName + '：' + errorText(feedback.error) + '。当前仍为' + whereNow + '。'
					: '切换到' + targetName + '的请求已发送，但 8 秒内未得到确认。当前仍为' + whereNow + '。';
			return React.createElement(
				'div',
				{ className: 'lg-picker-note', role: 'alert', 'data-lg-note': feedback.state },
				React.createElement('span', null, text),
				React.createElement('button', { type: 'button', className: 'lg-picker-note-action', onClick: retryFeedback }, '重试')
			);
		})();

		/* ---- catalog states, all read from the public snapshot ------------ *
		 * loading | empty | error | partial | filtered no-match. Partial
		 * failures describe AVAILABILITY of catalog providers: an
		 * explanatory note, never a block — and never a retry affordance,
		 * because the host may serve load() from an already-ready catalog's
		 * cache, so a "refresh" here would promise a re-probe that may not
		 * happen. */
		const catalogEmpty = (() => {
			if (groups.length > 0) return null;
			const loading =
				snapshot === null ||
				snapshot.pending === true ||
				snapshot.status === undefined ||
				snapshot.status === null ||
				snapshot.status === 'loading';
			if (loading) return React.createElement('div', { className: C.empty, 'data-lg-note': 'loading' }, '正在读取模型…');
			if (snapshot && snapshot.error) {
				return React.createElement(
					'div',
					{ className: C.empty, 'data-lg-note': 'error' },
					React.createElement('span', null, '模型列表读取失败：' + errorText(snapshot.error)),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'lg-picker-note-action',
							onClick: () => {
								try {
									if (directory && typeof directory.load === 'function') directory.load();
								} catch (error) {
									/* the store reports its own failures */
								}
							},
						},
						'重试'
					)
				);
			}
			return React.createElement('div', { className: C.empty, 'data-lg-note': 'empty' }, '暂无可用模型');
		})();
		const partialNote = (() => {
			if (groups.length === 0) return null;
			const failures = snapshot && snapshot.failures && typeof snapshot.failures === 'object' ? Object.keys(snapshot.failures) : [];
			if (failures.length === 0) return null;
			return React.createElement(
				'div',
				{ className: 'lg-picker-note lg-picker-note-catalog', 'data-lg-note': 'partial' },
				'部分供应商暂不可用（' + failures.join('、') + '），以下为当前可用模型。'
			);
		})();
		const matchesAny = (entries, filter) =>
			filter === null ||
			entries.some((entry) => entry.models.some((model) => normalise(model.name || model.id).indexOf(filter) >= 0));
		const noneMatch =
			groups.length > 0 && shownGroups.length > 0 && filtered !== null && !matchesAny(shownGroups, filtered)
				? React.createElement(
						'div',
						{ className: C.empty, 'data-lg-note': 'nomatch' },
						React.createElement('span', null, '没有匹配“' + query.trim() + '”的模型'),
						React.createElement(
							'button',
							{ type: 'button', className: 'lg-picker-note-action', onClick: () => setQuery('') },
							'清除搜索'
						)
					)
				: null;
		const allNoneMatch =
			groups.length > 0 && allFilter !== null && !matchesAny(groups.map(wholeGroup), allFilter)
				? React.createElement(
						'div',
						{ className: C.empty, 'data-lg-note': 'nomatch' },
						React.createElement('span', null, '没有匹配“' + allQuery.trim() + '”的模型'),
						React.createElement(
							'button',
							{ type: 'button', className: 'lg-picker-note-action', onClick: () => setAllQuery('') },
							'清除搜索'
						)
					)
				: null;

		/* The card's footer holds only the catalog door. It lives OUTSIDE the
		   scrolling body: an entry that only appears after scrolling a 28-row
		   list is an entry most users never see. The effort control moved up
		   into the card, next to what it configures. */
		const foot =
			!hasQuick || filtered !== null
				? null
				: React.createElement(
					'div',
					{ className: 'lg-picker-foot' },
					React.createElement(
						'button',
						{ type: 'button', className: C.more, onClick: () => setAllOpen(true), ref: allOpenerRef },
						React.createElement('span', null, '所有供应商'),
						React.createElement('span', { className: C.count }, groups.length),
						React.createElement('span', { className: C.chevron, 'aria-hidden': 'true' }, React.createElement('svg', { viewBox: '0 0 12 12', width: 12, height: 12 }, React.createElement('path', { d: 'M4.5 3 7.5 6l-3 3', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round' })))
					)
				);

		const card = !open
			? null
			: React.createElement(
					'div',
					{
						className: C.card,
						role: 'dialog',
						'aria-label': '模型',
						ref: cardRef,
						'data-lg-placement': placement === null ? undefined : placement.side,
						style: placement === null ? { visibility: 'hidden' } : { top: placement.top + 'px', left: placement.left + 'px' },
					},
					React.createElement(
						'div',
						{ className: C.search },
						React.createElement('input', {
							type: 'search',
							placeholder: '搜索模型',
							value: query,
							onChange: (event) => setQuery(event.target.value),
							onKeyDown: mainKey,
							'aria-label': '搜索模型',
							role: 'combobox',
							'aria-expanded': 'true',
							'aria-controls': 'lg-picker-list',
							'aria-autocomplete': 'list',
							'aria-activedescendant': activeMainIdx === null ? undefined : 'lg-picker-opt-' + activeMainIdx,
						}),
						/* The rate chip states the SELECTED provider's own clock:
						   DeepSeek prices, 智谱 quota, and nothing at all for a
						   provider we have no schedule for — a wrong chip is worse
						   than no chip. */
						activePrice === null
							? null
							: React.createElement(
								'span',
								{ className: C.badge, 'data-lg-tone': activePrice.peak ? 'peak' : 'off', title: activePrice.note },
								React.createElement('span', { className: 'lg-picker-badge-dot', 'aria-hidden': 'true' }),
								activePrice.peak ? '高峰' : '空闲',
								React.createElement('b', null, factorText(activePrice.factor)),
								activePrice.switchAt === null ? null : React.createElement('em', null, humanLeft(activePrice.switchAt - Date.now()) + '后转' + (activePrice.peak ? '空闲' : '高峰'))
							)
					),
					/* The effort control rides with the list, not in a pane and
					   not at the card's foot: it is a property of the selected
					   model, on screen at the same time as the rows. */
					effortSeg,
					feedbackNote,
					groups.length === 0
						? catalogEmpty
						: React.createElement(
							'div',
							{
								className: 'lg-picker-body',
								role: 'listbox',
								'aria-label': '模型列表',
								id: 'lg-picker-list',
							},
							partialNote, noneMatch !== null ? noneMatch : shownGroups.map((entry) => sectionFor(entry.group, entry.models, undefined, false, mainIndexMap))
						),
					foot
				);

		/* The second card: every provider, for the models the quick list leaves
		   out. Same glass, same rows — it is the same list with a wider filter, so
		   it must not read as a different kind of surface. */
		const allCard = allOpen
			? React.createElement(
					'div',
					{
						className: C.card + ' ' + C.cardAll,
						role: 'dialog',
						'aria-label': '所有供应商',
						ref: allRef,
						style: allPlacement === null ? { visibility: 'hidden' } : { top: allPlacement.top + 'px', left: allPlacement.left + 'px' },
					},
					React.createElement(
						'div',
						{ className: C.search },
						React.createElement('input', {
							type: 'search',
							placeholder: '搜索全部模型',
							value: allQuery,
							onChange: (event) => setAllQuery(event.target.value),
							onKeyDown: allKey,
							'aria-label': '搜索全部模型',
							role: 'combobox',
							'aria-expanded': 'true',
							'aria-controls': 'lg-picker-alist',
							'aria-autocomplete': 'list',
							'aria-activedescendant': activeAllIdx === null ? undefined : 'lg-picker-aopt-' + activeAllIdx,
						})
					),
					React.createElement(
						'div',
						{
							className: 'lg-picker-body',
							role: 'listbox',
							'aria-label': '全部模型列表',
							id: 'lg-picker-alist',
						},
						/* A pick made here closes this card when the operation
						   completes confirmed — `fromAll` carries that intent
						   into select() and completeOp(). */
						allNoneMatch !== null ? null : groups.map((group) => sectionFor(group, group.models || [], allFilter, true, allIndexMap)),
						partialNote,
						allNoneMatch
					)
			  )
			: null;

		/* The card is portalled to <body>. It must be: several ancestors of the
		   composer carry a backdrop-filter, and a filtered element becomes the
		   CONTAINING BLOCK for its fixed-position descendants — so a card left in
		   the composer's subtree resolves `position:fixed` against the composer
		   instead of the window and lands at the wrong place entirely. */
		return React.createElement(
			'span',
			{ className: C.root, ref: anchor },
			trigger,
			ReactDOMShared.createPortal(card, document.body),
			allCard === null ? null : ReactDOMShared.createPortal(allCard, document.body)
		);
	}

	/** Mount the seat into the composer's model slot, hiding the host trigger. */
	function mount() {
		const slot = document.querySelector('[data-slot="conversation.input.model"]');
		if (slot === null) return null;
		const host = slot.firstElementChild;
		if (host !== null) host.setAttribute('data-lg-picker-host', '');
		let seat = slot.querySelector('.' + C.root);
		if (seat === null) {
			seat = document.createElement('span');
			seat.className = C.root;
			slot.appendChild(seat);
		}
		const root = ReactDOM.createRoot(seat);
		root.render(React.createElement(Picker));
		return () => {
			try {
				root.unmount();
			} catch (error) {
				/* already gone */
			}
			if (host !== null) host.removeAttribute('data-lg-picker-host');
			if (seat && seat.parentNode) seat.parentNode.removeChild(seat);
		};
	}

	return { mount };
}
