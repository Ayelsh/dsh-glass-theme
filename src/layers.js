/**
 * Layer coordinator — keyboard and focus discipline for skin-owned overlays.
 *
 * One instance per skin application (created in the client factory, handed to
 * the component factories through their shared opts). Components keep their
 * own view state; this coordinator owns only the cross-cutting rules the
 * overlays must share so they behave as *layers* instead of independent
 * popups:
 *
 *   - one Escape or outside gesture acts on the top eligible layer only;
 *   - a modal layer contains Tab/Shift+Tab and makes its siblings inert
 *     (sibling-only — never the whole document, never nested ancestors);
 *   - focus that was taken is returned to a still-connected target;
 *   - disposing a layer removes exactly its own handlers and restrictions.
 *
 * The coordinator is deliberately motion-free: it changes state, never
 * transition, so reduced-motion preferences cannot change what opens or
 * closes, only how it travels.
 *
 * Spliced into lib/client.js by tools/build.mjs; edit here, never there.
 */
function createLayers() {
	/* Stack of live layers, oldest first; the LAST entry is the top layer. */
	const stack = [];
	/* Prior inert/aria-hidden state per layer, restored on its dispose. */
	const remembered = new Map();
	let keyListener = null;
	let pointerListener = null;

	const FOCUSABLE = [
		'a[href]',
		'button:not([disabled])',
		'input:not([disabled])',
		'select:not([disabled])',
		'textarea:not([disabled])',
		'[tabindex]:not([tabindex="-1"])',
	].join(',');

	const connected = (el) => el !== null && el !== undefined && typeof el.isConnected === 'boolean' && el.isConnected;

	const within = (entry, node) => {
		if (node === null || node === undefined) return false;
		const root = entry.surface;
		/* surface may legitimately be null: an entry can own its hit area
		 * entirely through the component's own predicate (a card plus its
		 * portaled neighbors, for example). */
		if (root !== null && root !== undefined && typeof root.contains === 'function' && root.contains(node)) return true;
		/* Portaled children the surface does not contain textually can still
		 * belong to the layer via the component's own predicate. */
		if (typeof entry.contains === 'function') {
			try {
				return entry.contains(node) === true;
			} catch (error) {
				return false;
			}
		}
		return false;
	};

	const focusableIn = (root) => {
		if (root === null || root === undefined || typeof root.querySelectorAll !== 'function') return [];
		let nodes = [];
		try {
			nodes = [...root.querySelectorAll(FOCUSABLE)];
		} catch (error) {
			return [];
		}
		return nodes.filter((el) => {
			if (el.disabled === true) return false;
			if (el.getAttribute('aria-hidden') === 'true') return false;
			if (el.inert === true) return false;
			try {
				if (el.getClientRects().length === 0) return false;
			} catch (error) {
				/* detached nodes have no client rects anyway */
				return false;
			}
			return true;
		});
	};

	/* --- sibling-only inert -------------------------------------------------
	 *
	 * While a modal layer is open, its siblings in the surface's parent
	 * become inert and aria-hidden. Nested layers above it are NOT siblings'
	 * concern: a child modal marks its own siblings (which include this
	 * surface), and restoring walks back exactly what each layer set. */

	const applySiblingRestrictions = (entry) => {
		if (entry.kind !== 'modal') return;
		const parent = entry.surface === null || entry.surface === undefined ? null : entry.surface.parentElement;
		if (parent === null) return;
		const prior = [];
		const siblings = [...parent.childNodes].filter((node) => node.nodeType === 1 && node !== entry.surface);
		for (const node of siblings) {
			if (node.inert === true && node.getAttribute('aria-hidden') === 'true') continue; // already restricted by an inner rule
			prior.push({ node, inert: node.inert === true, ariaHidden: node.getAttribute('aria-hidden') });
			try {
				node.inert = true;
			} catch (error) {
				/* engines without the property still honor the attribute */
			}
			node.setAttribute('aria-hidden', 'true');
		}
		remembered.set(entry, prior);
	};

	const restoreSiblingRestrictions = (entry) => {
		const prior = remembered.get(entry);
		if (prior === undefined) return;
		remembered.delete(entry);
		for (const { node, inert, ariaHidden } of prior) {
			if (connected(node) === false) continue;
			try {
				node.inert = inert;
			} catch (error) {
				/* see above */
			}
			if (ariaHidden === null) node.removeAttribute('aria-hidden');
			else node.setAttribute('aria-hidden', ariaHidden);
		}
	};

	/* --- document-level routing ------------------------------------------- */

	const top = () => (stack.length === 0 ? null : stack[stack.length - 1]);

	const onKeyDown = (event) => {
		const entry = top();
		if (entry === null) return;
		if (event.key === 'Escape') {
			if (event.defaultPrevented) return;
			/* Only the top layer sees the gesture; everything below keeps its
			 * state. The component decides what "dismiss" means. */
			entry.onDismiss({ reason: 'escape', event });
			return;
		}
		if (entry.kind === 'modal' && (event.key === 'Tab' || event.key === 'tab')) {
			/* Contain sequential focus inside the modal surface: at either
			 * end, wrap to the other end. Inert siblings are unreachable, so
			 * this cycle IS the whole tabbable order while the modal is up. */
			const targets = focusableIn(entry.surface);
			if (targets.length === 0) return;
			const current = document.activeElement;
			const at = targets.indexOf(current);
			const forward = event.shiftKey !== true;
			const count = targets.length;
			const next = at === -1 ? (forward ? targets[0] : targets[count - 1]) : forward ? targets[(at + 1) % count] : targets[(at - 1 + count) % count];
			event.preventDefault();
			next.focus();
		}
	};

	const onPointerDown = (event) => {
		const entry = top();
		if (entry === null) return;
		const node = event.target;
		if (within(entry, node)) return;
		/* An outside gesture routes to the top layer only. Nonmodal panels
		 * let the activated control keep focus (the coordinator never
		 * re-focuses the opener on outside dismissal); modal panels receive
		 * the gesture and decide (a scrim usually closes, a dialog may not).
		 */
		entry.onDismiss({ reason: 'outside', event });
	};

	const attach = () => {
		if (keyListener !== null) return;
		keyListener = onKeyDown;
		pointerListener = onPointerDown;
		document.addEventListener('keydown', keyListener, true);
		document.addEventListener('pointerdown', pointerListener, true);
	};

	const detach = () => {
		if (keyListener === null) return;
		document.removeEventListener('keydown', keyListener, true);
		document.removeEventListener('pointerdown', pointerListener, true);
		keyListener = null;
		pointerListener = null;
	};

	/**
	 * Claim the top layer slot.
	 *
	 * entry: { owner, kind: 'modal' | 'nonmodal', surface: Element,
	 *          onDismiss(info), contains?(node) }
	 *
	 * The returned handle is the ONLY way out: dispose({ focus }) removes the
	 * layer, restores whatever it restricted, and — unless focus === false —
	 * returns focus to the still-connected element that held it at acquire
	 * time (or focus, when an explicit Element is passed).
	 */
	const acquire = (entry) => {
		if (entry === null || typeof entry !== 'object') throw new Error('layers.acquire: entry object required');
		if (typeof entry.onDismiss !== 'function') throw new Error('layers.acquire: onDismiss function required');
		const kind = entry.kind === 'modal' ? 'modal' : 'nonmodal';
		const record = { ...entry, kind };
		const opener = typeof document.activeElement === 'object' ? document.activeElement : null;
		stack.push(record);
		attach();
		applySiblingRestrictions(record);
		let disposed = false;
		return {
			get kind() {
				return kind;
			},
			dispose({ focus } = {}) {
				if (disposed) return;
				disposed = true;
				const at = stack.indexOf(record);
				if (at >= 0) stack.splice(at, 1);
				restoreSiblingRestrictions(record);
				remembered.delete(record);
				if (stack.length === 0) detach();
				/* Focus policy: an explicit Element wins; false means "the
				 * component already placed focus" (pointer dismissal, outside
				 * activation); otherwise return to the connected opener. */
				if (focus !== undefined && focus !== false) {
					const target = focus;
					if (connected(target)) target.focus();
					return;
				}
				if (focus === false) return;
				if (connected(opener) && document.activeElement !== opener) {
					/* Only pull focus back if it currently sits inside the
					 * surface being disposed — otherwise something else
					 * (another layer, an outside control) owns it now. */
					if (document.activeElement === null || within(record, document.activeElement)) opener.focus();
				}
			},
		};
	};

	return {
		acquire,
		/** Tear down every layer this coordinator owns, top first. Used at
		 * skin unload and by the checks between scenarios; focus is left
		 * wherever it is because the surfaces are going away with it. */
		release() {
			while (stack.length > 0) {
				const entry = stack.pop();
				restoreSiblingRestrictions(entry);
				remembered.delete(entry);
			}
			detach();
		},
		get depth() {
			return stack.length;
		},
		/** Diagnostic: is `node` inside the top layer? */
		owns(node) {
			return within(top(), node);
		},
	};
}
