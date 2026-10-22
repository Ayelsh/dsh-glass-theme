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
function createPicker(require, ctx, catalog) {
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
	   Which providers are "quick" is the user's choice, and it has to survive
	   a reload, so it lives in localStorage under a namespaced key. The
	   reference keeps this in its host settings; a skin has no host
	   configuration surface of its own that the client can read, and inventing
	   a round trip for six booleans would be worse than the six booleans. */
	const QUICK_KEY = 'dsh-glass-theme:quick-providers';
	const QUICK_MAX = 4;

	/* The picker and the settings page must agree on the limit; the number lives
	   here and settings-section.js keeps its own copy, so a change has to touch
	   both. They are separate files because they are spliced separately. */
	function readQuick() {
		try {
			const raw = window.localStorage.getItem(QUICK_KEY);
			if (raw === null) return null;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return null;
			return parsed.filter((value) => typeof value === 'string');
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

	function writeQuick(list) {
		try {
			window.localStorage.setItem(QUICK_KEY, JSON.stringify(list));
		} catch (error) {
			/* a private-mode quota failure must not break the picker */
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
				setPlacement({ top: Math.round(top), left: Math.round(left) });
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

		/* Close on outside press and on Escape. */
		React.useEffect(() => {
			if (!open) return undefined;
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

		/* `fromAll` marks a pick in the second card. Choosing a model keeps the
		   picker open either way — the effort ladder that usually follows is
		   one click away in the same card, and closing here would force the
		   two-open dance the inline effort control exists to avoid. The
		   all-card itself closes after a pick from it: its job (reach beyond
		   the pinned providers) is done, and the main card — with the effort
		   control — stays behind it. */
		const select = (group, model, fromAll) => {
			if (!directory || typeof directory.select !== 'function') return;
			try {
				/* Carry the new model's own default effort: `select` otherwise
				   re-derives it, and passing a stale ladder id from the previous
				   model is rejected by the host. */
				const next = model && model.reasoning && model.reasoning.defaultEffort !== undefined ? { reasoningEffort: model.reasoning.defaultEffort } : {};
				const outcome = directory.select(Object.assign({ provider: group.id, model: model.id }, next));
				if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
			} catch (error) {
				/* the failure is already reported by the store */
			}
			if (fromAll) {
				setAllOpen(false);
				setAllQuery('');
			}
		};

		const pickEffort = (level) => {
			if (!directory || typeof directory.select !== 'function' || current === null) return;
			try {
				const outcome = directory.select({ provider: current.provider, model: current.model, reasoningEffort: level });
				if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
			} catch (error) {
				/* the failure is already reported by the store */
			}
			/* The card stays open: the effort control is inline now, and the
			   pill travelling under the eye IS the confirmation. */
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
				onClick: () => {
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

		const sectionFor = (group, models, filterOverride, fromAll) => {
			const filter = filterOverride === undefined ? filtered : filterOverride;
			const shown = models.filter((model) => filter === null || normalise(model.name || model.id).indexOf(filter) >= 0);
			if (shown.length === 0) return null;
			return React.createElement(
				'section',
				{ className: C.section, key: group.id },
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
					return React.createElement(
						'button',
						{
							type: 'button',
							/* Two rows can share an id across providers, and two
							   workbuddy rows can share a LABEL, so the key is the pair
							   plus the label. */
							key: group.id + '\u0000' + model.id + '\u0000' + (model.name || ''),
							className: C.option,
							role: 'menuitemradio',
							'aria-checked': chosen ? 'true' : 'false',
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
						React.createElement('span', { className: C.check, 'aria-hidden': 'true' }, chosen ? '✓' : '')
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
					effortChoices.map((level) => {
						const chosen = activeEffort === level.id;
						return React.createElement(
							'button',
							{
								type: 'button',
								key: level.id,
								className: C.segItem,
								role: 'radio',
								'aria-checked': chosen ? 'true' : 'false',
								title: level.description || level.name || level.id,
								onClick: () => pickEffort(level.id),
							},
							level.name || level.id
						);
					})
				);

		/* Which providers the card lists by default. A configured list narrows
		   it; an empty one leaves the picker exactly as it was before the setting
		   existed. The rest of the catalog stays one click away. The session's
		   current model is NOT guaranteed to sit inside the pinned set — a
		   model picked from 所有供应商 (or set by the host) can belong to any
		   provider — so its group is shown alongside the pinned ones whenever
		   it is missing there; otherwise switching to a sibling model would
		   mean a detour through the second card. */
		const quickList = quick === null ? [] : quick;
		const pinnedGroups = groups.filter((group) => quickList.indexOf(group.id) >= 0);
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
		/* The current provider's group leads when it is not pinned: the user
		   opened the picker with that model running, so its row — and the
		   effort ladder under it — should be visible without scrolling past
		   28 pinned rows to reach it. */
		const shownGroups = !hasQuick ? groups : missingCurrentGroup.concat(pinnedGroups);
		const allFilter = allQuery.trim() === '' ? null : normalise(allQuery);

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
						{ type: 'button', className: C.more, onClick: () => setAllOpen(true) },
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
							'aria-label': '搜索模型',
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
					groups.length === 0
						? React.createElement('div', { className: C.empty }, snapshot && snapshot.status === 'loading' ? '正在读取模型…' : '暂无可用模型')
						: React.createElement(
							'div',
							{ className: 'lg-picker-body' },
							shownGroups.map((group) => sectionFor(group, group.models || []))
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
							'aria-label': '搜索全部模型',
						})
					),
					React.createElement(
						'div',
						{ className: 'lg-picker-body' },
						/* A pick made here closes this card and leaves the main
						   one behind — `fromAll` carries that intent into
						   select(). */
						groups.map((group) => sectionFor(group, group.models || [], allFilter, true))
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
