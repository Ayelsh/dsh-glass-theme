/**
 * Navigate the live GUI, then look at it.
 *
 * Every other probe tool inspects the home screen, which is the one surface a
 * skin gets right first and the one that proves the least. This drives the app
 * the way a user would — click a control, wait for the route to settle, click
 * the next — and reports the resulting screen plus an optional screenshot, so
 * the pages that are actually hard (settings tabs, plugin manager, trajectory,
 * the right dock) can be reviewed at all.
 *
 *   node tools/nav.mjs --click "设置" --shot out.png
 *   node tools/nav.mjs --click '[data-slot="sidebar.settings"]' --wait 1200 --dump
 *   node tools/nav.mjs --theme light --click "设置" --click "外观" --shot light-settings.png
 *
 * Options:
 *   --click <text|selector>   click the first visible match; repeatable, applied in order
 *   --type <text>             type into the focused / first visible textbox
 *   --type-sel <selector>     type into this field instead of the first one (the
 *                             composer is not the first textbox in DOM order)
 *   --esc                     send Escape before continuing
 *   --shot <path>             write a screenshot after the clicks
 *   --clip x,y,w,h[,scale]    magnify one region instead of the whole viewport
 *   --dump                    print the visible headings, buttons and key boxes
 *   --wait <ms>               settle time after each click (default 900)
 *   --settle <ms>             settle time after the initial load (default 7000)
 *   --theme dark|light        emulate prefers-color-scheme before load
 *   --url <url>               defaults to LG_URL or http://127.0.0.1:50070/
 *   --vp <WxH>                set the viewport (e.g. 1190x900) to match a real window
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const many = (name) => {
  const out = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === name && argv[i + 1] !== undefined) out.push(argv[i + 1])
  return out
}
const one = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(name)

const url = one('--url', process.env.LG_URL ?? 'http://127.0.0.1:50070/')
const clicks = many('--click')
const types = many('--type')
const shot = one('--shot', null)
const dump = has('--dump')
const theme = one('--theme', null)
/* Reproduce the DESKTOP window's chrome. The real app runs inside Electron with
   `titleBarStyle: hidden` on win32, so the shell stamps `data-windows-titlebar`
   on <html> and reserves a 40px drag strip. A plain browser never does that, so
   without this flag every Windows-only rule (the fixed sidebar toggle, the
   logo-row height, the titlebar padding) is invisible to the harness — which is
   exactly how a toggle overlapping the brand mark shipped unnoticed. */
const winChrome = has('--win-chrome')
/* Match the user's real window. A defect that only appears at 1190x900 cannot be
   reproduced at 1440x960 — the settings panel is 800px fixed, so the gutters and
   the scrollbar position change with the viewport. */
const vp = (() => {
  const raw = one('--vp', null)
  if (raw === null) return null
  const [width, height] = raw.split('x').map(Number)
  return { width, height }
})()
const waitMs = Number(one('--wait', '900'))
const settleMs = Number(one('--settle', '7000'))

const cookie = execFileSync(process.execPath, [resolve(here, 'auth-cookie.mjs'), '--url', url], { encoding: 'utf8' }).trim()
const eq = cookie.indexOf('=')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Clicks either a CSS selector or the first visible element whose own text
 * matches. Matching on trimmed innerText keeps the command line readable for
 * localised labels, which have no stable selector at all.
 */
const clickScript = (target) => String.raw`(() => {
  const target = ${JSON.stringify(target)};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  let el = null;
  try { el = document.querySelector(target); } catch {}
  if (el === null || el === undefined) {
    // innerText keeps the newline between a label and its shortcut, so both
    // sides are whitespace-normalised before comparing.
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const want = norm(target);
    const pool = [...document.querySelectorAll('button,[role="button"],a,[role="tab"],[role="menuitem"],[role="treeitem"],li,label,[class*="_item_"],[class*="wCInkW_navCell"],[class*="ET65mq_trigger"]')];
    el = pool.find((n) => visible(n) && norm(n.innerText) === want)
      ?? pool.find((n) => visible(n) && norm(n.innerText).includes(want));
  }
  if (el === null || el === undefined) return { ok: false };
  el.scrollIntoView({ block: 'center' });
  el.click();
  return { ok: true, text: (el.innerText || '').trim().slice(0, 40), cls: String(el.className).slice(0, 60) };
})()`

