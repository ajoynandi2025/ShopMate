import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const size = 256;
const scale = 3;
const sampleSize = size * scale;
const samples = new Uint8Array(sampleSize * sampleSize * 4);
const blue = [40, 117, 232, 255];
const white = [255, 255, 255, 255];
const radius = 52 * scale;
const lines = [
  [[57,111],[75,72]], [[75,72],[181,72]], [[181,72],[199,111]],
  [[52,112],[204,112]], [[62,130],[194,130]], [[62,130],[62,204]],
  [[194,130],[194,204]], [[62,204],[105,204]], [[151,204],[194,204]],
  [[105,204],[105,161]], [[105,161],[151,161]], [[151,161],[151,204]],
];
// The shop awning has a shallow scallop under each bay.
for (const x of [70, 105, 140, 175]) {
  lines.push([[x,112],[x,119]], [[x,119],[x+8,125]], [[x+8,125],[x+17,119]], [[x+17,119],[x+17,112]]);
}
function segmentDistance(x,y,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-(a[0]+t*dx),y-(a[1]+t*dy));
}
function inRoundRect(x,y) {
  const qx=Math.max(radius-x,0,x-(sampleSize-radius));
  const qy=Math.max(radius-y,0,y-(sampleSize-radius));
  return qx*qx+qy*qy<=radius*radius;
}
for(let py=0;py<sampleSize;py++) for(let px=0;px<sampleSize;px++) {
  const x=px/scale,y=py/scale,idx=(py*sampleSize+px)*4;
  if(inRoundRect(px,py)) samples.set(blue,idx);
  if(inRoundRect(px,py)&&lines.some(([a,b])=>segmentDistance(px,py,[a[0]*scale,a[1]*scale],[b[0]*scale,b[1]*scale])<=6.5*scale)) samples.set(white,idx);
}
const rgba=Buffer.alloc(size*size*4);
for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const out=(y*size+x)*4; let sum=[0,0,0,0];
  for(let sy=0;sy<scale;sy++) for(let sx=0;sx<scale;sx++) { const i=((y*scale+sy)*sampleSize+x*scale+sx)*4; for(let c=0;c<4;c++)sum[c]+=samples[i+c]; }
  for(let c=0;c<4;c++)rgba[out+c]=Math.round(sum[c]/(scale*scale));
}
function chunk(type,data) {
  const name=Buffer.from(type),len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const crcInput=Buffer.concat([name,data]);let crc=0xffffffff;
  for(const byte of crcInput){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const crcBuf=Buffer.alloc(4);crcBuf.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([len,name,data,crcBuf]);
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
const scanlines=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)rgba.copy(scanlines,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
const icoHeader=Buffer.alloc(22);icoHeader.writeUInt16LE(0,0);icoHeader.writeUInt16LE(1,2);icoHeader.writeUInt16LE(1,4);
icoHeader[6]=0;icoHeader[7]=0;icoHeader[8]=0;icoHeader[9]=0;icoHeader.writeUInt16LE(1,10);icoHeader.writeUInt16LE(32,12);icoHeader.writeUInt32LE(png.length,14);icoHeader.writeUInt32LE(22,18);
fs.mkdirSync(path.join(root,'assets'),{recursive:true});
fs.writeFileSync(path.join(root,'assets','shopmate.ico'),Buffer.concat([icoHeader,png]));
