/**
 * Liquid Glass — the skin's settings section.
 *
 * The composer's model card shows only the providers and models the user picked
 * as "quick"; this is where that choice is made. It registers into the host's
 * `settings.section` slot, which is the same seam every other settings page
 * uses — a plugin that needs a configuration surface adds a section, it does not
 * grow a second settings dialog of its own.
 *
 * WHERE THE CHOICE LIVES
 * The host's settings entry (`ui-skin-glass-theme`, declared in
 * src/host/settings.js) is the truth. This page writes through the one adapter
 * src/client.js creates and hands to it, so a choice survives a restart, shows
 * up in a second window, and can be reset to the schema default. The namespaced
 * localStorage key the picker reads is a PROJECTION of that value, written in
 * the same interaction — the picker needs a synchronous first-paint read and
 * cannot wait for the host. See docs/SETTINGS.md.
 *
 * TWO VIEWS, ONE OBJECT
 * The board is the page's one material object. Choosing models for a provider
 * swaps the board's CONTENTS (a view state plus a back affordance) instead of
 * stacking an accordion inside it or opening a popover over it: a 25-model
 * provider would push the board past the viewport and bury every other
 * provider, and the picker already owns the popover idiom.
 *
 * Authored as a bare function expression, spliced by tools/build.mjs.
 */
