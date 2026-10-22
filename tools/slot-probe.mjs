import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = 'http://127.0.0.1:54810/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
try {
	const page = await b.newPage();
	await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
	console.error('goto start'); await page.goto(URL_BASE, { settleMs: 12000 }); console.error('goto done');
	console.error('eval start'); const r = await page.evaluate(`(() => {
		const ctx = window.__lgCtx;
		if (!ctx) return { error: 'no ctx' };
		const info = { hasSlots: !!ctx.slots, slotsKeys: ctx.slots ? Object.keys(ctx.slots) : null };
		if (ctx.slots) {
			info.hasInject = typeof ctx.slots.inject;
			info.hasRegister = typeof ctx.slots.register;
			try {
				const ret = ctx.slots.register({ name: 'settings.section', id: 'probe-x', order: 99, label: () => 'ProbeX', inject: [] }, () => null);
				info.registerReturn = typeof ret + (ret && ret.dispose ? ' (has dispose)' : ''); try { info.slotNames = ctx.slots.list ? undefined : undefined; } catch(e){}
			} catch (e) { info.registerErr = String(e); }
		}
		return info;
	})()`);
	console.log(JSON.stringify(r, null, 2)); console.error('logged');
} finally {
	process.exit(0);
}
