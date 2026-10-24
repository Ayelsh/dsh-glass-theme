/**
 * Liquid Glass — client half.
 *
 * Two jobs:
 *
 *   1. get the stylesheets into the document, in order, owned by this package,
 *      and take them out again on unload. Everything visual lives in src/css/.
 *
 *   2. DECORATE two surfaces the skin does not own and the app does not
 *      describe: the composer model picker (rendered by dsh-codex-subscription)
 *      and — for the pricing chip — DeepSeek's published peak schedule. The app
 *      exposes a model's id and label and nothing else, so provider icons,
 *      one-line descriptions and the peak/off-peak factor can only come from
 *      here. src/catalog.js holds that data; this file holds the logic.
 *
 * Deliberately NOT done here:
 *   - no token registration via ctx.theme.overrideTokens(): the theme service
 *     writes overrides as inline custom properties on <body>, which outranks any
 *     stylesheet for body itself and would have to duplicate all ~150 tokens in
 *     two modes. src/css/tokens.css re-keys the same names on `body` and
 *     `body[data-ds-dark-theme]` instead — one source of truth, mode-aware by
 *     the app's own attribute.
 *   - no slot registration: the skin restyles shipped surfaces rather than
 *     adding new ones, so it must not take over any slot the app renders into.
 *   - no React: the host components are not ours to re-render, so decoration is
 *     additive DOM that the app can wipe at any time — which it does, on every
 *     re-render. The decorator therefore re-heals itself on a poll instead of
 *     assuming it runs once.
 *
 * Built by tools/build.mjs, which inlines src/css/*.css into `sheets` and
 * src/catalog.js into `catalog`. Edit the sources, never lib/client.js.
 */

