/**
 * Liquid Glass — the skin's settings section.
 *
 * The composer's model card shows only the providers the user pinned as "quick
 * providers"; this is where that list is chosen. It registers into the host's
 * `settings.section` slot, which is the same seam every other settings page
 * uses — a plugin that needs a configuration surface adds a section, it does not
 * grow a second settings dialog of its own.
 *
 * WHY localStorage AND NOT A HOST SETTING
 * The reference keeps its equivalent in the host's `settings` service, but that
 * service resolves through `ctx.inject(['settings'])` and requires a schemastery
 * schema; this package has no host-side settings schema, and the value it would
 * store is a list of provider ids that only the client ever reads. A namespaced
 * localStorage key is the honest storage for a client-only preference, and it is
 * the SAME key the picker reads, so the two never disagree.
 *
 * Authored as a bare function expression, spliced by tools/build.mjs.
 */
function createSettingsSection(require, ctx, catalog) {
	const React = require('react');
	const h = React.createElement;

	const QUICK_KEY = 'dsh-glass-theme:quick-providers';
	const QUICK_MAX = 4;

	function readQuick() {
		try {
			const raw = window.localStorage.getItem(QUICK_KEY);
			if (raw === null) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
		} catch (error) {
			return [];
		}
	}

	function writeQuick(list) {
		try {
			window.localStorage.setItem(QUICK_KEY, JSON.stringify(list));
			/* The picker polls, so it picks this up on its next tick; the event is
			   for anything else listening (a second window, a future panel). */
			window.dispatchEvent(new CustomEvent('lg-quick-providers', { detail: list }));
		} catch (error) {
			/* a quota failure must not break the settings page */
		}
	}

	/** The live provider list, read the same way the composer's picker reads it. */
	function providers() {
		try {
			/* The `modelSelection` PROJECTION and the model directory's own store
			   are two different snapshots: the projection is a flattened summary
			   and has no `groups` array. Asking the directory directly is the only
			   reading that yields providers, and it is what the picker does. */
			const ui = ctx.get('uiSession');
			const value = ui && ui.current ? ui.current.value : null;
			let sessionId = null;
			if (value !== null && value !== undefined) {
				if (value.key !== undefined && value.key !== null) sessionId = value.key;
				else if (value.sessionId !== undefined && value.sessionId !== null) sessionId = value.sessionId;
			}
			if (sessionId === null || sessionId === '') {
				const sessions = ctx.get('sessions');
				const live = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function' ? sessions.list.getSnapshot() : null;
				if (live && live.current !== undefined && live.current !== null) sessionId = live.current;
			}
			if (sessionId === null || sessionId === '') return [];
			const directories = ctx.get('modelDirectories');
			if (!directories || typeof directories.directoryFor !== 'function') return [];
			const directory = directories.directoryFor(sessionId);
			if (directory === null || directory === undefined) return [];
			if (directory.store === undefined && typeof directory.load === 'function') directory.load();
			const store = directory.store;
			let snap = null;
			if (store && typeof store.getSnapshot === 'function') snap = store.getSnapshot();
			if (snap === null && directory.projected !== undefined && directory.projected !== null) snap = directory.projected;
			if (snap === null || !Array.isArray(snap.groups)) return [];
			return snap.groups.map((group) => ({ id: group.id, name: group.name || group.id, count: (group.models || []).length }));
		} catch (error) {
			return [];
		}
	}

	function Section() {
		const [quick, setQuick] = React.useState(() => readQuick());
		const [list, setList] = React.useState(() => providers());

		/* The directory can still be loading when the page opens; a settings page
		   that says "no providers" on a slow start is a settings page that lies. */
		React.useEffect(() => {
			const read = () => setList(providers());
			read();
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(read, 2000);
			return () => clearInterval(timer);
		}, []);

		const toggle = (id) => {
			const next = quick.indexOf(id) >= 0 ? quick.filter((value) => value !== id) : quick.length < QUICK_MAX ? quick.concat(id) : quick;
			setQuick(next);
			writeQuick(next);
		};

		return h(
			'div',
			{ className: 'lg-settings' },
			h('h2', { className: 'lg-settings-title' }, '快捷供应商'),
			h(
				'p',
				{ className: 'lg-settings-intro' },
				'模型选择器默认只列出这里勾选的供应商；其余供应商收在“所有供应商”里。',
				'一个都不勾选时，选择器会列出全部供应商。'
			),
			list.length === 0
				? h('p', { className: 'lg-settings-empty' }, '尚未读取到供应商，请先打开一个会话。')
				: h(
						'ul',
						{ className: 'lg-settings-list' },
						list.map((provider) => {
							const on = quick.indexOf(provider.id) >= 0;
							/* At the limit an unchecked switch cannot do anything. Saying
							   so is the difference between a control that refuses and a
							   control that appears broken. */
							const blocked = !on && quick.length >= QUICK_MAX;
							return h(
								'li',
								{ className: 'lg-settings-row', key: provider.id, 'data-blocked': blocked ? 'true' : 'false' },
								h(
									'span',
									{ className: 'lg-settings-copy' },
									h('span', { className: 'lg-settings-name' }, provider.name),
									h('span', { className: 'lg-settings-note' }, provider.count + ' 个模型')
								),
								h(
									'button',
									{
										type: 'button',
										className: 'lg-settings-switch',
										role: 'switch',
										'aria-checked': on ? 'true' : 'false',
										'aria-disabled': blocked ? 'true' : 'false',
										'aria-label': provider.name,
										title: blocked ? '最多可选 ' + QUICK_MAX + ' 个，请先取消一个' : undefined,
										'data-on': on ? 'true' : 'false',
										onClick: () => toggle(provider.id),
									},
									h('span', { className: 'lg-settings-knob' })
								)
							);
						})
					),
			list.length === 0
				? null
				: h('p', { className: 'lg-settings-count' }, '已选 ' + quick.length + ' / ' + QUICK_MAX)
		);
	}

	/**
	 * Register into the host's settings section slot.
	 *
	 * `label` is what the settings navigation shows. `inject` must be an injector
	 * FUNCTION: the slot runtime calls it to build the section's props, and an
	 * array registers a section that renders nothing and reports nothing.
	 */
	function register() {
		const slots = ctx.slots;
		if (!slots || typeof slots.register !== 'function') return null;
		const register = () =>
			slots.register(
				{
					name: 'settings.section',
					id: 'liquid-glass',
					order: 40,
					label: () => 'Liquid Glass',
					/* An INJECTOR, not a list: the slot runtime calls this to build
					   the props the section receives. An array here registers
					   nothing and reports no error, so it fails silently. */
					inject: () => ({}),
				},
				Section
			);
		try {
			if (typeof slots.inject === 'function') slots.inject('settings.section', register);
			else register();
			return true;
		} catch (error) {
			console.error('dsh-glass-theme: could not register the settings section', error);
			return null;
		}
	}

	return { register, Section };
}
