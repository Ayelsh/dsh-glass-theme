import { listDir, readAsar } from './asar-lib.mjs';
const base = 'dsh/node_modules/@deepseek-ai';
for (const pkg of ['dsh-client-ui-layout', 'dsh-client-ui-sidebar', 'dsh-client-ui-workspace']) {
  console.log('== ' + pkg);
  try {
    const files = listDir(`${base}/${pkg}`);
    console.log(files.join(', '));
    for (const d of ['lib', 'dist', 'src']) {
      const sub = listDir(`${base}/${pkg}/${d}`);
      if (sub) console.log(`  ${d}/: ` + sub.join(', '));
    }
  } catch (e) { console.log('ERR', e.message); }
}
