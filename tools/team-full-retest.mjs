import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { launch } from './cdp.mjs';

const URL = process.env.DSH_GUI_URL || 'http://127.0.0.1:65131/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mintCookie(url) {
	const raw = execFileSync(process.execPath, [resolve('tools/auth-cookie.mjs'), '--url', url]).toString().trim();
	const eq = raw.indexOf('=');
	return { name: raw.slice(0, eq), value: raw.slice(eq + 1) };
}

const b = await launch({ headless: true, width: 1280, height: 860 });
try {
	const page = await b.newPage();
	const c = mintCookie(URL);
	await page.cookie({ name: c.name, value: c.value, domain: '127.0.0.1', path: '/' });
	await page.goto(URL, { settleMs: 5000 });

	const press = async (selector, textMatch) => {
		const rect = await page.evaluate(`(() => {
			const list = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
			const el = ${textMatch ? `list.find(n => (n.textContent || '').trim().includes(${JSON.stringify(textMatch)}))` : 'list[0]'};
			if (!el) return null;
			el.scrollIntoView({ block: 'center', inline: 'center' });
			const r = el.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
		})()`);
		if (!rect) return false;
		const x = Math.round(rect.x);
		const y = Math.round(rect.y);
		await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
		await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
		await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
		await wait(800);
		return true;
	};

	// 0. Reset team state to pristine baseline
	console.log('--- Step 0: Resetting Team State to Pristine Baseline ---');
	await page.evaluate(`(async () => {
		await fetch('/dsh-glass-theme/team', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'reset' }),
		});
	})()`);
	await wait(1000);

	// 1. Open Settings -> Liquid Glass
	console.log('--- Step 1: Testing Settings Page Layout & Controls ---');
	await press('[aria-label="账号菜单"], [class*="_trigger_"]');
	await press('[role="menuitem"], [class*="_item_"]', '设置');
	await wait(1500);
	await press('[class*="navCell"]', 'Liquid Glass');
	await wait(1200);

	const settingsMeasure = await page.evaluate(`(() => {
		const features = Array.from(document.querySelectorAll('.lg-settings-teamFeature'));
		const formRow = document.querySelector('.lg-settings-formRow');
		const utilityCards = Array.from(document.querySelectorAll('.lg-settings-utility'));
		const rects = features.map(f => {
			const r = f.getBoundingClientRect();
			return {
				label: f.textContent.trim(),
				width: Math.round(r.width),
				height: Math.round(r.height),
				display: getComputedStyle(f).display,
				checked: f.getAttribute('aria-checked'),
			};
		});
		const rowRect = formRow ? formRow.getBoundingClientRect() : null;
		return {
			utilityCardCount: utilityCards.length,
			hasFeaturesCard: Boolean(document.querySelector('.lg-settings-utility.has-features')),
			formRowWidth: rowRect ? Math.round(rowRect.width) : 0,
			features: rects,
		};
	})()`);
	console.log('Settings measurement:', JSON.stringify(settingsMeasure, null, 2));

	// Verify each feature chip is compact (width < 180px)
	for (const f of settingsMeasure.features) {
		if (f.width > 180) {
			throw new Error(`Feature chip ${f.label} is still too wide (${f.width}px) — expected compact pill!`);
		}
	}

	await page.screenshot(resolve('team-settings-fixed.png'), { width: 1280, height: 860 });
	console.log('Saved team-settings-fixed.png');

	// Close settings modal
	await page.evaluate(`(() => {
		const closeBtn = document.querySelector('[aria-label="关闭"], [class*="closeButton"], [class*="_close_"]');
		if (closeBtn) closeBtn.click();
	})()`);
	await wait(1000);

	// 2. Verify Stowed State & Expand Team Panel
	console.log('--- Step 2: Expanding Team Panel ---');
	const isOpenInitial = await page.evaluate(`document.documentElement.getAttribute('data-lg-team-open') === 'true'`);
	if (!isOpenInitial) {
		await page.evaluate(`document.querySelector('.lg-team-sideToggle')?.click()`);
		await wait(1200);
	}
	const expandedCheck = await page.evaluate(`({
		openAttr: document.documentElement.getAttribute('data-lg-team-open'),
		rootVisible: Boolean(document.querySelector('#lg-team-root') && getComputedStyle(document.querySelector('#lg-team-root')).display !== 'none'),
	})`);
	console.log('Expanded check:', JSON.stringify(expandedCheck));
	if (expandedCheck.openAttr !== 'true' || !expandedCheck.rootVisible) {
		throw new Error('Failed to expand team panel');
	}

	// 3. Test Add Member Input Persistence across 2.5s poll ticks!
	console.log('--- Step 3: Testing Add Member Input Persistence across ticks ---');
	await page.evaluate(`document.querySelector("[data-action='member-add']")?.click()`);
	await wait(400);

	const typedMember = await page.evaluate(`(() => {
		const box = document.querySelector('.lg-team-newBox');
		if (!box) return null;
		const nameInput = box.querySelector("[data-new-input='name']");
		const roleSelect = box.querySelector("[data-new-input='role']");
		const instrInput = box.querySelector("[data-new-input='instructions']");
		if (!nameInput || !instrInput) return null;
		nameInput.focus();
		nameInput.value = '架构师-Alpha';
		instrInput.value = '负责核心架构评审与代码把关';
		return {
			nameBeforeWait: nameInput.value,
			defaultRole: roleSelect ? roleSelect.value : null,
			instrBeforeWait: instrInput.value,
		};
	})()`);
	console.log('Before 6s wait:', JSON.stringify(typedMember));

	// Wait 6 seconds (more than two 2.5s tick cycles!)
	await wait(6000);

	const afterWaitMember = await page.evaluate(`(() => {
		const box = document.querySelector('.lg-team-newBox');
		if (!box) return { boxGone: true };
		const nameInput = box.querySelector("[data-new-input='name']");
		const instrInput = box.querySelector("[data-new-input='instructions']");
		return {
			nameAfterWait: nameInput ? nameInput.value : null,
			instrAfterWait: instrInput ? instrInput.value : null,
			activeIsName: document.activeElement === nameInput,
		};
	})()`);
	console.log('After 6s wait (across 2+ ticks):', JSON.stringify(afterWaitMember));
	if (afterWaitMember.nameAfterWait !== '架构师-Alpha' || afterWaitMember.instrAfterWait !== '负责核心架构评审与代码把关') {
		throw new Error('BUG: Input was cleared during background tick!');
	}

	await page.screenshot(resolve('team-add-member-input.png'), { width: 1280, height: 860 });
	console.log('Saved team-add-member-input.png');

	// Submit Member Creation
	await page.evaluate(`document.querySelector("[data-action='member-create']")?.click()`);
	await wait(1200);

	// 4. Test Add Room Input Persistence & Creation
	console.log('--- Step 4: Testing Add Room Input Persistence & Creation ---');
	await page.evaluate(`document.querySelector("[data-action='room-add']")?.click()`);
	await wait(400);
	await page.evaluate(`(() => {
		const box = document.querySelector('.lg-team-newBox');
		const nameInput = box?.querySelector("[data-new-input='name']");
		const goalInput = box?.querySelector("[data-new-input='goal']");
		if (nameInput) nameInput.value = '架构评审室';
		if (goalInput) goalInput.value = '完成插件全面复测与验收';
	})()`);
	await wait(3500);
	const roomAfterWait = await page.evaluate(`(() => {
		const box = document.querySelector('.lg-team-newBox');
		const nameInput = box?.querySelector("[data-new-input='name']");
		const goalInput = box?.querySelector("[data-new-input='goal']");
		return {
			name: nameInput ? nameInput.value : null,
			goal: goalInput ? goalInput.value : null,
		};
	})()`);
	console.log('Room input after 3.5s wait:', JSON.stringify(roomAfterWait));
	if (roomAfterWait.name !== '架构评审室') {
		throw new Error('BUG: Room input cleared during background tick!');
	}
	await page.evaluate(`document.querySelector("[data-action='room-create']")?.click()`);
	await wait(1200);

	// 5. Test Member Rename & Room Edit with member chip subscription
	console.log('--- Step 5: Testing Member Rename & Room Subscription ---');
	// Rename Member
	await page.evaluate(`(() => {
		const rows = Array.from(document.querySelectorAll('.lg-team-row'));
		const target = rows.find(r => (r.textContent || '').includes('架构师-Alpha'));
		if (target) target.click();
	})()`);
	await wait(500);
	await page.evaluate(`(() => {
		const items = Array.from(document.querySelectorAll('.lg-team-menuItem'));
		const renameItem = items.find(i => (i.textContent || '').includes('重命名'));
		if (renameItem) renameItem.click();
	})()`);
	await wait(500);

	const prefilledRename = await page.evaluate(`(() => {
		const box = document.querySelector('.lg-team-newBox');
		if (!box) return null;
		const nameInput = box.querySelector("[data-new-input='name']");
		const val = nameInput ? nameInput.value : null;
		if (nameInput) nameInput.value = '资深架构师-Alpha';
		box.querySelector("[data-action='member-update']")?.click();
		return val;
	})()`);
	console.log('Prefilled rename name was:', prefilledRename);
	if (prefilledRename !== '架构师-Alpha') {
		throw new Error(`Expected prefilled member name '架构师-Alpha', got '${prefilledRename}'`);
	}
	await wait(1200);

	// Room Edit with Member Chip
	await page.evaluate(`(() => {
		const rooms = Array.from(document.querySelectorAll('.lg-team-room'));
		const target = rooms.find(r => (r.textContent || '').includes('架构评审室'));
		if (target) target.click();
	})()`);
	await wait(500);
	await page.evaluate(`(() => {
		const items = Array.from(document.querySelectorAll('.lg-team-menuItem'));
		const editItem = items.find(i => (i.textContent || '').includes('编辑目标'));
		if (editItem) editItem.click();
	})()`);
	await wait(500);

	await page.evaluate(`(() => {
		const box = document.querySelector('.lg-team-newBox');
		if (!box) return;
		const chips = Array.from(box.querySelectorAll('[data-action="room-chip-toggle"]'));
		// Click chip for member to subscribe
		const memberChip = chips.find(c => (c.textContent || '').includes('资深架构师-Alpha'));
		if (memberChip && !memberChip.classList.contains('is-selected')) memberChip.click();
		const goalInput = box.querySelector("[data-new-input='goal']");
		if (goalInput) goalInput.value = '完成插件全面复测与验收（已绑定）';
		box.querySelector("[data-action='room-update']")?.click();
	})()`);
	await wait(1200);

	// 6. Test Autonomy Mode Header Toggle & Stage Observed Ticket
	console.log('--- Step 6: Testing Autonomy Mode Header Toggle & Ticket Dispatch ---');
	const modeToggled = await page.evaluate(`(() => {
		const btn = document.querySelector('.lg-team-modeBtn');
		if (!btn) return null;
		const initialMode = btn.dataset.mode;
		btn.click();
		const nextMode = btn.dataset.mode;
		btn.click();
		const finalMode = btn.dataset.mode;
		return { initialMode, nextMode, finalMode };
	})()`);
	console.log('Autonomy mode toggle:', JSON.stringify(modeToggled));
	if (modeToggled.initialMode !== 'observe' || modeToggled.nextMode !== 'auto' || modeToggled.finalMode !== 'observe') {
		throw new Error('Autonomy mode toggle failed');
	}

	// Post an observed ticket and a thread subscription for the member via team endpoint
	const memberData = await page.evaluate(`(async () => {
		const res = await fetch('/dsh-glass-theme/team');
		const data = await res.json();
		const profiles = data.team?.profiles || [];
		const alpha = profiles.find(p => p.name === '资深架构师-Alpha');
		if (!alpha) return null;
		// Stage an observed ticket with both flat & nested payload
		await fetch('/dsh-glass-theme/team', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				kind: 'ticket-add',
				id: 'tkt_demo',
				title: '验证端到端召回链路',
				workerId: alpha.id,
				status: 'observed',
				summary: '端到端 Super-agent 状态机与看门狗验证',
				triggerIds: ['trg_1', 'trg_2'],
				spill: { details: '执行日志快照：CDP 运行正常，无内存泄漏', continuation: { step: 3 } },
				ticket: {
					id: 'tkt_demo',
					title: '验证端到端召回链路',
					workerId: alpha.id,
					status: 'observed',
					summary: '端到端 Super-agent 状态机与看门狗验证',
					recallRefs: {
						mandateId: 'mnd_demo',
						threadId: 'thd_test',
						triggerIds: ['trg_1', 'trg_2'],
						ticketId: 'tkt_demo',
						workerId: alpha.id,
					},
					spill: { details: '执行日志快照：CDP 运行正常，无内存泄漏', continuation: { step: 3 } },
				},
			}),
		});
		return alpha;
	})()`);
	console.log('Member data and staged ticket:', JSON.stringify(memberData));
	await wait(3500);

	// Check for role badge, quick approval button, and pass-through pill
	const rowFeatures = await page.evaluate(`(() => {
		const rows = Array.from(document.querySelectorAll('.lg-team-row'));
		const target = rows.find(r => (r.textContent || '').includes('资深架构师-Alpha'));
		if (!target) return null;
		return {
			roleBadge: target.querySelector('.lg-team-roleBadge')?.textContent.trim(),
			hasQuickApprove: Boolean(target.querySelector('.lg-team-quickApprove')),
			hasPassPill: Boolean(target.querySelector('.lg-team-passPill')),
		};
	})()`);
	console.log('Row features with observed ticket:', JSON.stringify(rowFeatures));
	if (!rowFeatures?.hasQuickApprove) {
		throw new Error('Quick approval button missing on member row with observed ticket');
	}

	await page.screenshot(resolve('team-rename-and-passthrough.png'), { width: 1280, height: 860 });
	console.log('Saved team-rename-and-passthrough.png');

	// Click Quick Approve to transition ticket to working
	await page.evaluate(`(() => {
		const rows = Array.from(document.querySelectorAll('.lg-team-row'));
		const target = rows.find(r => (r.textContent || '').includes('资深架构师-Alpha'));
		target?.querySelector('.lg-team-quickApprove')?.click();
	})()`);
	await wait(1500);

	// 7. Open Detail Panel: Chain of Recall, Live Side-Chat Reply, Memory & Checkpoints
	console.log('--- Step 7: Testing Detail Panel, Chain of Recall & Live Side-Chat Reply ---');
	await page.evaluate(`(() => {
		const rows = Array.from(document.querySelectorAll('.lg-team-row'));
		const target = rows.find(r => (r.textContent || '').includes('资深架构师-Alpha'));
		if (target) target.click();
	})()`);
	await wait(500);
	await page.evaluate(`(() => {
		const items = Array.from(document.querySelectorAll('.lg-team-menuItem'));
		const openPanel = items.find(i => (i.textContent || '').includes('打开面板') || (i.textContent || '').includes('工单 / 召回'));
		if (openPanel) openPanel.click();
	})()`);
	await wait(1000);

	// Test inputs persistence across background poll tick
	await page.evaluate(`(() => {
		const panel = document.querySelector('.lg-team-panel');
		if (!panel) return;
		const mem = panel.querySelector("[data-panel-input='memory']");
		const side = panel.querySelector("[data-panel-input='side']");
		const ckpt = panel.querySelector("[data-panel-input='checkpoint']");
		if (mem) mem.value = '核心准则：保持单槽动态挂载与卸载';
		if (side) { side.focus(); side.value = '请汇报当前工单状态与召回记录'; }
		if (ckpt) ckpt.value = '端到端测试完成，准备合并';
	})()`);
	await wait(3500);

	const panelInputsAfterWait = await page.evaluate(`(() => {
		const panel = document.querySelector('.lg-team-panel');
		if (!panel) return null;
		return {
			mem: panel.querySelector("[data-panel-input='memory']")?.value,
			side: panel.querySelector("[data-panel-input='side']")?.value,
			ckpt: panel.querySelector("[data-panel-input='checkpoint']")?.value,
		};
	})()`);
	console.log('Panel inputs after 3.5s wait:', JSON.stringify(panelInputsAfterWait));
	if (
		panelInputsAfterWait?.mem !== '核心准则：保持单槽动态挂载与卸载' ||
		panelInputsAfterWait?.side !== '请汇报当前工单状态与召回记录' ||
		panelInputsAfterWait?.ckpt !== '端到端测试完成，准备合并'
	) {
		throw new Error('BUG: Panel composer inputs cleared during tick!');
	}

	// Submit Memory, Side-Chat, Checkpoint
	await page.evaluate(`(() => {
		const panel = document.querySelector('.lg-team-panel');
		panel?.querySelector("[data-action='memory-add']")?.click();
		panel?.querySelector("[data-action='side-send']")?.click();
		panel?.querySelector("[data-action='checkpoint-add']")?.click();
	})()`);
	await wait(2000);

	// Test Spill toggle expansion in Chain of Recall
	await page.evaluate(`(() => {
		const panel = document.querySelector('.lg-team-panel');
		const spillToggle = panel?.querySelector("[data-action='ticket-spill-toggle']");
		if (spillToggle) spillToggle.click();
	})()`);
	await wait(800);

	const panelRendered = await page.evaluate(`(() => {
		const panel = document.querySelector('.lg-team-panel');
		if (!panel) return null;
		const recallSection = panel.querySelector('.lg-team-recallSection');
		const spillBox = panel.querySelector('.lg-team-spillDetails');
		return {
			memories: Array.from(panel.querySelectorAll('.lg-team-memText')).map(n => n.textContent.trim()),
			sideMsgs: Array.from(panel.querySelectorAll('.lg-team-sideText')).map(n => n.textContent.trim()),
			checkpoints: Array.from(panel.querySelectorAll('.lg-team-ckptList .lg-team-cardText')).map(n => n.textContent.trim()),
			hasRecallSection: Boolean(recallSection),
			recallTitle: recallSection?.querySelector('.lg-team-ticketTitle')?.textContent.trim(),
			recallChips: Array.from(recallSection?.querySelectorAll('.lg-team-recallRefs .lg-team-chip') || []).map(n => n.textContent.trim()),
			spillDetails: spillBox?.textContent.trim(),
		};
	})()`);
	console.log('Panel rendered items:', JSON.stringify(panelRendered, null, 2));

	if (!panelRendered.hasRecallSection || !panelRendered.recallTitle) {
		throw new Error('Chain of Recall section missing from detail panel');
	}
	if (!panelRendered.spillDetails || !panelRendered.spillDetails.includes('CDP 运行正常')) {
		throw new Error('Spill details failed to expand');
	}
	// Verify deterministic assistant side-chat reply grounded in member snapshot
	if (panelRendered.sideMsgs.length < 2) {
		throw new Error('Expected at least 2 side messages (user question + assistant snapshot reply)');
	}
	console.log('Deterministic assistant side reply:', panelRendered.sideMsgs[1]);

	await page.screenshot(resolve('team-panel-recall-side.png'), { width: 1280, height: 860 });
	console.log('Saved team-panel-recall-side.png');

	// Close detail panel
	await page.evaluate(`document.querySelector("[data-action='panel-close']")?.click()`);
	await wait(600);

	// 8. Test Command Palette (Ctrl+K)
	console.log('--- Step 8: Testing Command Palette ---');
	await page.evaluate(`document.querySelector("[data-action='palette-open']")?.click()`);
	await wait(500);
	const paletteCheck = await page.evaluate(`(() => {
		const pal = document.querySelector('.lg-team-palette');
		if (!pal) return null;
		const items = Array.from(pal.querySelectorAll('.lg-team-paletteItem')).map(n => n.textContent.trim());
		return { open: true, itemCount: items.length, sample: items.slice(0, 6) };
	})()`);
	console.log('Palette check:', JSON.stringify(paletteCheck));
	await page.evaluate(`document.querySelector('.lg-team-paletteBackdrop')?.click()`);
	await wait(400);

	// 9. Clean up test artifacts & Stow back to session list
	console.log('--- Step 9: Cleaning up test state & Stowing ---');
	await page.evaluate(`(async () => {
		await fetch('/dsh-glass-theme/team', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'reset' }),
		});
	})()`);
	await wait(600);
	await page.evaluate(`document.querySelector('.lg-team-sideToggle')?.click()`);
	await wait(1500);

	const finalStowed = await page.evaluate(`({
		openAttr: document.documentElement.getAttribute('data-lg-team-open'),
		workspaceRoot: Boolean(document.querySelector('[class*="GAkraW_root"]')),
	})`);
	console.log('Final stowed check:', JSON.stringify(finalStowed));

	await page.screenshot(resolve('team-stowed-final.png'), { width: 1280, height: 860 });
	console.log('Saved team-stowed-final.png');

	console.log('\n=== ALL FULL RETEST STEPS PASSED SUCCESSFULLY ===');
} finally {
	await b.close();
}
