/**
 * Liquid Glass — merged usage panel (ported).
 *
 * The reference does not restyle the host's three separate readouts; it hides
 * them and renders ONE panel that answers "how much of this conversation is
 * spent, and on what". This is that panel, ported to this skin's glass.
 *
 * WHY MERGED
 * The host splits the same question across three surfaces that each know a
 * third of the answer: the context meter knows the window occupancy and the
 * three-bucket breakdown, the activity pill knows time and speed, the usage
 * pill knows the token ledger. Reading them means opening three popovers and
 * adding the numbers up in your head. The reference's insight — and the reason
 * this port exists — is that they are one panel with three sections.
 *
 * DATA CONTRACT (all read from the shipped app, not guessed):
 *   ctx.get('uiSession').current.value.hooks.session.projections.faceOf(name)
 *     -> { getSnapshot(), subscribe(fn) }
 *   'contextPressure'  { pressureTokens, projectedTokens, contextWindow }
 *   'contextBreakdown' { systemTokens, toolsTokens, messageTokens }
 *   'sessionStats'     { turns, steps, llmMs, toolMs, ttftMs, ttftSteps,
 *                        decodeMs, decodeTokens }
 *   'tokenUsage'       { uncachedInputTokens, outputTokens, cacheReadTokens,
 *                        cacheWriteTokens }
 *
 * Injected by tools/build.mjs over the literal `/*__STATS__*​/null`, so this
 * file is authored as a bare function expression, never as a module.
 */