function createSettingsSection(require, ctx, catalog, prefs) {
	const React = require('react');
	const h = React.createElement;

	/* The key and the cap come from the adapter, which took them from
	   src/client.js — the same values the picker is built with. A second copy of
	   either number is how the two surfaces drift apart. The literal is only
	   reached if the adapter itself failed to construct, which is already a
	   broken-page situation; the page still has to render something. */
	const QUICK_MAX = prefs ? prefs.max : 4;

	const EMPTY = { providers: [], models: {} };

	const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

	/** The live catalog: providers AND their models. */
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
			/* The model arrays are KEPT, not reduced to a count: the drill-down
			   lists a provider's models by name, and a row that can only say
			   "25 个模型" is a row that cannot be configured. */
			return snap.groups.map((group) => ({
				id: group.id,
				name: group.name || group.id,
				models: (group.models || []).map((model) => ({ id: model.id, name: model.name || model.id })),
			}));
		} catch (error) {
			return [];
		}
	}

	/** The models a provider shows in the quick list: `undefined` means all of them. */
	function chosen(selection, providerId) {
		const entry = selection.models[providerId];
		return Array.isArray(entry) ? entry : undefined;
	}

	/** `undefined` (never configured) and "everything" are the same state. */
	const allChosen = (selection, provider) => {
		const entry = chosen(selection, provider.id);
		if (entry === undefined) return true;
		return entry.length === provider.models.length && provider.models.every((model) => entry.indexOf(model.id) >= 0);
	};

	function Section() {
		const [selection, setSelection] = React.useState(() => (prefs ? prefs.selection() : EMPTY));
		const [list, setList] = React.useState(() => providers());
		/* null = the provider board; an id = that provider's model list. */
		const [view, setView] = React.useState(null);
		const [workspace, setWorkspace] = React.useState(() => {
			if (!prefs) return true;
			const value = prefs.get('workspaceView');
			return value === undefined ? true : value !== false;
		});

		/* The adapter is the single source of truth for both preferences: the page
		   re-renders from its published state, not from a local copy, so a write
		   refused by the host (and the re-read that follows) shows up here, and a
		   change made in another window does too. */
		React.useEffect(() => {
			if (!prefs) return undefined;
			const read = () => {
				setSelection(prefs.selection());
				const value = prefs.get('workspaceView');
				setWorkspace(value === undefined ? true : value !== false);
			};
			read();
			return prefs.subscribe(read);
		}, []);

		/* The directory can still be loading when the page opens; a settings page
		   that says "no providers" on a slow start is a settings page that lies. */
		React.useEffect(() => {
			const read = () => setList(providers());
			read();
			if (typeof setInterval !== 'function') return undefined;
			const timer = setInterval(read, 2000);
			return () => clearInterval(timer);
		}, []);

		const commit = (next) => {
			if (!prefs) return;
			/* The live provider ids travel with the write: the model map is keyed
			   by provider and would otherwise grow for the life of the profile. */
			prefs.commit(next, list.map((provider) => provider.id));
		};

		const pinned = selection.providers;
		const full = pinned.length >= QUICK_MAX;

		const toggleProvider = (id) => {
			const on = pinned.indexOf(id) >= 0;
			const providers = on ? pinned.filter((value) => value !== id) : pinned.length < QUICK_MAX ? pinned.concat(id) : pinned;
			/* Unpinning leaves the model choice in place on purpose: re-pinning
			   restores the subset the user configured, and a provider that merely
			   left the quick list should not lose its configuration. */
			commit({ providers, models: selection.models });
		};

		const setModels = (provider, next) => {
			const models = Object.assign({}, selection.models);
			if (next === undefined) delete models[provider.id];
			else models[provider.id] = next;
			commit({ providers: pinned, models });
		};

		const toggleModel = (provider, modelId) => {
			const entry = chosen(selection, provider.id);
			const current = entry === undefined ? provider.models.map((model) => model.id) : entry;
			const next = current.indexOf(modelId) >= 0 ? current.filter((value) => value !== modelId) : current.concat(modelId);
			/* Choosing everything again drops the entry instead of writing the
			   full list: "全部" is the same behaviour and survives a model being
			   added to the provider later. */
			if (next.length === provider.models.length) setModels(provider, undefined);
			else setModels(provider, next);
		};

		const current = view === null ? null : list.filter((provider) => provider.id === view)[0] || null;

		/* Returning from the drill-down puts the keyboard back on the control
		   that opened it, so the back affordance does not strand focus on a row
		   that no longer exists. */
		const opener = React.useRef(null);
		const boardRef = React.useRef(null);
		const openModels = (provider, element) => {
			opener.current = element || null;
			setView(provider.id);
		};
		const closeModels = () => {
			setView(null);
			const node = opener.current;
			opener.current = null;
			if (node && typeof node.focus === 'function') {
				try {
					node.focus();
				} catch (error) {
					/* the row went away with the view */
				}
			}
		};

		/* A view swap keeps the scroller's offset; the new view has to start at
		   its own top, or a 25-model list opens halfway down and reads as a list
		   with no beginning. */
		React.useEffect(() => {
			const node = boardRef.current;
			if (node && typeof node.scrollIntoView === 'function') {
				try {
					node.scrollIntoView({ block: 'start' });
				} catch (error) {
					/* a shell without scrollIntoView is still usable */
				}
			}
		}, [view]);

		/* The meter is a picture of the remaining capacity, not a control: four
		   pips that fill as providers are pinned, so "how much room is left" is
		   legible before the user reaches for a switch that would refuse. It
		   counts what the picker treats as pinned, which is `providers`. */
		const meter = h(
			'div',
			{
				className: 'lg-settings-meter',
				'data-full': full ? 'true' : 'false',
				role: 'img',
				'aria-label': '已选 ' + pinned.length + ' 个，最多 ' + QUICK_MAX + ' 个',
			},
			h(
				'span',
				{ className: 'lg-settings-pips', 'aria-hidden': 'true' },
				Array.from({ length: QUICK_MAX }, (unused, index) =>
					h('span', {
						key: index,
						className: 'lg-settings-pip',
						'data-on': index < pinned.length ? 'true' : 'false',
					})
				)
			),
			h('span', { className: 'lg-settings-count' }, pinned.length + ' / ' + QUICK_MAX)
		);

		/* The 工作空间 switch: presence is the user's choice, and it is the same
		   preference the client effect reads to register or dispose the panel. A
		   switch here is the honest control — the panel is genuinely gone when it
		   is off, not hidden. */
		const workspaceRow = h(
			'div',
			{ className: 'lg-settings-utility' },
			h(
				'div',
				{ className: 'lg-settings-utilityRow' },
				h('span', { className: 'lg-settings-utilityGlyph', 'aria-hidden': 'true' }, '工'),
				h(
					'span',
					{ className: 'lg-settings-copy' },
					h('span', { className: 'lg-settings-name' }, '工作空间'),
					h('span', { className: 'lg-settings-note' }, '侧栏图标与整页工作台，关闭后不占位置')
				),
				h(
					'button',
					{
						type: 'button',
						className: 'lg-settings-switch',
						role: 'switch',
						'aria-checked': workspace ? 'true' : 'false',
						'aria-label': '工作空间',
						'data-on': workspace ? 'true' : 'false',
						onClick: () => {
							const next = !workspace;
							setWorkspace(next);
							if (prefs) prefs.set('workspaceView', next);
						},
					},
					h('span', { className: 'lg-settings-knob' })
				)
			)
		);

		const modelList = () => {
			if (current === null) return null;
			const entry = chosen(selection, current.id);
			const selectedCount = entry === undefined ? current.models.length : entry.length;
			const rows =
				current.models.length === 0
					? h('p', { className: 'lg-settings-empty' }, '这个供应商还没有可选的模型。')
					: h(
							'ul',
							{ className: 'lg-settings-modelList' },
							current.models.map((model, index) => {
								const on = entry === undefined || entry.indexOf(model.id) >= 0;
								return h(
									'li',
									{ className: 'lg-settings-model', key: model.id, style: { '--lg-row-index': index } },
									h(
										'button',
										{
											type: 'button',
											className: 'lg-settings-check',
											role: 'checkbox',
											'aria-checked': on ? 'true' : 'false',
											'aria-label': model.name,
											'data-on': on ? 'true' : 'false',
											onClick: () => toggleModel(current, model.id),
										},
										h('span', { className: 'lg-settings-checkMark', 'aria-hidden': 'true' }, on ? '✓' : ''),
										h('span', { className: 'lg-settings-modelName' }, model.name)
									)
								);
							})
						);
			return h(
				'div',
				{ className: 'lg-settings-view' },
				h(
					'div',
					{ className: 'lg-settings-viewHead' },
					h(
						'button',
						{ type: 'button', className: 'lg-settings-back', onClick: closeModels, 'aria-label': '返回供应商列表' },
						h('span', { className: 'lg-settings-backMark', 'aria-hidden': 'true' }, '‹'),
						'供应商'
					),
					h('span', { className: 'lg-settings-viewCount' }, selectedCount + ' / ' + current.models.length + ' 个模型')
				),
				h(
					'div',
					{ className: 'lg-settings-viewTitle' },
					h('span', { className: 'lg-settings-glyph', 'aria-hidden': 'true' }, (current.name.trim() || '?').slice(0, 1)),
					h('span', { className: 'lg-settings-name' }, current.name)
				),
				rows,
				h(
					'p',
					{ className: 'lg-settings-viewHint' },
					entry === undefined
						? '未单独挑选时，这个供应商的全部模型都会出现在选择器里；取消勾选即可只保留想要的模型。'
						: '只有勾选的模型会出现在选择器里；当前正在使用的模型始终可见。'
				)
			);
		};

		const board = () => {
			if (view !== null) return modelList();
			if (list.length === 0) return h('p', { className: 'lg-settings-empty' }, '尚未读取到供应商，请先打开一个会话。');
			return [
				h(
					'ul',
					{ className: 'lg-settings-list', key: 'list' },
					list.map((provider, index) => {
						const on = pinned.indexOf(provider.id) >= 0;
						const entry = chosen(selection, provider.id);
						const every = allChosen(selection, provider);
						/* At the limit an unchecked switch cannot do anything. Saying
						   so is the difference between a control that refuses and a
						   control that appears broken. */
						const blocked = !on && full;
						const note = !on
							? provider.models.length + ' 个模型'
							: every
								? '全部 ' + provider.models.length + ' 个模型'
								: (entry === undefined ? provider.models.length : entry.length) + ' / ' + provider.models.length + ' 个模型';
						return h(
							'li',
							{
								className: 'lg-settings-row',
								key: provider.id,
								style: { '--lg-row-index': index },
								'data-on': on ? 'true' : 'false',
								'data-blocked': blocked ? 'true' : 'false',
							},
							h('span', { className: 'lg-settings-glyph', 'aria-hidden': 'true' }, (provider.name.trim() || '?').slice(0, 1)),
							h(
								'span',
								{ className: 'lg-settings-copy' },
								h('span', { className: 'lg-settings-name' }, provider.name),
								h('span', { className: 'lg-settings-note' }, note)
							),
							/* A provider that is not in the quick list has no list to
							   configure: its choice is kept, not offered. */
							h(
								'button',
								{
									type: 'button',
									className: 'lg-settings-modelDoor',
									'aria-label': provider.name + ' 的模型',
									'aria-disabled': on ? 'false' : 'true',
									disabled: !on,
									'data-on': on ? 'true' : 'false',
									onClick: (event) => {
										if (on) openModels(provider, event.currentTarget);
									},
								},
								h('span', { className: 'lg-settings-modelDoorMark', 'aria-hidden': 'true' }, '›')
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
									onClick: () => toggleProvider(provider.id),
								},
								h('span', { className: 'lg-settings-knob' })
							)
						);
					})
				),
				h(
					'div',
					{ className: 'lg-settings-foot', key: 'foot' },
					h('span', { className: 'lg-settings-hint' }, full ? '已达上限，取消一个再选' : '勾选的供应商会出现在选择器顶部'),
					pinned.length === 0
						? null
						: h(
								'button',
								{
									type: 'button',
									className: 'lg-settings-reset',
									onClick: () => commit({ providers: [], models: {} }),
								},
								'清除'
							)
				),
			];
		};

		return h(
			'div',
			{ className: 'lg-settings' },
			workspaceRow,
			view === null
				? h(
						'div',
						{ className: 'lg-settings-head' },
						h('h2', { className: 'lg-settings-title' }, '快捷供应商'),
						meter
					)
				: null,
			view === null
				? h(
						'p',
						{ className: 'lg-settings-intro' },
						'模型选择器默认只列出这里勾选的供应商；其余供应商收在“所有供应商”里。',
						'一个都不勾选时，选择器会列出全部供应商。'
					)
				: null,
			/* The board is the page's one material object: a lit pane that the rows
			   sit ON, not a second card around a card. `lg-settings-glow` is the
			   light field painted INSIDE the pane's footprint — backdrop-filter has
			   nothing to frost on a white settings sheet, so the page supplies the
			   colour it refracts. */
			h(
				'div',
				{ className: 'lg-settings-stage' },
				h('div', { className: 'lg-settings-glow', 'aria-hidden': 'true' }),
				h('div', { className: 'lg-settings-board', ref: boardRef }, board())
			)
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
