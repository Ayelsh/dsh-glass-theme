import fs from 'node:fs';
const fd = fs.openSync('D:/kjProject/DSH-Harness/resources/app.asar', 'r');
const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0);
const pickleSize = b.readUInt32LE(0);
const b2 = Buffer.alloc(8); fs.readSync(fd, b2, 0, 8, 4 + pickleSize);
const headerSize = b2.readUInt32LE(0);
const jsonSize = b2.readUInt32LE(4);
const buf = Buffer.alloc(jsonSize); fs.readSync(fd, buf, 0, jsonSize, 4 + pickleSize + 8);
const json = JSON.parse(buf.toString('utf8'));

// Build a flat map of path -> {offset,size} for files, plus dirs.
const base = 4 + pickleSize + 8 + headerSize;
export function readAsar(relPath) {
  let node = json;
  for (const part of relPath.split('/')) {
    if (!node || !node.files) return null;
    node = node.files[part];
  }
  if (!node || node.offset === undefined) return null;
  const start = base + Number(node.offset);
  const out = Buffer.alloc(node.size);
  fs.readSync(fd, out, 0, node.size, start);
  return out;
}
export function listDir(relPath) {
  let node = json;
  for (const part of relPath.split('/')) {
    if (!node || !node.files) return null;
    node = node.files[part];
  }
  return node && node.files ? Object.keys(node.files) : null;
}
