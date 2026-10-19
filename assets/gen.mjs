
import {C,P,PS,SKINS,ORDER} from './chess-voxel-pieces.js';
import fs from 'fs';
const S=0.1;
const lin=h=>{const c=parseInt(h.slice(1),16);return [c>>16&255,c>>8&255,c&255].map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)})};
const F=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]],[[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]],[[0,-1,0],[[0,0,1],[0,0,0],[1,0,0],[1,0,1]]],[[0,0,1],[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]],[[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]]];
function glb(vox,pal){
 const set=new Set(vox.map(v=>v.slice(0,3).join()));const pos=[],nor=[],col=[],idx=[];
 for(const [x,y,z,t] of vox){
  const [bc,tc]=pal.side;const hex=t==='t'?tc:t==='e'?'#111111':t==='g'?(pal.glow||tc):bc;
  const h=((x*73856093)^(y*19349663)^(z*83492791))>>>0;const k=.93+(h%100)/700;const c=lin(hex).map(v=>Math.min(1,v*k));
  for(const [n,q] of F){if(set.has([x+n[0],y+n[1],z+n[2]].join()))continue;const b=pos.length/3;
   for(const o of q){pos.push((x+o[0]-C-.5)*S,(y+o[1])*S,(z+o[2]-C-.5)*S);nor.push(...n);col.push(...c)}
   idx.push(b,b+1,b+2,b,b+2,b+3)}}
 const P32=new Float32Array(pos),N32=new Float32Array(nor),C32=new Float32Array(col),I32=new Uint32Array(idx);
 const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<pos.length;i+=3)for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],pos[i+j]);mx[j]=Math.max(mx[j],pos[i+j])}
 const bufs=[P32,N32,C32,I32].map(a=>Buffer.from(a.buffer));const bin=Buffer.concat(bufs);
 let off=0;const views=bufs.map(b=>{const v={buffer:0,byteOffset:off,byteLength:b.length};off+=b.length;return v});
 views[0].target=34962;views[1].target=34962;views[2].target=34962;views[3].target=34963;
 const j={asset:{version:'2.0',generator:'pixel-chess-assets'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},indices:3,material:0}]}],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1}}],
  accessors:[{bufferView:0,componentType:5126,count:pos.length/3,type:'VEC3',min:mn,max:mx},{bufferView:1,componentType:5126,count:nor.length/3,type:'VEC3'},{bufferView:2,componentType:5126,count:col.length/3,type:'VEC3'},{bufferView:3,componentType:5125,count:idx.length,type:'SCALAR'}],
  bufferViews:views,buffers:[{byteLength:bin.length}]};
 let js=Buffer.from(JSON.stringify(j));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);
 const pad=Buffer.alloc((4-bin.length%4)%4);const bn=Buffer.concat([bin,pad]);
 const total=12+8+js.length+8+bn.length;const h=Buffer.alloc(12);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(total,8);
 const a=Buffer.alloc(8);a.writeUInt32LE(js.length,0);a.write('JSON',4);const b2=Buffer.alloc(8);b2.writeUInt32LE(bn.length,0);b2.write('BIN\0',4);
 return Buffer.concat([h,a,js,b2,bn]);
}
const all={};let n=0;
for(const sk of ['Classic','Medieval','Samurai','Undead']){
 fs.mkdirSync('models/'+sk.toLowerCase(),{recursive:true});all[sk]={};
 for(const k of ORDER){const base=((PS[sk]||{})[k]||P[k])();all[sk][k]=base;
  for(const side of ['white','black']){
   const vox=side==='white'?base:base.map(([x,y,z,t])=>[2*C-x,y,2*C-z,t]);
   const pal={side:SKINS[sk][side==='white'?'w':'k'],glow:SKINS[sk].glow};
   fs.writeFileSync(`models/${sk.toLowerCase()}/${side}_${k}.glb`,glb(vox,pal));n++}}}
fs.writeFileSync('voxels.json',JSON.stringify({grid:13,center:6,tags:{b:'body',t:'trim',e:'dark',g:'glow'},skins:SKINS,voxels:all}));
console.log('glb files',n);