window.__ModuleLoader__.load({
	id: 'dsh-glass-theme',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		/** @type {{ id: string, css: string }[]} — inlined at build time. */
		const sheets = /*__SHEETS__*/null;

		/** @type {object} — inlined from src/catalog.js at build time. */
		const catalog = /*__CATALOG__*/null;

		/** @type {Function} — inlined from src/picker.js at build time. */
		const createPicker = /*__PICKER__*/null;

		/** @type {Function} — inlined from src/stats.js at build time. */
		const createStats = /*__STATS__*/null;

		/** @type {Function} — inlined from src/settings-section.js at build time. */
		const createSettingsSection = /*__SETTINGS_SECTION__*/null;

		/** @type {Function} — inlined from src/workspace.js at build time. */
		const createWorkspace = /*__WORKSPACE__*/null;

		/** Build stamp, inlined at build time. */
		const built = /*__BUILT__*/"";

		const PACKAGE = 'dsh-glass-theme';

		/* ================================================================== *
		 * Stylesheet mounting
		 * ================================================================== */

		/**
		 * Append the sheets, then re-append them so they sit after the shipped
		 * stylesheets. Ordering matters twice over: the app injects its CSS-module
		 * tags as each client module loads, and several shipped rules win on equal
		 * specificity alone. Moving a style element to the end of <head> re-runs it
		 * in that position, which is cheaper and safer than escalating specificity
		 * everywhere.
		 */
		const mount = () => {
			let raising = false;

			/**
			 * Put every sheet in the document and move it to the end of <head>.
			 *
			 * Appending once at boot is not enough. Three things take the skin back
			 * out from under us, all of them silent:
			 *
			 *   - the shell owns every `style[data-plugin-css]` tag and rebuilds its
			 *     set when the plugin list settles, which drops tags it never
			 *     registered (ours);
			 *   - its own CSS modules are injected as their client modules load, so
			 *     a later tag at equal specificity beats ours (only a handful of the
			 *     skin's rules carry `!important`);
			 *   - a hot reload disposes this effect, and the next mount used to skip
			 *     sheets whose tag it could still see — a tag the old disposer then
			 *     removed, leaving nothing behind.
			 *
			 * So the mount is idempotent and re-entrant: existing tags are reused and
			 * re-appended, missing ones are rebuilt from `sheets`.
			 */
			const raise = () => {
				if (raising) return;
				const head = document.head ?? document.documentElement ?? null;
				if (head === null || typeof document.createElement !== 'function') return;
				raising = true;
				try {
					for (const sheet of sheets) {
						let tag = document.querySelector(`style[data-plugin-css="${sheet.id}"]`);
						if (tag === null || tag === undefined) {
							tag = document.createElement('style');
							tag.dataset.plugin = PACKAGE;
							tag.dataset.pluginCss = sheet.id;
							tag.textContent = sheet.css;
						}
						// Append-or-move: the skin is always the last cascade layer.
						head.appendChild(tag);
					}
				} finally {
					raising = false;
				}
			};

			raise();
			// The shell installs the theme layer during boot; re-raise once the
			// first paint settles so the skin always lands on top of it.
			if (typeof requestAnimationFrame === 'function') requestAnimationFrame(raise);

			const stops = [];

			// Another stylesheet arriving is the normal case, not an error: wait for
			// the batch to finish (rAF) and only then take the last slot back.
			if (typeof MutationObserver === 'function' && document.head !== null && document.head !== undefined) {
				let queued = false;
				const flush = () => {
					queued = false;
					raise();
				};
				const observer = new MutationObserver((records) => {
					if (raising || queued) return;
					let relevant = false;
					for (const record of records) {
						for (const node of record.addedNodes ?? []) {
							const name = node === null || node === undefined ? '' : node.nodeName;
							if (name === 'STYLE' || name === 'LINK') {
								relevant = true;
								break;
							}
						}
						if (relevant) break;
					}
					if (!relevant) return;
					queued = true;
					if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
					else if (typeof setTimeout === 'function') setTimeout(flush, 0);
					else flush();
				});
				observer.observe(document.head, { childList: true });
				stops.push(() => observer.disconnect());
			}

			// Removal cannot be observed as an addition, and a shell rebuild that
			// replaces <head> wholesale fires nothing we can hook. A cheap poll is
			// the backstop; it exits as soon as the document is gone.
			if (typeof setInterval === 'function' && typeof document.querySelectorAll === 'function') {
				const timer = setInterval(() => {
					try {
						if (document.visibilityState === 'hidden') return;
						const live = document.querySelectorAll(`style[data-plugin="${PACKAGE}"]`).length;
						const last = document.head === null || document.head === undefined ? null : document.head.lastElementChild;
						const ours = last !== null && last !== undefined && last.dataset !== undefined && last.dataset.plugin === PACKAGE;
						if (live < sheets.length || !ours) raise();
					} catch (error) {
						/* the document went away mid-poll */
					}
				}, 750);
				stops.push(() => clearInterval(timer));
			}

			return () => {
				for (const stop of stops) {
					try {
						stop();
					} catch (error) {
						/* already stopped */
					}
				}
				for (const tag of document.querySelectorAll(`style[data-plugin="${PACKAGE}"]`)) tag.remove();
			};
		};

		/** Mark the document so the skin's own rules can key on being active. */
		const stamp = () => {
			const root = document.documentElement;
			root.dataset.dshGlassTheme = '';
			root.dataset.dshGlassThemeBuilt = built;
			const mark = () => {
				if (document.body !== null && !document.body.hasAttribute('data-dsh-glass-theme')) {
					document.body.setAttribute('data-dsh-glass-theme', '');
				}
			};
			mark();
			if (document.body === null && typeof document.addEventListener === 'function') {
				document.addEventListener('DOMContentLoaded', mark, { once: true });
			}
		};

		/* ================================================================== *
		 * Input modality
		 * ================================================================== */

		/**
		 * Track the last input modality on `html[data-lg-input]`.
		 *
		 * The app autofocuses the first control of every dialog it opens. Chromium
		 * reports that programmatic focus as `:focus-visible`, so a plain
		 * `:focus-visible` ring paints on settings panels the user opened with a
		 * mouse — a ring where no keyboard was involved. Gating on the last real
		 * input separates the two cases: pointer users never see it, keyboard users
		 * always do.
		 *
		 * Listens in the CAPTURE phase because the app stops propagation on several
		 * of its own controls, and a missed keydown would strand the document in
		 * pointer mode with no focus ring at all.
		 */
		const trackModality = () => {
			const root = document.documentElement;
			const set = (mode) => {
				if (root.dataset.lgInput === mode) return;
				root.dataset.lgInput = mode;
			};
			set('pointer');
			const keyboard = (event) => {
				// Modifier keys alone do not mean keyboard navigation: Ctrl+C during
				// a mouse-driven session must not arm the ring.
				if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
				set('keyboard');
			};
			const pointer = () => set('pointer');
			const options = { capture: true, passive: true };
			const events = [
				['keydown', keyboard],
				['pointerdown', pointer],
				['mousedown', pointer],
				['touchstart', pointer],
			];
			for (const [type, handler] of events) document.addEventListener(type, handler, options);
			return () => {
				for (const [type, handler] of events) document.removeEventListener(type, handler, options);
			};
		};

		/* ================================================================== *
		 * Model menu decoration
		 *
		 * The picker belongs to dsh-codex-subscription. Its markup, measured:
		 *
		 *   div.codexModelSelectMenu                       (fixed, flex column)
		 *     div.codexModelSelectGroups[role=menu]
		 *       section[role=group][data-menu-group]       × 6 providers
		 *         div[data-menu-group-heading]             provider name
		 *         button.codexModelSelectOption            × N models
		 *           span.codexModelSelectOptionCopy
		 *             span.codexModelSelectOptionName      "Fast · x0.34"
		 *           span.codexModelSelectCheck
		 *
		 * Everything below is ADDITIVE: new siblings and new attributes, never a
		 * rewrite of the plugin's own structure, so a re-render loses at most one
		 * decoration pass. The poll puts it back.
		 * ================================================================== */

		/** Attribute names, kept together because the gate reads this file for them. */
		const ATTR = {
			header: 'data-lg-header',
			quick: 'data-lg-quick',
			chip: 'data-lg-chip',
			price: 'data-lg-price',
			state: 'data-lg-state',
			factor: 'data-lg-factor',
			sep: 'data-lg-sep',
			next: 'data-lg-next',
			mark: 'data-lg-mark',
			note: 'data-lg-note',
			toggle: 'data-lg-toggle',
			provider: 'data-lg-provider',
			collapsed: 'data-lg-collapsed',
			filtered: 'data-lg-filtered',
			mult: 'data-lg-mult',
			tone: 'data-lg-tone',
			desc: 'data-lg-desc',
			sig: 'data-lg-sig',
		};

		/** `data-lg-chip` carries the provider key; this is its press state. */
		const CHIP_ON = 'data-lg-on';

		const norm = (value) => value.toLowerCase().replace(/[\s._·\-–—]+/g, '');

		/** Model keys are normalised once, so lookups are exact and case-free. */
		const descriptionByKey = (() => {
			const map = new Map();
			for (const [key, value] of Object.entries(catalog.descriptions)) map.set(norm(key), value);
			return map;
		})();

		/**
		 * The rule tables ship as STRINGS, not regexes, because catalog.js is
		 * spliced into the bundle as source text and a literal `/…/` there would
		 * depend on how the splice is escaped. Compiling them once at startup
		 * keeps that data file plain and the matching fast.
		 */
		const compileRules = (rules) => {
			if (!Array.isArray(rules)) return [];
			const out = [];
			for (const rule of rules) {
				if (rule === null || typeof rule.test !== 'string') continue;
				let re = null;
				try {
					re = new RegExp(rule.test, 'i');
				} catch {
					continue;
				}
				out.push({ re, text: rule.text });
			}
			return out;
		};
		const descriptionRules = compileRules(catalog.descriptionRules);
		const tierRules = compileRules(catalog.tierRules);

		/**
		 * Three sources, in decreasing authority: the hand-written table (a
		 * specific model, written by someone who looked it up), then the family
		 * rules (what the LINE is for), then the tier rules (what its SIZE suffix
		 * implies). The last two are the reference implementation's approach and
		 * are what keeps an unfamiliar reseller row from reading as unfinished.
		 */
		const descriptionFor = (label) => {
			const exact = catalog.descriptions[label] ?? descriptionByKey.get(norm(label));
			if (exact !== undefined) return exact;
			for (const rule of descriptionRules) if (rule.re.test(label)) return rule.text;
			for (const rule of tierRules) if (rule.re.test(label)) return rule.text;
			return '';
		};

		/** First matching family wins; the catalog lists specific names first. */
		const familyFor = (label) => {
			for (const family of catalog.families) if (family.test.test(label)) return family;
			return null;
		};

		/** workbuddy folds the price ratio into the label: "Fast · x0.34". */
		const MULTIPLIER_RE = /^(.*?)\s*·\s*x\s*([\d.]+)\s*$/;

		/* ---- peak / off-peak ------------------------------------------- */

		/**
		 * DeepSeek's published schedule, evaluated against BEIJING wall clock.
		 *
		 *   高峰 = 周一至周五 9:00–12:00、14:00–18:00（北京时间，不含法定节假日）
		 *   空闲 = 其余时段，价格恰为高峰的一半
		 *
		 * The holiday exclusion is real data, not a guess: `catalog.pricing.holidays`
		 * carries the 中国法定节假日 dates per year, because the published rule
		 * subtracts them from the weekday window. A year with no table falls back
		 * to the weekday rule alone — the chip still tells the truth about the
		 * window, it just stops promising holiday accuracy for that year.
		 *
		 * The factor is expressed relative to the CHEAPER baseline, so peak reads
		 * `2×` and off-peak reads `1×` — the same convention the reference uses.
		 */
		const peakCache = { at: 0, value: null };

		const peakInfo = () => {
			const now = Date.now();
			if (peakCache.value !== null && now - peakCache.at < 20000) return peakCache.value;

			/* The catalog moved to per-provider schedules (pricing.providers);
			   this legacy header only ever priced the first-party DeepSeek
			   account, so resolve that one schedule and fall back to the flat
			   pre-split shape so an old bundled catalog still renders. */
			const pricing = catalog.pricing || {};
			const deepseek = (pricing.providers && pricing.providers.deepseek) || pricing;
			const offsetMinutes =
				deepseek.utcOffsetMinutes != null ? deepseek.utcOffsetMinutes :
				pricing.utcOffsetMinutes != null ? pricing.utcOffsetMinutes : 480;
			const holidays = deepseek.holidays || pricing.holidays;
			const { windows, weekdaysOnly, peakFactor, offPeakFactor } = deepseek;
			const offset = offsetMinutes * 60000;

			const beijing = (ms) => {
				const date = new Date(ms + offset);
				const year = date.getUTCFullYear();
				const month = String(date.getUTCMonth() + 1).padStart(2, '0');
				const day = String(date.getUTCDate()).padStart(2, '0');
				return {
					weekday: date.getUTCDay(),
					minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
					ymd: `${year}-${month}-${day}`,
					md: `${month}-${day}`,
					year,
				};
			};
			/** A holiday closes the whole day, so it is off-peak at any hour. */
			const isHoliday = (stamp) => {
				const table = holidays && holidays[stamp.year];
				if (!Array.isArray(table)) return false;
				return table.indexOf(stamp.md) >= 0;
			};
			const isPeak = (ms) => {
				const stamp = beijing(ms);
				if (weekdaysOnly && (stamp.weekday === 0 || stamp.weekday === 6)) return false;
				if (isHoliday(stamp)) return false;
				for (const [from, to] of windows) if (stamp.minutes >= from && stamp.minutes < to) return true;
				return false;
			};

			const peak = isPeak(now);
			// The next boundary is at most 8 days out (a full week plus the
			// weekend either side); scan minute by minute rather than encode the
			// calendar twice.
			let switchAt = null;
			let at = Math.floor(now / 60000) * 60000 + 60000;
			for (let i = 0; i < 60 * 24 * 8 && switchAt === null; i++, at += 60000) {
				if (isPeak(at) !== peak) switchAt = at;
			}

			// Why it is off-peak right now, when that is a holiday rather than the
			// hour: the schedule has three different reasons and a reader who sees
			// 空闲 at 10:00 on a Wednesday deserves to know which one applies.
			const today = beijing(now);
			const reason = isHoliday(today) ? 'holiday' : today.weekday === 0 || today.weekday === 6 ? 'weekend' : 'window';

			/* DeepSeek states its factors from the cheaper baseline (peak 2×,
			   off 1×); peakFactor now carries the peak side directly, with the
			   reciprocal kept as the fallback for the old flat shape. */
			const peakFactorValue = peakFactor != null ? peakFactor : 1 / (offPeakFactor || 0.5);
			const value = { peak, factor: peak ? peakFactorValue : 1, switchAt, reason };
			peakCache.value = value;
			peakCache.at = now;
			return value;
		};

		/** Compact Chinese duration: "3 小时 26 分", "1 天 3 小时", "12 分". */
		const duration = (ms) => {
			const total = Math.max(0, Math.round(ms / 60000));
			const days = Math.floor(total / 1440);
			const hours = Math.floor((total % 1440) / 60);
			const minutes = total % 60;
			if (days > 0) return `${days} 天 ${hours} 小时`;
			if (hours > 0) return `${hours} 小时 ${minutes} 分`;
			return `${minutes} 分`;
		};

		/* ---- decoration state ------------------------------------------ */

		/** null = show every provider. Set by the quick-provider chips. */
		let activeProvider = null;

		/** section element -> true when the user collapsed it this page-life. */
		const collapsed = new WeakSet();

		const element = (target) => (target instanceof Element ? target : null);

		/* ---- header ---------------------------------------------------- */

		const buildChip = (provider) => {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.setAttribute(ATTR.chip, provider.key);
			chip.setAttribute(ATTR.tone, provider.tone);
			chip.setAttribute('aria-pressed', 'false');
			chip.title = `${provider.label} · ${provider.note}`;

			const mark = document.createElement('span');
			mark.setAttribute(ATTR.mark, '');
			mark.setAttribute('aria-hidden', 'true');
			mark.textContent = provider.mark;

			const label = document.createElement('span');
			label.textContent = provider.label;

			chip.append(mark, label);
			return chip;
		};

		const buildHeader = (menu) => {
			const header = document.createElement('div');
			header.setAttribute(ATTR.header, '');

			const quick = document.createElement('div');
			quick.setAttribute(ATTR.quick, '');
			quick.setAttribute('role', 'group');
			quick.setAttribute('aria-label', '快捷供应商');
			for (const provider of Object.values(catalog.providers)) quick.append(buildChip(provider));

			const price = document.createElement('div');
			price.setAttribute(ATTR.price, '');
			/* The note travels with the DeepSeek schedule in the catalog; the
			   literal is only the fallback for a catalog without one. */
			price.title =
				(catalog.pricing?.providers?.deepseek?.note) ||
				'高峰：北京时间周一至周五 9:00–12:00、14:00–18:00（中国法定节假日除外）；空闲时段价格为其一半。';

			const state = document.createElement('span');
			state.setAttribute(ATTR.state, '');

			const factor = document.createElement('span');
			factor.setAttribute(ATTR.factor, '');

			const sep = document.createElement('span');
			sep.setAttribute(ATTR.sep, '');
			sep.setAttribute('aria-hidden', 'true');
			sep.textContent = '·';

			const next = document.createElement('span');
			next.setAttribute(ATTR.next, '');

			price.append(state, factor, sep, next);
			header.append(quick, price);
			// The plugin's menu is a flex column, so `order` puts the header above
			// the group list without touching React's own child order.
			menu.append(header);
			return header;
		};

		const renderPrice = (price, show) => {
			price.hidden = !show;
			if (!show) return;
			const info = peakInfo();
			const state = price.querySelector(`[${ATTR.state}]`);
			const factor = price.querySelector(`[${ATTR.factor}]`);
			const next = price.querySelector(`[${ATTR.next}]`);
			if (state === null || factor === null || next === null) return;

			const label = info.peak ? '高峰' : '空闲';
			if (state.textContent !== label) state.textContent = label;
			state.setAttribute(ATTR.tone, info.peak ? 'peak' : 'off');

			// A holiday or a weekend is why the window is open at 10:00 on a
			// weekday; without the reason the chip reads as a broken clock.
			const reason = info.peak ? null : info.reason === 'holiday' ? '法定节假日' : info.reason === 'weekend' ? '周末' : null;
			if (reason === null) state.removeAttribute('data-lg-reason');
			else state.setAttribute('data-lg-reason', reason);

			const ratio = `≈${Number.isInteger(info.factor) ? info.factor : info.factor.toFixed(1)}×`;
			if (factor.textContent !== ratio) factor.textContent = ratio;

			const target = info.peak ? '空闲' : '高峰';
			const text =
				info.switchAt === null
					? ''
					: `${duration(info.switchAt - Date.now())}后转${target}`;
			if (next.textContent !== text) next.textContent = text;
		};

		/* ---- group headings -------------------------------------------- */

		/** Direct text children only, so our own injected spans never leak in. */
		const headingText = (heading) => {
			let text = '';
			for (const node of heading.childNodes) if (node.nodeType === 3) text += node.nodeValue;
			return text.trim();
		};

		const decorateHeading = (section, heading) => {
			const name = headingText(heading);
			const provider = catalog.providers[name] ?? null;
			if (provider !== null) section.setAttribute(ATTR.provider, provider.key);

			let mark = heading.querySelector(`:scope > [${ATTR.mark}]`);
			if (mark === null) {
				mark = document.createElement('span');
				mark.setAttribute(ATTR.mark, '');
				mark.setAttribute('aria-hidden', 'true');
				heading.prepend(mark);
			}
			const glyph = provider?.mark ?? '';
			if (mark.textContent !== glyph) mark.textContent = glyph;
			mark.setAttribute(ATTR.tone, provider?.tone ?? 'neutral');

			let note = heading.querySelector(`:scope > [${ATTR.note}]`);
			if (note === null) {
				note = document.createElement('span');
				note.setAttribute(ATTR.note, '');
				heading.append(note);
			}
			const noteText = provider?.note ?? '';
			if (note.textContent !== noteText) note.textContent = noteText;

			let toggle = heading.querySelector(`:scope > [${ATTR.toggle}]`);
			if (toggle === null) {
				toggle = document.createElement('button');
				toggle.type = 'button';
				toggle.setAttribute(ATTR.toggle, '');
				toggle.innerHTML =
					'<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
				heading.append(toggle);
			}
			toggle.setAttribute('aria-label', `收起或展开 ${name}`);
			toggle.setAttribute('aria-expanded', collapsed.has(section) ? 'false' : 'true');
		};

		/* ---- model rows ------------------------------------------------ */

		/**
		 * The option's own label, ignoring injected children.
		 *
		 * The multiplier badge lives INSIDE the name span so it can sit on the
		 * same baseline; reading `textContent` would then fold `×0.34` back into
		 * the label on the next pass and the multiplier would drift into the
		 * description lookup. Direct text nodes are the label; elements are ours.
		 */
		const ownText = (el) => {
			let text = '';
			for (const node of el.childNodes) if (node.nodeType === 3) text += node.nodeValue;
			return text;
		};

		/** Replace the element's own text, leaving injected children in place. */
		const setOwnText = (el, text) => {
			let written = false;
			for (const node of [...el.childNodes]) {
				if (node.nodeType !== 3) continue;
				if (written) node.nodeValue = '';
				else {
					node.nodeValue = text;
					written = true;
				}
			}
			if (!written) el.insertBefore(document.createTextNode(text), el.firstChild);
		};

		const decorateOption = (option) => {
			const name = option.querySelector('[class*="codexModelSelectOptionName"]');
			if (name === null) return;
			const copy = name.parentElement;
			if (copy === null) return;

			const full = ownText(name);
			const match = full.match(MULTIPLIER_RE);
			const bare = match === null ? full : match[1].trim();
			const multiplier = match === null ? '' : match[2];
			// Idempotent: once split, the label no longer matches the pattern, so
			// this writes at most once per render. React restores the original
			// text only when the label itself changes.
			if (full !== bare) setOwnText(name, bare);

			const family = familyFor(bare);
			let icon = option.querySelector(`:scope > [${ATTR.mark}]`);
			if (family === null) {
				if (icon !== null) icon.remove();
			} else {
				if (icon === null) {
					icon = document.createElement('span');
					icon.setAttribute(ATTR.mark, '');
					icon.setAttribute('aria-hidden', 'true');
					option.prepend(icon);
				}
				if (icon.textContent !== family.mark) icon.textContent = family.mark;
				icon.setAttribute(ATTR.tone, family.tone);
			}

			// Inside the name span, not beside it: `OptionCopy` is a column, so a
			// sibling badge lands on its own line and stretches the full width.
			let badge = name.querySelector(`:scope > [${ATTR.mult}]`);
			if (multiplier === '') {
				if (badge !== null) badge.remove();
			} else {
				if (badge === null) {
					badge = document.createElement('span');
					badge.setAttribute(ATTR.mult, '');
					name.append(badge);
				}
				const text = `×${multiplier}`;
				if (badge.textContent !== text) badge.textContent = text;
			}

			const description = descriptionFor(bare);
			let desc = copy.querySelector(`:scope > [${ATTR.desc}]`);
			if (description === '') {
				if (desc !== null) desc.remove();
			} else {
				if (desc === null) {
					desc = document.createElement('span');
					desc.setAttribute(ATTR.desc, '');
					// The plugin's own description slot, with its own styling. Reusing
					// the class is the point: the slot exists and is simply never filled
					// for model rows.
					desc.className = 'codexModelSelectOptionDescription';
					copy.append(desc);
				}
				if (desc.textContent !== description) desc.textContent = description;
			}
		};

		/* ---- one full pass --------------------------------------------- */

		const decorateModelMenu = () => {
			const menu = document.querySelector('[class~="codexModelSelectMenu"]');
			if (menu === null) return;
			const groups = menu.querySelector('[class*="codexModelSelectGroups"]');
			if (groups === null) return;

			const sections = groups.querySelectorAll('section[data-menu-group]');
			if (sections.length === 0) return;

			// Signature: re-walking 40 rows on every poll is pointless when nothing
			// about the list changed. Headings and counts identify a render.
			const signature = `${sections.length}:${groups.querySelectorAll('[role="menuitemradio"]').length}`;
			const settled = menu.getAttribute(ATTR.sig) === signature;
			const header = menu.querySelector(`:scope > [${ATTR.header}]`);

			if (!settled || header === null) {
				const built = header ?? buildHeader(menu);
				for (const section of sections) {
					const heading = section.querySelector('[data-menu-group-heading]');
					if (heading !== null) decorateHeading(section, heading);
					for (const option of section.querySelectorAll('button[role="menuitemradio"]')) {
						decorateOption(option);
					}
				}
				menu.setAttribute(ATTR.sig, signature);
				renderPrice(built.querySelector(`[${ATTR.price}]`), hasPricing(sections));
			} else {
				// The header survives; only the countdown is time-dependent.
				renderPrice(header.querySelector(`[${ATTR.price}]`), hasPricing(sections));
			}

			applyFilter(groups, sections);
		};

		/* This header can only render the DeepSeek clock (see peakInfo), so the
		   chip is shown exactly when a DeepSeek-account section is present —
		   not for any provider that merely has a schedule somewhere else. */
		const hasPricing = (sections) => {
			for (const section of sections) {
				const key = section.getAttribute(ATTR.provider);
				if (key !== null && catalog.pricing?.providers?.deepseek && key === 'deepseek') return true;
			}
			return false;
		};

		const applyFilter = (groups, sections) => {
			for (const section of sections) {
				const hide = activeProvider !== null && section.getAttribute(ATTR.provider) !== activeProvider;
				if (hide) section.setAttribute(ATTR.filtered, '');
				else section.removeAttribute(ATTR.filtered);
				if (collapsed.has(section)) section.setAttribute(ATTR.collapsed, '');
				else section.removeAttribute(ATTR.collapsed);
			}
			if (activeProvider === null) groups.removeAttribute(ATTR.provider);
			else groups.setAttribute(ATTR.provider, activeProvider);
		};

		/* ---- interaction ----------------------------------------------- */

		const setFilter = (key) => {
			activeProvider = activeProvider === key ? null : key;
			const menu = document.querySelector('[class~="codexModelSelectMenu"]');
			if (menu === null) return;
			for (const chip of menu.querySelectorAll(`[${ATTR.chip}]`)) {
				const on = activeProvider !== null && chip.getAttribute(ATTR.chip) === activeProvider;
				if (on) chip.setAttribute(CHIP_ON, '');
				else chip.removeAttribute(CHIP_ON);
				chip.setAttribute('aria-pressed', on ? 'true' : 'false');
			}
			// The signature guard would otherwise keep the old filter painted.
			menu.removeAttribute(ATTR.sig);
			decorateModelMenu();
		};

		const toggleCollapse = (button) => {
			const section = button.closest('section[data-menu-group]');
			if (section === null) return;
			if (collapsed.has(section)) collapsed.delete(section);
			else collapsed.add(section);
			button.setAttribute('aria-expanded', collapsed.has(section) ? 'false' : 'true');
			if (collapsed.has(section)) section.setAttribute(ATTR.collapsed, '');
			else section.removeAttribute(ATTR.collapsed);
		};

		/**
		 * Decoration runs on a poll, not a MutationObserver: the transcript streams
		 * tokens continuously, so a document-wide observer would fire on every
		 * token. One `querySelector` every 400 ms is free by comparison, and it
		 * self-heals React re-renders without needing to know why they happened.
		 */
		const startDecorator = () => {
			const timers = new Set();
			const later = (fn, ms) => {
				if (typeof setTimeout !== 'function') return;
				const id = setTimeout(() => {
					timers.delete(id);
					try {
						fn();
					} catch (error) {
						console.error('dsh-glass-theme: model menu decoration failed', error);
					}
				}, ms);
				timers.add(id);
			};
			const run = () => {
				try {
					decorateModelMenu();
				} catch (error) {
					console.error('dsh-glass-theme: model menu decoration failed', error);
				}
			};

			const onPointer = (event) => {
				const target = element(event.target);
				if (target === null) return;

				const chip = target.closest(`[${ATTR.chip}]`);
				if (chip !== null) {
					// The menu closes on outside-click; this click is inside it and must
					// not be read as a dismissal by the plugin's own handler.
					event.preventDefault();
					event.stopPropagation();
					setFilter(chip.getAttribute(ATTR.chip));
					return;
				}

				const toggle = target.closest(`[${ATTR.toggle}]`);
				if (toggle !== null) {
					event.preventDefault();
					event.stopPropagation();
					toggleCollapse(toggle);
					return;
				}

				// Opening the picker, or drilling from a cell into the model list, is
				// the one moment the decoration must not lag behind the paint.
				if (target.closest('[class*="codexModelSelectTrigger"],[class*="codexModelSelectCell"]') !== null) {
					for (const delay of [0, 60, 160, 320]) later(run, delay);
				}
			};

			document.addEventListener('click', onPointer, true);

			// A DOM stub (the smoke harness) has no timers. Polling is an
			// optimisation, not a requirement: without it the decorator still runs
			// once on mount and on every click, which is what a test needs.
			const timer =
				typeof setInterval === 'function'
					? setInterval(() => {
							if (document.visibilityState === 'hidden') return;
							run();
						}, 400)
					: null;

			run();

			return () => {
				if (timer !== null) clearInterval(timer);
				document.removeEventListener('click', onPointer, true);
				for (const id of timers) clearTimeout(id);
				timers.clear();
				clearDecorations();
			};
		};

		/** Best-effort teardown so a hot reload leaves no half-decorated menu. */
		const clearDecorations = () => {
			for (const header of document.querySelectorAll(`[${ATTR.header}]`)) header.remove();
			for (const node of document.querySelectorAll(`[${ATTR.mark}],[${ATTR.mult}],[${ATTR.desc}]`)) node.remove();
			for (const section of document.querySelectorAll(`section[${ATTR.filtered}],section[${ATTR.collapsed}]`)) {
				section.removeAttribute(ATTR.filtered);
				section.removeAttribute(ATTR.collapsed);
			}
			for (const menu of document.querySelectorAll(`[${ATTR.sig}]`)) menu.removeAttribute(ATTR.sig);
			activeProvider = null;
		};

		/* ================================================================== *
		 * Lifecycle
		 * ================================================================== */

		/* ================================================================== *
		 * Diagnostics
		 *
		 * A skin that fails to land looks exactly like a skin that never ran, and
		 * the renderer offers no way to ask which. One snapshot is posted to the
		 * host after mount — and once more when boot has settled — and written to
		 * a single JSON file under the OS temp directory. Counts, ids and computed
		 * colors only: no conversation content ever leaves the page.
		 * ================================================================== */

		const DIAG_PATH = '/dsh-glass-theme/ws/diag';

		const snapshot = () => {
			const out = {
				built,
				sheets: sheets.length,
				mounted: null,
				headStyles: null,
				lastOurs: null,
				theme: {
					html: document.documentElement === null || document.documentElement === undefined ? null : document.documentElement.getAttribute('data-dsh-glass-theme') !== null,
					body: document.body === null || document.body === undefined ? null : document.body.hasAttribute('data-dsh-glass-theme'),
					dark: document.body === null || document.body === undefined ? null : document.body.hasAttribute('data-ds-dark-theme'),
				},
				computed: null,
				viewport: null,
			};
			try {
				if (typeof document.querySelectorAll === 'function') {
					out.mounted = document.querySelectorAll(`style[data-plugin="${PACKAGE}"]`).length;
					out.headStyles = document.querySelectorAll('style').length;
				}
				const last = document.head === null || document.head === undefined ? null : document.head.lastElementChild;
				out.lastOurs = last !== null && last !== undefined && last.dataset !== undefined ? last.dataset.plugin === PACKAGE : null;
			} catch (error) {
				/* a stub document */
			}
			try {
				if (typeof getComputedStyle === 'function' && document.body !== null) {
					const body = getComputedStyle(document.body);
					const before = getComputedStyle(document.body, '::before');
					out.computed = {
						background: body.backgroundColor,
						image: String(body.backgroundImage ?? '').slice(0, 120),
						before: String(before.backgroundImage ?? '').slice(0, 120),
						filter: String(before.backdropFilter ?? before.webkitBackdropFilter ?? '').slice(0, 60),
					};
				}
				out.viewport = `${String(window.innerWidth)}x${String(window.innerHeight)}`;
			} catch (error) {
				/* older engines */
			}
			return out;
		};

		const report = () => {
			if (typeof fetch !== 'function') return;
			const send = () => {
				try {
					void fetch(DIAG_PATH, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(snapshot()),
						keepalive: true,
					}).catch(() => {});
				} catch (error) {
					/* the host is gone */
				}
			};
			send();
			// Second snapshot once the plugins and the theme layer have all landed;
			// the first one can be written before the shell's own CSS arrives.
			if (typeof setTimeout === 'function') setTimeout(send, 3000);
		};

		const clear = () => {
			document.documentElement.removeAttribute('data-dsh-glass-theme');
			document.documentElement.removeAttribute('data-dsh-glass-theme-built');
			document.documentElement.removeAttribute('data-lg-input');
			document.body?.removeAttribute('data-dsh-glass-theme');
		};

		function apply(ctx) {
			if (typeof document === 'undefined') return;
		try { window.__lgCtx = ctx } catch (e) {}
			try {
				stamp();
			} catch (error) {
				console.error('dsh-glass-theme: could not mark the document', error);
			}

			try {
				ctx.effect(() => trackModality());
			} catch (error) {
				console.error('dsh-glass-theme: could not track input modality', error);
			}

			try {
				ctx.effect(() => startDecorator());
			} catch (error) {
				console.error('dsh-glass-theme: could not decorate the model menu', error);
			}

			/* The ported picker replaces the composer's model seat. It renders its
			   own React tree, so it is mounted once and then left alone; the poll
			   inside it re-resolves the session, and the mount is retried until the
			   slot exists because the composer is not in the DOM on the hero page. */
			try {
				ctx.effect(() => {
					if (typeof document === 'undefined') return undefined;
					let seat = null;
					let stop = null;
					const attach = () => {
						if (seat !== null) {
							// A session switch unmounts the composer; if our seat left the
							// document, drop the old root and mount again.
							if (document.body.contains(seat)) return;
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
							seat = null;
							stop = null;
						}
						let picker = null;
						try {
							picker = createPicker(require, ctx, catalog);
						} catch (error) {
							console.error('dsh-glass-theme: could not build the model picker', error);
							return;
						}
						try {
							stop = picker.mount();
							seat = document.querySelector('[class~="lg-picker"]');
						} catch (error) {
							console.error('dsh-glass-theme: could not mount the model picker', error);
						}
					};
					attach();
					if (typeof setInterval !== 'function') {
						return () => {
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
						};
					}
					const timer = setInterval(attach, 1200);
					return () => {
						clearInterval(timer);
						try {
							stop && stop();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the model picker', error);
			}

			/* The merged usage panel replaces the host's three separate readouts
			   (context ring, activity pill, usage pill) with one. Same mounting
			   story as the picker: it lives in a slot that only exists once a
			   session is open, so the mount is retried until the dock appears. */
			try {
				ctx.effect(() => {
					if (typeof document === 'undefined') return undefined;
					let seat = null;
					let stop = null;
					const attach = () => {
						if (seat !== null) {
							if (document.body.contains(seat)) return;
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
							seat = null;
							stop = null;
						}
						let stats = null;
						try {
							stats = createStats(require, ctx, catalog);
						} catch (error) {
							console.error('dsh-glass-theme: could not build the usage panel', error);
							return;
						}
						try {
							stop = stats.mount();
							seat = document.querySelector('[class~="lg-stats"]');
						} catch (error) {
							console.error('dsh-glass-theme: could not mount the usage panel', error);
						}
					};
					attach();
					if (typeof setInterval !== 'function') {
						return () => {
							try {
								stop && stop();
							} catch (error) {
								/* already disposed */
							}
						};
					}
					const timer = setInterval(attach, 1200);
					return () => {
						clearInterval(timer);
						try {
							stop && stop();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the usage panel', error);
			}

			/* The skin's own settings section: where the quick-provider list is
			   chosen. It registers into the host's `settings.section` slot, so it
			   appears as one more page in the settings shell rather than as a
			   second dialog with its own idea of navigation. */
			try {
				ctx.effect(() => {
					let done = null;
					try {
						done = createSettingsSection(require, ctx, catalog).register();
					} catch (error) {
						console.error('dsh-glass-theme: could not register the settings section', error);
					}
					return () => {
						try {
							if (typeof done === 'function') done();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the settings section', error);
			}

			/* The 工作空间 workbench: a whole page (sidebar entry + main
			   panel), registered the same way the host's own WSL page is —
			   the `sidebar.panellist` icon and the `main` slot share one id,
			   and the shell owns navigation. Like the settings section above,
			   it lives in its own effect so a registration failure cannot
			   take the skin down with it. */
			try {
				ctx.effect(() => {
					let done = null;
					try {
						done = createWorkspace(require, ctx, catalog).register();
					} catch (error) {
						console.error('dsh-glass-theme: could not register the workspace panel', error);
					}
					return () => {
						try {
							if (typeof done === 'function') done();
						} catch (error) {
							/* already disposed */
						}
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not install the workspace panel', error);
			}

			try {
				// ctx.effect gives the disposer a defined lifetime: the sheets leave
				// with the plugin, including on hot reload.
				ctx.effect(() => {
					const unmount = mount();
					report();
					return () => {
						try {
							unmount();
						} catch (error) {
							/* already torn down */
						}
						clear();
					};
				});
			} catch (error) {
				console.error('dsh-glass-theme: could not mount the skin stylesheets', error);
			}
		}

		/* `slots` is declared because the skin registers a settings page into the
		   host's `settings.section` list. Without the service in this list the
		   context has no `slots` accessor, `ctx.slots.inject` throws, and the page
		   silently never appears — the failure looks exactly like "the code did
		   nothing", which is why it cost a round trip. */
		const inject = ['slots'];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
