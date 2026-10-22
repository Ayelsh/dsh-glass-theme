// CSS sanity: brace balance + comment balance per sheet.
import { readFileSync, readdirSync } from 'node:fs';

const dir = process.argv[2] || 'src/css';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
  const css = readFileSync(dir + '/' + f, 'utf8');
  let s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let bal = 0,
    line = 1,
    errs = [];
  let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\n') line++;
    if (inStr) {
      if (c === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === '{') bal++;
    if (c === '}') {
      bal--;
      if (bal < 0) {
        errs.push('extra } at line ' + line);
        bal = 0;
      }
    }
  }
  const opens = (css.match(/\/\*/g) || []).length;
  const closes = (css.match(/\*\//g) || []).length;
  const comment = opens !== closes ? `UNBALANCED COMMENT (${opens}/${closes})` : '';
  console.log(f.padEnd(22), 'braceBalance=' + bal, comment, errs.join(';'));
}