const dumpScript = String.raw`(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
  };
  const seen = new Set();
  const text = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
  const heads = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,[role="heading"],[class*="pageTitle"],[class*="sectionTitle"],[class*="navTitle"],[class*="cardTitle"]')) {
    if (!vis(el)) continue;
    const t = text(el);
    if (t === '' || t.length > 80 || seen.has(t)) continue;
    seen.add(t);
    heads.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 48), text: t });
  }
  const buttons = [];
  for (const el of document.querySelectorAll('button,[role="button"],[role="tab"]')) {
    if (!vis(el)) continue;
    const t = text(el);
    if (t === '' || t.length > 40 || seen.has('b:' + t)) continue;
    seen.add('b:' + t);
    const r = el.getBoundingClientRect();
    buttons.push({ text: t, cls: String(el.className).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  }
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
      radius: cs.borderRadius, bg: cs.backgroundColor, bf: cs.backdropFilter, shadow: cs.boxShadow.slice(0, 90) };
  };
  return {
    heads: heads.slice(0, 40),
    buttons: buttons.slice(0, 60),
    boxes: {
      frame: box("[class*='BynINW_frame']"),
      centerCol: box("[class*='BynINW_centerCol']"),
      settingsPanel: box("[class*='wCInkW_panel']"),
      dialog: box("[class*='_o6lrb_dialog']"),
      overlay: box('[data-shell-overlay]'),
    },
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    skinTags: document.querySelectorAll('style[data-plugin="dsh-glass-theme"]').length,
  };
})()`

