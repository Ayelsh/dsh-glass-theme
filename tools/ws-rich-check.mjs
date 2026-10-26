// tools/ws-rich-check.mjs
//
// Unit checks for the detail panel's description renderer (src/workspace.js):
// the sanitizer's whitelist, the markdown path, URL absolutization and the
// `show` record unwrapping. The functions live inside the client module, so
// the block is sliced out and evaluated with two stubs for its module-level
// dependencies (safeParse, asList). Run: node tools/ws-rich-check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'workspace.js'), 'utf8');
const start = src.indexOf('\t/* TAPD 的描述有两种来源');
const end = src.indexOf('\t/* A due date is read');
if (start === -1 || end === -1 || end <= start) throw new Error('renderer block not found in src/workspace.js');
const block = src.slice(start, end);
const stubs = `
	const safeParse = (text) => { try { return JSON.parse(text); } catch { return null; } };
	const asList = (value) => {
		if (Array.isArray(value)) return value;
		if (value === null || typeof value !== 'object') return [];
		if (Array.isArray(value.data)) return value.data;
		if (Array.isArray(value.list)) return value.list;
		if (Array.isArray(value.items)) return value.items;
		if (value.data !== undefined && value.data !== null) return asList(value.data);
		return [];
	};
`;
const factory = new Function(`${stubs}${block}\nreturn { escapeHtml, absolutizeUrl, sanitizeRichHtml, markdownToHtml, descriptionToRichHtml, detailFromShow, isTapdKind };`);
const { escapeHtml, absolutizeUrl, sanitizeRichHtml, markdownToHtml, descriptionToRichHtml, detailFromShow, isTapdKind } = factory();

let failures = 0;
const check = (name, fn) => {
	try {
		fn();
		console.log(`ok   ${name}`);
	} catch (error) {
		failures += 1;
		console.error(`FAIL ${name}: ${error && error.message ? error.message : error}`);
	}
};
const expect = (condition, message) => {
	if (!condition) throw new Error(message);
};

check('escapeHtml neutralizes markup and quotes', () => {
	expect(escapeHtml('<img src=x onerror="a&b">') === '&lt;img src=x onerror=&quot;a&amp;b&quot;&gt;', escapeHtml('<img src=x onerror="a&b">'));
});

check('absolutizeUrl pins protocol- and site-relative TAPD addresses to https', () => {
	expect(absolutizeUrl('//img.tapd.cn/a.png') === 'https://img.tapd.cn/a.png', absolutizeUrl('//img.tapd.cn/a.png'));
	expect(absolutizeUrl('/images/b.png') === 'https://www.tapd.cn/images/b.png', absolutizeUrl('/images/b.png'));
	expect(absolutizeUrl('https://a.b/c') === 'https://a.b/c', absolutizeUrl('https://a.b/c'));
	expect(absolutizeUrl('') === '', 'empty url');
});

check('sanitizer drops scripts with their content and keeps prose around them', () => {
	const out = sanitizeRichHtml('<p>前文</p><script>alert(1)</script><p>后文</p>');
	expect(!out.includes('script') && !out.includes('alert'), out);
	expect(out.includes('前文') && out.includes('后文'), out);
});

check('sanitizer strips event handlers and styles but keeps the safe attributes', () => {
	const out = sanitizeRichHtml('<img src="https://img.tapd.cn/a.png" onerror="x" style="width:9px" alt="截图" width="600">');
	expect(out === '<img src="https://img.tapd.cn/a.png" alt="截图" width="600" loading="lazy">', out);
	const link = sanitizeRichHtml('<a href="javascript:alert(1)">x</a>');
	expect(link.startsWith('<a') && !link.includes('javascript:') && link.includes('target="_blank"'), link);
});

check('an img without a usable src is dropped entirely, everything else is kept', () => {
	const out = sanitizeRichHtml('<p>看</p><img src="relative.png"><p>图</p>');
	expect(out === '<p>看</p><p>图</p>', out);
});

check('unknown tags unwrap, drop-with-content tags remove their body', () => {
	expect(sanitizeRichHtml('<custom>文字</custom>') === '文字', sanitizeRichHtml('<custom>文字</custom>'));
	expect(sanitizeRichHtml('<iframe src="https://a.b"></iframe>尾巴') === '尾巴', sanitizeRichHtml('<iframe src="https://a.b"></iframe>尾巴'));
	expect(sanitizeRichHtml('<style>p{}</style>ok') === 'ok', sanitizeRichHtml('<style>p{}</style>ok'));
});

check('markdown path renders headings, emphasis, code, lists and links', () => {
	const out = markdownToHtml('# 标题\n\n正文 **加粗** 和 `代码`\n\n- 一\n- 二\n\n[原文](https://www.tapd.cn/x)');
	expect(out.includes('<h3>标题</h3>'), out);
	expect(out.includes('<strong>加粗</strong>') && out.includes('<code>代码</code>'), out);
	expect(out.includes('<ul><li>一</li><li>二</li></ul>'), out);
	expect(out.includes('<a href="https://www.tapd.cn/x"'), out);
});

check('markdown images become lazy absolute imgs; plain text stays escaped', () => {
	const out = markdownToHtml('前![截图](//img.tapd.cn/a.png)后\n行2 <b>');
	expect(out.includes('<img src="https://img.tapd.cn/a.png" alt="截图" loading="lazy">'), out);
	expect(out.includes('行2 &lt;b&gt;'), out);
});

check('markdown pipe tables become thead/tbody', () => {
	const out = markdownToHtml('| 字段 | 值 |\n| --- | --- |\n| 状态 | 开发中 |');
	expect(out.includes('<thead><tr><th>字段</th><th>值</th></tr></thead>'), out);
	expect(out.includes('<tbody><tr><td>状态</td><td>开发中</td></tr></tbody>'), out);
});

check('descriptionToRichHtml picks the html path for html and markdown otherwise', () => {
	expect(descriptionToRichHtml('<p>富文本</p>') === '<p>富文本</p>', descriptionToRichHtml('<p>富文本</p>'));
	expect(descriptionToRichHtml('纯文本 <script>x</script> 描述').includes('&lt;script&gt;'), descriptionToRichHtml('纯 <script>x</script>'));
	expect(descriptionToRichHtml('   ') === '', 'blank description');
	expect(descriptionToRichHtml(null) === '', 'null description');
});

check('detailFromShow unwraps bare objects, lists and single-key envelopes', () => {
	const record = { id: '1145368483001012673', description: '<p>正文</p>' };
	expect(detailFromShow(record, '1145368483001012673') === record, 'bare object');
	expect(detailFromShow([record], '1145368483001012673') === record, 'list');
	expect(detailFromShow({ bug: record }, '1145368483001012673') === record, 'single-key wrapper');
	expect(detailFromShow({ data: [record] }, '1145368483001012673') === record, 'data list wrapper');
	expect(JSON.stringify(detailFromShow(JSON.stringify(record), '1145368483001012673')) === JSON.stringify(record), 'json string');
	expect(detailFromShow('not json', 'x') === null, 'garbage');
});

check('isTapdKind matches exactly the three tappable work-item kinds', () => {
	expect(isTapdKind('bug') && isTapdKind('story') && isTapdKind('task'), 'kinds');
	expect(!isTapdKind('wecom-todo') && !isTapdKind('doc'), 'non-tapd kinds');
});

if (failures > 0) {
	console.error(`\n${failures} rich-render check(s) failed`);
	process.exitCode = 1;
} else {
	console.log('\nall rich-render checks pass');
}
