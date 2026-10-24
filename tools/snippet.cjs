const fs = require('fs');
const file = process.argv[2];
const t = fs.readFileSync(file, 'utf8');
const needles = process.argv.slice(3);
for (const n of needles) {
  let i = 0, count = 0;
  while ((i = t.indexOf(n, i)) !== -1 && count < 6) {
    console.log(`--- ${n} @${i}`);
    console.log(t.slice(Math.max(0, i - 260), i + 340).replace(/\n/g, '\\n'));
    i += n.length; count++;
  }
  if (count === 0) console.log(`--- ${n}: none`);
}