const browser = await launch(vp === null ? { headless: true } : { headless: true, ...vp })
try {
  const page = await browser.newPage()
  // A viewport narrower than the window decorations leave room for is the only
  // way to reproduce a real user's 1190x900 window: --window-size gives the
  // OUTER size, so the CSS viewport came back 1092x743 and every measurement
  // was taken at a width the user never sees.
  if (vp !== null) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    })
  }
  await page.cookie({ name: cookie.slice(0, eq), value: cookie.slice(eq + 1) })
  if (theme !== null) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  }
  if (winChrome) {
    await page.addInitScript(`(() => {
      const html = document.documentElement;
      html.setAttribute('data-windows-titlebar', '');
      html.setAttribute('data-platform', 'win32');
      html.style.setProperty('--dsh-windows-titlebar-height', '40px');
    })()`)
  }
  await page.goto(url, { settleMs })
  /* The boot script rewrites <html>'s attribute set once React mounts, so the
     init-script copy is gone by now; restamp after settle. CSS is all that
     matters here, and every rule keys off these two attributes. */
  if (winChrome) {
    await page.evaluate(`(() => {
      const html = document.documentElement;
      html.setAttribute('data-windows-titlebar', '');
      html.setAttribute('data-platform', 'win32');
      html.style.setProperty('--dsh-windows-titlebar-height', '40px');
      return true;
    })()`)
    await sleep(600)
  }

  // Dismiss the first-run onboarding card if it is up; it covers the home page.
  for (let i = 0; i < 3; i++) {
    const n = await page.evaluate(`(() => {
      const w = ['继续','Continue','知道了','确定','OK','开始使用','Got it'];
      let n = 0;
      for (const b of document.querySelectorAll('button,[role="button"]')) {
        const l = (b.innerText || '').trim();
        if (!w.includes(l)) continue;
        if (!b.getBoundingClientRect().width) continue;
        b.click(); n++;
      }
      return n;
    })()`)
    if (n === 0) break
    await sleep(600)
  }

  for (const target of clicks) {
    const r = await page.evaluate(clickScript(target))
    if (!r.ok) {
      console.log(`click "${target}" -> NOT FOUND`)
      break
    }
    console.log(`click "${target}" -> ${r.cls} "${r.text}"`)
    await sleep(waitMs)
  }

  /* `--type` focuses the first textbox in DOM order, which on the workspace page
     is the sidebar search field, not the composer. `--type-sel` names the field
     to type into when the order is not the one a user would follow. */
  const typeSel = one('--type-sel', null)
  for (const text of types) {
    const r = await page.evaluate(String.raw`(() => {
      const el = document.querySelector(${JSON.stringify(typeSel ?? 'textarea,[contenteditable="true"],input[type="text"]')});
      if (el === null) return { ok: false };
      el.focus();
      return { ok: true, cls: String(el.className).slice(0, 50) };
    })()`)
    if (!r.ok) {
      console.log('type -> no textbox')
      break
    }
    await page.send('Input.insertText', { text })
    console.log(`type -> ${r.cls} ${JSON.stringify(text.slice(0, 30))}`)
    await sleep(300)
  }

  for (const key of many('--key')) {
    // Real key events, so the skin's modality tracker sees them the way it would
    // see a user's. `--key Tab`, `--key Enter`, `--key Escape`.
    const code = key === 'Tab' ? 9 : key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
    })
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
    })
    await sleep(320)
    console.log(`key ${key}`)
  }

  if (has('--esc')) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(400)
  }

  if (dump) {
    const info = await page.evaluate(dumpScript)
    console.log(JSON.stringify(info, null, 2))
  }

  for (const sel of many('--mouse-sel')) {
    // A REAL pointer click, not `el.click()`. The difference matters: a synthetic
    // click leaves the element keyboard-focused, so `:focus-visible` matches and
    // any focus styling shows up in a screenshot where a user would never see it.
    const box = await page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`)
    if (box === null) {
      console.log(`mouse-sel "${sel}" -> NOT FOUND`)
      break
    }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      })
    }
    console.log(`mouse-sel "${sel}" -> real click at ${Math.round(box.x)},${Math.round(box.y)}`)
    await sleep(waitMs)
  }

  if (has('--eval')) {
    // Arbitrary in-page expression, printed as JSON. Keeps one-off questions
    // ("what paints that corner?") out of the tool file.
    const expr = one('--eval', 'null')
    const value = await page.evaluate(`(() => { const r = ${expr}; return JSON.stringify(r, null, 2) })()`)
    console.log(value)
  }

  if (has('--noskin')) {
    // A/B: strip the skin's stylesheets at runtime. Any shape that survives is
    // the shipped UI's, not ours — which settles "did I cause this?" without
    // reading the image.
    const n = await page.evaluate(String.raw`(() => {
      const tags = [...document.querySelectorAll('style[data-plugin="dsh-glass-theme"]')];
      for (const t of tags) t.remove();
      document.documentElement.removeAttribute('data-dsh-glass-theme');
      document.body.removeAttribute('data-dsh-glass-theme');
      return tags.length;
    })()`)
    console.log(`noskin: removed ${n} sheet(s)`)
    await sleep(500)
  }

  if (has('--pseudo')) {
    // A seam or stray shape that hit-testing cannot explain is almost always a
    // pseudo-element: those never appear in `elementsFromPoint`.
    const found = await page.evaluate(String.raw`(() => {
      const out = [];
      const walk = (el, depth) => {
        if (depth > 16) return;
        for (const which of ['::before', '::after']) {
          const cs = getComputedStyle(el, which);
          const content = cs.content;
          if (content === 'none' || content === 'normal' || content === '') continue;
          const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
            || (cs.backgroundImage && cs.backgroundImage !== 'none')
            || (cs.boxShadow && cs.boxShadow !== 'none');
          if (!paints) continue;
          const r = el.getBoundingClientRect();
          out.push({
            host: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').join('.') : ''),
            which, content,
            hostBox: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            bg: cs.backgroundColor,
            bgi: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 120),
            shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 90),
            inset: cs.inset, size: [cs.width, cs.height].join(' x '),
            radius: cs.borderRadius, corner: cs.cornerShape,
            pos: cs.position, z: cs.zIndex, opacity: cs.opacity,
          });
        }
        for (const c of el.children) walk(c, depth + 1);
      };
      walk(document.body, 0);
      return out;
    })()`)
    console.log(`pseudo-elements that paint (${found.length}):`)
    for (const f of found) {
      console.log(`\n  ${f.host} ${f.which}  host=[${f.hostBox.join(',')}]`)
      console.log(`     content=${f.content} pos=${f.pos} z=${f.z} size=${f.size} inset=${f.inset} op=${f.opacity} radius=${f.radius} corner=${f.corner}`)
      if (f.bg !== 'rgba(0, 0, 0, 0)') console.log(`     bg=${f.bg}`)
      if (f.bgi) console.log(`     bgi=${f.bgi}`)
      if (f.shadow) console.log(`     shadow=${f.shadow}`)
    }
  }

  if (shot !== null) {
    mkdirSync(dirname(resolve(shot)), { recursive: true })
    // screenshot() writes the file itself; it also resets device metrics, so it
    // must be the last thing that touches the page.
    const clip = (() => {
      const raw = one('--clip', null)
      if (raw === null) return null
      const [x, y, width, height, scale] = raw.split(',').map(Number)
      return { x, y, width, height, scale: scale ?? 3 }
    })()
    const written = await page.screenshot(resolve(shot), vp === null ? { clip } : { clip, ...vp })
    console.log(`shot: ${written}`)
  }
} finally {
  await browser.close()
}
