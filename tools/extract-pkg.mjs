import { readAsar } from './asar-lib.mjs';
import fs from 'node:fs';
const base = 'dsh/node_modules/@deepseek-ai';
const out = process.argv[2];
const pkg = process.argv[3];
const buf = readAsar(`${base}/${pkg}/lib/client.js`);
fs.writeFileSync(out, buf);
console.log(pkg, buf.length, 'bytes ->', out);
