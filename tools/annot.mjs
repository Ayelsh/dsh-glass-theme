import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const src = process.argv[2];
const buf = readFileSync(src);
let off = 8, w=0,h=0,ct=0,idat=[];
while (off < buf.length) {
  const len = buf.readUInt32BE(off), type = buf.toString("ascii", off+4, off+8);
  const d = buf.subarray(off+8, off+8+len);
  if (type === "IHDR") { w=d.readUInt32BE(0); h=d.readUInt32BE(4); ct=d[9]; }
  else if (type === "IDAT") idat.push(d);
  else if (type === "IEND") break;
  off += 12 + len;
}
const ch = ct===6?4:ct===2?3:1;
const raw = inflateSync(Buffer.concat(idat));
const stride = w*ch, out = Buffer.alloc(stride*h);
const pa=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for (let y=0;y<h;y++){
  const f = raw[y*(stride+1)], line = raw.subarray(y*(stride+1)+1, y*(stride+1)+1+stride);
  for (let x=0;x<stride;x++){
    const a = x>=ch ? out[y*stride+x-ch] : 0, b = y>0 ? out[(y-1)*stride+x] : 0, c = (x>=ch&&y>0) ? out[(y-1)*stride+x-ch] : 0;
    let v = line[x];
    if (f===1) v+=a; else if (f===2) v+=b; else if (f===3) v+=(a+b)>>1; else if (f===4) v+=pa(a,b,c);
    out[y*stride+x] = v & 255;
  }
}
const buckets = { red: [], blue: [], green: [], yellow: [], white: [] };
for (let y=0;y<h;y+=1) for (let x=0;x<w;x+=1) {
  const i=(y*w+x)*ch, r=out[i], g=out[i+1], b=out[i+2];
  if (r>170 && g<90 && b<90) buckets.red.push([x,y]);
  else if (b>170 && r<90 && g<110) buckets.blue.push([x,y]);
  else if (g>140 && r<90 && b<110) buckets.green.push([x,y]);
  else if (r>190 && g>170 && b<110) buckets.yellow.push([x,y]);
}
for (const k of Object.keys(buckets)) {
  const p = buckets[k];
  if (!p.length) { console.log(k, "none"); continue; }
  // cluster by connected proximity using a coarse grid
  const seen = new Set(); const clusters=[];
  const key=(x,y)=>((x>>4)<<16)|(y>>4);
  const set = new Set(p.map(([x,y])=>key(x,y)));
  for (const [x,y] of p) {
    const k0=key(x,y); if (seen.has(k0)) continue;
    const stack=[[x,y]]; const cells=new Set(); let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,n=0;
    while(stack.length){ const [cx,cy]=stack.pop(); const ck=key(cx,cy); if(cells.has(ck))continue; cells.add(ck); n++; if(cx<x0)x0=cx; if(cx>x1)x1=cx; if(cy<y0)y0=cy; if(cy>y1)y1=cy;
      for(let dx=-16;dx<=16;dx+=16) for(let dy=-16;dy<=16;dy+=16){ const nk=key(cx+dx,cy+dy); if(set.has(nk)&&!cells.has(nk)){ /* push a representative */ const rep=p.find(([px,py])=>key(px,py)===nk); if(rep) stack.push(rep); } }
    }
    cells.forEach(c=>seen.add(c));
    if (n>60) clusters.push({x0,x1,y0,y1,n});
  }
  clusters.sort((a,b)=>b.n-a.n);
  console.log(k, JSON.stringify(clusters.slice(0,6)));
}
