// Probe the provider-aware peak badge across providers on a NON-primary
// session (session row 2), restoring the original model + effort afterwards.
// Expectations at a workday 14:00-18:00 Beijing timestamp:
//   zai   → 高峰 ≈1×  (quota burns at standard rate)
//   deepseek → 高峰 ≈2× (price doubles)
//   workbuddy → NO badge at all (no schedule)
import { launch } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const URL_BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:56465/';
const out = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', URL_BASE]).toString().trim();
const eq = out.indexOf('=');
const b = await launch({ headless: true, width: 1400, height: 950 });
const clickAt = async (page, x, y) => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
};
const readBadge = (page) => page.evaluate(`(() => {
  const badge=document.querySelector('.lg-picker-card .lg-picker-badge');
  return badge ? { tone: badge.getAttribute('data-lg-tone'), text: badge.textContent, title: badge.title } : null;
})()`);
try {
  const page = await b.newPage();
  await page.cookie({ name: out.slice(0, eq), value: out.slice(eq + 1), domain: '127.0.0.1', path: '/' });
  await page.goto(URL_BASE, { settleMs: 12000 });
  await page.evaluate(`(() => { const r=[...document.querySelectorAll('[class*=hIlkoa_sessionRow]')]; if(r[1]) r[1].click(); return 1 })()`);
  await new Promise(r => setTimeout(r, 7000));
  // Remember the session's original choice, then walk providers.
  const orig = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    return ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot().current;
  })()`);
  console.log('ORIGINAL', JSON.stringify(orig));
  const switchTo = async (provider, model) => {
    await page.evaluate(`(() => {
      const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
      return ctx.get('modelDirectories').directoryFor(v.key).select({ provider: ${JSON.stringify(provider)}, model: ${JSON.stringify(model)} });
    })()`);
    await new Promise(r => setTimeout(r, 1200));
  };
  const openAndRead = async (label) => {
    // close if open, then open fresh so the card renders the current provider
    await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); if(t&&t.getAttribute('aria-expanded')==='true') t.click(); return 1 })()`);
    await new Promise(r => setTimeout(r, 300));
    const box = await page.evaluate(`(() => { const t=document.querySelector('.lg-picker-trigger'); const r=t.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`);
    await clickAt(page, box.x, box.y);
    await new Promise(r => setTimeout(r, 700));
    console.log(label, JSON.stringify(await readBadge(page)));
    await page.evaluate(`(() => { document.querySelector('.lg-picker-trigger').click(); return 1 })()`);
    await new Promise(r => setTimeout(r, 300));
  };
  await openAndRead('BADGE-ZAI');
  // find one deepseek-account model and one workbuddy model from the groups
  const models = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    const s=ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot();
    return s.groups.map(g => ({ provider: g.id, first: (g.models[0]||{}).id, n: g.models.length }));
  })()`);
  console.log('GROUPS', JSON.stringify(models));
  const ds = models.find(g => String(g.provider).toLowerCase().replace(/[^a-z0-9]/g, '') === 'deepseekaccount');
  const wb = models.find(g => g.provider === 'workbuddy');
  if (ds) { await switchTo(ds.provider, ds.first); await openAndRead('BADGE-DEEPSEEK'); }
  if (wb) { await switchTo(wb.provider, wb.first); await openAndRead('BADGE-WORKBUDDY'); }
  // restore the original selection (with its effort)
  await switchTo(orig.provider, orig.model);
  if (orig.reasoningEffort != null) {
    await page.evaluate(`(() => {
      const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
      return ctx.get('modelDirectories').directoryFor(v.key).select({ provider: ${JSON.stringify(orig.provider)}, model: ${JSON.stringify(orig.model)}, reasoningEffort: ${JSON.stringify(orig.reasoningEffort)} });
    })()`);
    await new Promise(r => setTimeout(r, 800));
  }
  // glm default effort probe used "low" earlier; if original had none and the
  // model is glm-5.3-flash, restore the model default (max) explicitly.
  if (orig.reasoningEffort == null && orig.model === 'glm-5.3-flash') {
    await page.evaluate(`(() => {
      const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
      return ctx.get('modelDirectories').directoryFor(v.key).select({ provider: ${JSON.stringify(orig.provider)}, model: ${JSON.stringify(orig.model)}, reasoningEffort: 'max' });
    })()`);
    await new Promise(r => setTimeout(r, 800));
  }
  const restored = await page.evaluate(`(() => {
    const ctx=window.__lgCtx; const v=ctx.get('uiSession').current.value;
    return ctx.get('modelDirectories').directoryFor(v.key).store.getSnapshot().current;
  })()`);
  console.log('RESTORED', JSON.stringify(restored));
} finally { process.exit(0); }