function createStats(require, ctx, catalog) {
	const React = require('react');
	const ReactDOM = require('react-dom/client');
	const ReactDOMShared = require('react-dom');

	const C = {
		root: 'lg-stats',
		trigger: 'lg-stats-trigger',
		panel: 'lg-stats-panel',
		head: 'lg-stats-head',
		headline: 'lg-stats-headline',
		figures: 'lg-stats-figures',
		bar: 'lg-stats-bar',
		segment: 'lg-stats-segment',
		rows: 'lg-stats-rows',
		row: 'lg-stats-row',
		swatch: 'lg-stats-swatch',
		section: 'lg-stats-section',
		grid: 'lg-stats-grid',
		item: 'lg-stats-item',
		label: 'lg-stats-label',
		value: 'lg-stats-value',
	};

	/* The three buckets are the app's own vocabulary (system prompt, tool
	   definitions, messages) and their colours are the ones the shipped meter
	   already uses, so a reader who has seen the host panel recognises them. */
	const BUCKETS = [
		{ key: 'systemTokens', label: '系统提示词', tint: 'var(--dsw-static-neutral-bluish-400)' },
		{ key: 'toolsTokens', label: '工具定义', tint: '#a78bfa' },
		{ key: 'messageTokens', label: '对话消息', tint: 'var(--dsw-static-blue-450)' },
	];

	/** 1,234,567 → "1,234,567"; large counts get a compact form. */
	function exact(value) {
		if (typeof value !== 'number' || !isFinite(value)) return '—';
		return Math.round(value).toLocaleString('en-US');
	}

	function compact(value) {
		if (typeof value !== 'number' || !isFinite(value)) return '—';
		if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
		if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
		if (value >= 1e3) return (value / 1e3).toFixed(value >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
		return String(Math.round(value));
	}

	/** "4分14秒" style, matching the app's own duration wording. */
	function duration(ms) {
		if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '—';
		const total = Math.round(ms / 1000);
		if (total < 60) return total + ' 秒';
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;
		if (minutes < 60) return minutes + ' 分 ' + seconds + ' 秒';
		const hours = Math.floor(minutes / 60);
		return hours + ' 小时 ' + (minutes % 60) + ' 分';
	}

	function percentText(part, whole) {
		if (!whole || whole <= 0) return '—';
		return Math.round((part / whole) * 100) + '%';
	}

	/** The session the composer is attached to, read the way the picker does. */
	function liveSession() {
		try {
			const ui = ctx.get('uiSession');
			const value = ui && ui.current ? ui.current.value : null;
			if (value === null || value === undefined) return null;
			return value.hooks && value.hooks.session ? value.hooks.session : null;
		} catch (error) {
			return null;
		}
	}

	function faceOf(session, name) {
		try {
			if (session === null) return null;
			const projections = session.projections;
			if (!projections || typeof projections.faceOf !== 'function') return null;
			return projections.faceOf(name);
		} catch (error) {
			return null;
		}
	}

	function Stats() {
		const [values, setValues] = React.useState({});
		const [open, setOpen] = React.useState(false);
		const [placement, setPlacement] = React.useState(null);
		const anchor = React.useRef(null);
		const panelRef = React.useRef(null);

		/* One subscription per projection, re-established when the session
		   changes. A single 1s poll would work too, but these values drive a
		   number a reader is watching tick up, and a poll makes it stutter. */
		React.useEffect(() => {
			let live = true;
			const names = ['contextPressure', 'contextBreakdown', 'sessionStats', 'tokenUsage'];
			const stops = [];
			const read = () => {
				if (!live) return;
				const session = liveSession();
				const next = {};
				for (const name of names) {
					const face = faceOf(session, name);
					if (face === null) continue;
					try {
						next[name] = face.getSnapshot();
					} catch (error) {
						/* a torn read is not fatal */
					}
				}
				setValues(next);
			};
			read();
			const session = liveSession();
			for (const name of names) {
				const face = faceOf(session, name);
				if (face === null || typeof face.subscribe !== 'function') continue;
				try {
					const stop = face.subscribe(read);
					if (typeof stop === 'function') stops.push(stop);
				} catch (error) {
					/* the projection may have gone away */
				}
			}
			if (typeof setInterval === 'function') {
				const timer = setInterval(read, 4000);
				stops.push(() => clearInterval(timer));
			}
			return () => {
				live = false;
				for (const stop of stops) {
					try {
						stop();
					} catch (error) {
						/* already disposed */
					}
				}
			};
		}, []);

		const pressure = values.contextPressure || null;
		const breakdown = values.contextBreakdown || null;
		const stats = values.sessionStats || null;
		const usage = values.tokenUsage || null;

		const used = pressure === null ? null : pressure.projectedTokens !== undefined ? pressure.projectedTokens : pressure.pressureTokens;
		const window_ = pressure === null ? null : pressure.contextWindow;
		const percent = used === null || window_ === null || !window_ ? null : Math.min(100, Math.round((used / window_) * 100));

		const billed = usage === null ? 0 : (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0);
		const hitRate = usage === null || billed === 0 ? null : Math.round(((usage.cacheReadTokens || 0) / billed) * 100);

		/* EVERY hook must run before the first conditional return: an early
		   `return null` between hooks makes React report "rendered fewer hooks
		   than expected" and drop the whole tree — which reads as an empty seat
		   and no error anywhere the eye lands. */
		React.useLayoutEffect(() => {
			if (!open) {
				setPlacement(null);
				return undefined;
			}
			const place = () => {
				const trigger_ = anchor.current;
				const panel = panelRef.current;
				if (trigger_ === null || panel === null) return;
				const a = trigger_.getBoundingClientRect();
				/* The panel opens on a 150ms scale animation; a rect would read
				   the animated box (1% small), swing the anchor, and leave the
				   right edges 3px apart once the scale settles. offsetWidth /
				   offsetHeight are the layout box — the settled truth. */
				const panelWidth = panel.offsetWidth;
				const panelHeight = panel.offsetHeight;
				const gap = 8;
				const margin = 10;
				let top = a.top - panelHeight - gap;
				if (top < margin) top = Math.min(a.bottom + gap, window.innerHeight - panelHeight - margin);
				/* The trigger hangs off the input box's right edge, so the panel
				   hangs off the trigger's right edge — right edges ride together,
				   and the clamps only engage near the window's own margin. */
				let left = a.right - panelWidth;
				left = Math.max(margin, Math.min(left, window.innerWidth - margin - panelWidth));
				setPlacement({ top: Math.round(Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin))), left: Math.round(left) });
			};
			place();
			/* The first pass measures while the panel is still materialising —
			   web fonts and the scrollbar can nudge the pill a few pixels after
			   it runs. A second pass one painted frame later reads the settled
			   geometry, so the right edges really touch. */
			requestAnimationFrame(() => requestAnimationFrame(place));
			window.addEventListener('resize', place);
			return () => window.removeEventListener('resize', place);
		}, [open]);

		React.useEffect(() => {
			if (!open) return undefined;
			const onDown = (event) => {
				if (anchor.current && event.target instanceof Node && anchor.current.contains(event.target)) return;
				if (panelRef.current && event.target instanceof Node && panelRef.current.contains(event.target)) return;
				setOpen(false);
			};
			const onKey = (event) => {
				if (event.key === 'Escape') setOpen(false);
			};
			document.addEventListener('pointerdown', onDown, true);
			document.addEventListener('keydown', onKey, true);
			return () => {
				document.removeEventListener('pointerdown', onDown, true);
				document.removeEventListener('keydown', onKey, true);
			};
		}, [open]);

		/* Nothing to say until the session has a projection; an empty pill that
		   appears and disappears is worse than no pill. This return is AFTER
		   every hook on purpose — see the note above. */
		if (percent === null && stats === null && usage === null) return null;

		/* The collapsed pill: one reading per question, in the order a reader
		   asks them — how full, how fast, how much. */
		const trigger = React.createElement(
			'button',
			{
				type: 'button',
				className: C.trigger,
				ref: anchor,
				'aria-haspopup': 'dialog',
				'aria-expanded': open ? 'true' : 'false',
				'aria-label': '上下文与用量',
				onClick: () => setOpen((value) => !value),
			},
			percent === null
				? null
				: React.createElement('span', { className: C.seg }, React.createElement('span', { className: 'lg-stats-ring', 'aria-hidden': 'true' }, ring(percent)), percent + '%'),
			stats === null || !stats.steps
				? null
				: React.createElement(
						'span',
						{ className: C.seg },
						stats.turns + ' 轮',
						stats.decodeMs > 0 ? React.createElement('em', null, Math.round(stats.decodeTokens / (stats.decodeMs / 1000)) + ' tok/s') : null
				  ),
			usage === null
				? null
				: React.createElement('span', { className: C.seg }, compact(billed + (usage.outputTokens || 0)), ' tok', hitRate === null ? null : React.createElement('em', null, '命中 ' + hitRate + '%'))
		);

		if (!open) return React.createElement('span', { className: C.root, ref: anchor }, trigger);

		const total = breakdown === null ? 0 : (breakdown.systemTokens || 0) + (breakdown.toolsTokens || 0) + (breakdown.messageTokens || 0);
		const segments =
			breakdown === null || total === 0 || percent === null
				? [{ key: 'total', tint: 'var(--dsw-alias-label-tertiary)', width: percent === null ? 0 : percent }]
				: BUCKETS.map((bucket) => ({ key: bucket.key, tint: bucket.tint, width: (percent * (breakdown[bucket.key] || 0)) / total }));

		const panel = React.createElement(
			'div',
			{
				className: C.panel,
				role: 'dialog',
				'aria-label': '上下文与用量',
				ref: panelRef,
				style: placement === null ? { visibility: 'hidden' } : { top: placement.top + 'px', left: placement.left + 'px' },
			},
			React.createElement(
				'div',
				{ className: C.head },
				React.createElement('span', { className: C.headline }, '上下文已用', percent === null ? null : React.createElement('b', null, percent + '%')),
				React.createElement('span', { className: C.figures }, used === null ? '—' : '~' + compact(used), window_ === null ? '' : ' / ' + compact(window_))
			),
			React.createElement(
				'div',
				{ className: C.bar, 'aria-hidden': 'true' },
				segments.filter((part) => part.width > 0).map((part) => React.createElement('span', { key: part.key, className: C.segment, style: { flexGrow: part.width, background: part.tint } }))
			),
			breakdown === null
				? null
				: React.createElement(
						'div',
						{ className: C.rows },
						BUCKETS.map((bucket) =>
							React.createElement(
								'div',
								{ className: C.row, key: bucket.key },
								React.createElement('span', { className: C.swatch, style: { background: bucket.tint }, 'aria-hidden': 'true' }),
								React.createElement('span', { className: C.label }, bucket.label),
								React.createElement('span', { className: C.value }, '~' + compact(breakdown[bucket.key] || 0))
							)
						)
				  ),
			stats === null
				? null
				: React.createElement(
						'div',
						{ className: C.section },
						React.createElement('div', { className: 'lg-stats-section-title' }, '会话统计'),
						React.createElement(
							'div',
							{ className: C.grid },
							item('模型用时', duration(stats.llmMs)),
							item('工具调用用时', duration(stats.toolMs)),
							item('首 token 平均', stats.ttftSteps > 0 ? (stats.ttftMs / stats.ttftSteps / 1000).toFixed(1) + ' 秒' : '—'),
							item('输出速度', stats.decodeMs > 0 ? Math.round(stats.decodeTokens / (stats.decodeMs / 1000)) + ' tok/s' : '—')
						)
				  ),
			usage === null
				? null
				: React.createElement(
						'div',
						{ className: C.section },
						React.createElement('div', { className: 'lg-stats-section-title' }, 'Token 用量'),
						React.createElement(
							'div',
							{ className: C.grid },
							item('缓存命中', hitRate === null ? '—' : hitRate + '%'),
							item('未缓存输入', exact(usage.uncachedInputTokens || 0) + ' tok'),
							item('缓存读取', exact(usage.cacheReadTokens || 0) + ' tok'),
							item('输出', exact(usage.outputTokens || 0) + ' tok')
						)
				  )
		);

		return React.createElement('span', { className: C.root, ref: anchor }, trigger, ReactDOMShared.createPortal(panel, document.body));
	}

	function item(label, value) {
		return React.createElement(
			'div',
			{ className: 'lg-stats-item', key: label },
			React.createElement('span', { className: 'lg-stats-label' }, label),
			React.createElement('span', { className: 'lg-stats-value' }, value)
		);
	}

	/** The 14px ring the host meter draws, kept so the reading looks familiar. */
	function ring(percent) {
		const r = 5.5;
		const circumference = 2 * Math.PI * r;
		return React.createElement(
			'svg',
			{ viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': 'true' },
			React.createElement('circle', { cx: 7, cy: 7, r, fill: 'none', stroke: 'currentColor', strokeWidth: 2, opacity: 0.18 }),
			React.createElement('circle', {
				cx: 7,
				cy: 7,
				r,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 2,
				strokeLinecap: 'round',
				strokeDasharray: (circumference * percent) / 100 + ' ' + circumference,
				transform: 'rotate(-90 7 7)',
			})
		);
	}

	/**
	 * Mount into the composer dock, beside the host's own readouts.
	 *
	 * The host pills are hidden by CSS once `html[data-lg-stats]` is set, so the
	 * swap is atomic: the attribute and the seat appear together, and a reader
	 * never sees both or neither.
	 */
	function mount() {
		const dock = document.querySelector('[data-composer-dock]');
		if (dock === null) return null;
		let seat = dock.querySelector('.' + C.root);
		if (seat === null) {
			seat = document.createElement('span');
			seat.className = C.root;
			dock.appendChild(seat);
		}
		document.documentElement.setAttribute('data-lg-stats', '');
		/* Right-edge alignment with the INPUT BOX, not the conversation column:
		   the host centres a narrower glass card in the wide column, so the dock
		   (full column width) runs past the card's right edge. The card is the
		   dock's card-shaped sibling that holds the editable; the gap between
		   the column edge and the card edge rides on the seat as an end margin
		   and the pill lands exactly on the card's rim. The card is re-resolved
		   on every pass — switching sessions swaps the node — and a
		   ResizeObserver on the persistent column plus the card itself, with a
		   slow poll as the belt to that brace, keeps the margin honest across
		   window resizes, font swaps, and layout transitions. */
		const findCard = () =>
			Array.prototype.find.call(
				dock.parentElement.children,
				(el) => el !== dock && el.querySelector('textarea, [contenteditable=true]')
			);
		const align = () => {
			const card = findCard();
			if (card === undefined) return;
			/* The gap rides on the seat as a margin, never as dock padding: the
			   dock's own rect must stay independent of the value it is used to
			   measure, or the next pass chases itself and the inset creeps. */
			const inset = dock.getBoundingClientRect().right - card.getBoundingClientRect().right;
			seat.style.marginInlineEnd = Math.max(0, Math.round(inset)) + 'px';
		};
		align();
		/* The card is observed directly — a web-font swap changes its width
		   without moving the column, and only an observation of the card itself
		   catches that. Session switches swap the card node, so every observer
		   pass re-aligns AND re-targets the observation onto the current card
		   (a detached node is observed no longer). The slow poll is the belt to
		   this brace, for environments where neither resize nor font moves. */
		let observer = null;
		let observedCard = findCard();
		const alignAndRetarget = () => {
			align();
			if (observer === null) return;
			const card = findCard();
			if (card !== undefined && card !== observedCard) {
				observedCard = card;
				observer.observe(card);
			}
		};
		if (typeof ResizeObserver === 'function') {
			observer = new ResizeObserver(alignAndRetarget);
			observer.observe(dock.parentElement);
			if (observedCard !== undefined) observer.observe(observedCard);
		}
		const poll = setInterval(alignAndRetarget, 2000);
		const root = ReactDOM.createRoot(seat);
		root.render(React.createElement(Stats));
		return () => {
			try {
				root.unmount();
			} catch (error) {
				/* already gone */
			}
			if (observer !== null) observer.disconnect();
			clearInterval(poll);
			document.documentElement.removeAttribute('data-lg-stats');
			if (seat && seat.parentNode) seat.parentNode.removeChild(seat);
		};
	}

	return { mount };
}
