// Pixel Chess voxel pieces: builders + skins. Each piece returns [x,y,z,tag] voxels (tag: b body, t trim, e dark, g glow).
const C=6,N=13;
// ---- voxel piece builders: return [x,y,z,tag]  tag: b body, t trim, e eye
function lathe(prof,trim=[1]){const v=[];prof.forEach((r,y)=>{for(let x=0;x<N;x++)for(let z=0;z<N;z++){if((x-C)**2+(z-C)**2<=r*r+.5)v.push([x,y,z,trim.includes(y)?'t':'b'])}});return v}
const ring=(y,r0,r1,f,tag='b')=>{const v=[];for(let x=0;x<N;x++)for(let z=0;z<N;z++){const d=Math.hypot(x-C,z-C);if(d<=r1+.3&&d>=r0&&f(x,z))v.push([x,y,z,tag])}return v};
const P={
 pawn:()=>lathe([5,5,4,3,2,2,2,4,3,3.5,3.5,3,2],[1,7]),
 rook:()=>[...lathe([5,5,4,3,3,3,3,3,3,3,4,4,4.5],[1,12]),...ring(13,3,4.5,(x,z)=>x!==C&&z!==C),...ring(14,3,4.5,(x,z)=>x!==C&&z!==C,'t')],
 bishop:()=>lathe([5,5,4,3,2,2,2,3.5,3,3,3.5,3.5,3.5,3,3,2.5,2,1.5,1,0],[1,7,18,19]).filter(v=>!(v[1]>=11&&v[1]<=12&&v[2]>C&&Math.abs(v[0]-C)<=1)),
 queen:()=>[...lathe([5,5,4,3,2,2,2,2,3,3,3.5,3.5,4,4.5,4.5],[1,13,14]),...ring(15,2.5,4.5,(x,z)=>(x+z)%2===0,'t'),...ring(16,3.5,4.5,(x,z)=>x%2===0&&z%2===0,'t'),[C,16,C,'t'],[C,17,C,'t'],[C,18,C,'t']],
 king:()=>{const v=lathe([5,5,4,3,2,2,2,2,2,3,3,3.5,3.5,4,4,4.5,3.5],[1,15,16]);for(let y=17;y<=22;y++)v.push([C,y,C,'t']);[-2,-1,1,2].forEach(d=>v.push([C+d,20,C,'t'],[C,20,C+d,'t']));return v},
 knight:()=>{const v=lathe([5,5,4,4,4,4],[1]);const R={6:[3,8,4,8],7:[2,8,4,8],8:[2,9,4,8],9:[4,11,5,7],10:[4,11,5,7],11:[3,9,5,7],12:[3,8,5,7],13:[3,6,5,7]};
  for(const y in R){const [z0,z1,x0,x1]=R[y];for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){let t='b';if((+y===11&&z===9||+y===10&&z===11)&&x!==C)t='e';v.push([x,+y,z,t])}}
  const M={7:1,8:1,9:3,10:2,11:2,12:2,13:2};for(const y in M)v.push([C,+y,M[y],'t']);v.push([C,10,3,'t']);
  v.push([5,14,4,'b'],[7,14,4,'b'],[5,14,5,'b'],[7,14,5,'b']);return v}
};
// ---- skin-specific forms (Classic uses P). tags: g = glow
const slab=(y,r,tag='b')=>ring(y,0,r,()=>true,tag);
const put=(v,pts)=>{const s=new Set(pts.map(p=>p.slice(0,3).join()));return v.filter(a=>!s.has(a.slice(0,3).join())).concat(pts)};
const gap=(x,z)=>x!==C&&z!==C;
const PS={
Medieval:{
 pawn:()=>put(lathe([5,5,4,3,3,3,3.5,4,4,4,4,4,3,1.5],[1,6,12]),[[C-1,9,C+4,'e'],[C+1,9,C+4,'e'],[C,14,C,'t'],[C,14,C-1,'t'],[C,15,C-2,'t']]),
 rook:()=>put([...lathe([5,5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,5,5],[1,14,15]),...ring(16,3,5,gap),...ring(17,3,5,gap,'t'),...[16,17,18,19,20,21].map(y=>[C,y,C,'t'])],[[C,8,C+4,'e'],[C,9,C+4,'e'],[C,10,C+4,'e'],[C+1,21,C,'t'],[C+2,21,C,'t'],[C+1,20,C,'t'],[C+2,20,C,'t']]),
 knight:()=>put(P.knight().map(([x,y,z,t])=>t==='b'&&(y>=11||y===6||y===7)?[x,y,z,'t']:[x,y,z,t]),[[C,14,3,'t'],[C,15,2,'t'],[C,16,2,'t'],[C,16,1,'t']]),
 bishop:()=>put(lathe([5,5,4,3,2,2,2,3.5,3,3,3.5,3.5,3.5,3,3,2.5,2,1.5,1],[1,7,17]),[...[11,12,13,14].map(y=>[C,y,C+3,'t']),[C-1,13,C+3,'t'],[C+1,13,C+3,'t']]),
 queen:()=>{const p=[5,5,4,3,2,2,2,2,3,3.5,3.5,3,3,2.5,2.5,2,2,1.5,1,0];const v=lathe(p,[1,10,19]);for(let y=9;y<=18;y++)v.push([C,y,C-(Math.floor(p[y]+.3)+1),'t']);return v},
 king:()=>{const v=lathe([5,5,4,3,2,2,2,2,2,3,3,3.5,3.5,4,4,4.5,4.5],[1,15,16]);v.push(...ring(17,3,4.5,(x,z)=>(x+z)%2===0,'t'),...slab(17,1.5,'t'),...slab(18,1.5,'t'),...slab(19,1,'t'));for(let y=20;y<=22;y++)v.push([C,y,C,'t']);v.push([C-1,21,C,'t'],[C+1,21,C,'t']);return v}
},
Samurai:{
 pawn:()=>lathe([5,5,4,3,2,2,2,3,2.5,2.5,5.5,4.5,3.5,2.5,1.5,0],[1,10]),
 rook:()=>put(lathe([5,5,4,3.5,3.5,3.5,5.5,4.5,2.5,2.5,2.5,5,4,2,2,4.5,3.5,2.5,1.5,.5],[1,6,11,15]),[[C,3,C+3,'e'],[C,4,C+3,'e'],[C,9,C+2,'e'],[C,10,C+2,'e']]),
 knight:()=>put(P.knight().map(([x,y,z,t])=>t==='b'&&y>=12?[x,y,z,'t']:[x,y,z,t]),[-3,-2,-1,0,1,2,3].map(d=>[C+d,13+Math.abs(d),4,'t'])),
 bishop:()=>lathe([5,5,4,3,2.5,2.5,2.5,3,3,3,3,3,2.5,4.5,3.5,2.5,1.5,.5],[1,8,13]),
 queen:()=>{const v=lathe([5.5,5.5,5,4,4,3,3.5,3.5,3,3,3,2.5,2.5,2.5,2.5,2,2,1],[1,6,7,15,16]);v.push([C-3,15,C,'t'],[C+3,15,C,'t'],[C-4,16,C,'t'],[C+4,16,C,'t'],[C,18,C,'t']);return v},
 king:()=>{const v=lathe([5,5,4,3,3,3,3.5,3.5,3.5,5.5,5,3.5,3,3,3.5,3.5,2,0],[1,9,14]);for(let d=-4;d<=4;d++)v.push([C+d,18+Math.abs(d),C,'t']);v.push([C,19,C,'t'],[C,20,C,'t'],[C-1,20,C,'t'],[C+1,20,C,'t']);return v}
},
Undead:{
 pawn:()=>put(lathe([5,5,4,3,2,2,2,2,3.5,4,4,3.5,3],[1,8]),[[C-2,10,C+3,'g'],[C+2,10,C+3,'g'],[C-2,11,C+3,'e'],[C+2,11,C+3,'e'],[C,9,C+4,'e']]),
 rook:()=>{const v=lathe([5,5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,4.5,5,5],[1,10,11]);v.push(...ring(12,3,4.5,(x,z)=>(x*3+z*5)%4!==0),...ring(13,3.5,4.5,(x,z)=>(x*3+z*5)%5===0),...ring(14,4,4.5,(x,z)=>(x*3+z*5)%7===0));return put(v,[[C,5,C+4,'g'],[C,6,C+4,'g'],[C,7,C+4,'g'],[C+4,8,C,'g'],[C+4,9,C,'g'],[C-4,6,C,'g'],[C-4,7,C,'g']])},
 knight:()=>put(P.knight().filter(([x,y,z])=>!(y>=3&&y<=4&&(x+z)%2===0&&Math.hypot(x-C,z-C)>=3.5)),[[5,12,8,'g'],[7,12,8,'g'],[5,15,4,'t'],[7,15,4,'t'],[5,16,3,'t'],[7,16,3,'t'],[C,7,0,'t'],[C,9,2,'t'],[C,11,1,'t'],[C,13,1,'t']]),
 bishop:()=>{const v=lathe([5,5,4,3,3,3,3,3.5,3.5,3.5,3.5,3.5,3,3,2.5,2,1.5,1,0],[1,7]).map(([x,y,z,t])=>y>=14?[x,y,z-Math.floor((y-13)/2),t]:[x,y,z,t]);return put(v,[[C,9,C+3,'e'],[C,10,C+3,'e'],[C-1,11,C+3,'e'],[C,11,C+3,'e'],[C+1,11,C+3,'e'],[C-1,10,C+3,'g'],[C+1,10,C+3,'g']])},
 queen:()=>{const v=lathe([5.5,5,4.5,4,3.5,3,3,2.5,2.5,3,3,3.5,3.5,3,3,2.5,2],[1,11,15]).filter(([x,y,z])=>!(y===0&&(x*7+z*3)%4===0));v.push(...ring(17,2,3.5,(x,z)=>(x+z)%2===0,'t'),...ring(18,2.5,3.5,(x,z)=>x%2===0&&z%2===0,'t'));return put(v,[[C-1,13,C+3,'g'],[C+1,13,C+3,'g'],[C,12,C+3,'e']])},
 king:()=>{const v=lathe([5,5,4,3,2,2,2,2,3.5,4,4,3.5,3,3.5,3.5,3,3,2.5],[1,8]).filter(([x,y,z])=>!(y>=9&&y<=10&&(x+z)%2===1&&Math.hypot(x-C,z-C)>=3));v.push(...ring(18,2,3.5,(x,z)=>(x+z)%2===0,'t'),[C,18,C,'t'],[C,19,C,'t'],[C,20,C,'t'],[C,21,C,'t']);[[4,15],[5,16],[5,17],[4,18],[3,19]].forEach(([d,y])=>v.push([C-d,y,C,'t'],[C+d,y,C,'t']));return put(v,[[C-1,14,C+3,'g'],[C+1,14,C+3,'g'],[C,13,C+3,'e']])}
}};
const ORDER=['king','queen','rook','bishop','knight','pawn'];
const SKINS={
 Classic:{w:['#efe6d2','#b9a77f'],k:['#3a3f4a','#7d8594'],tl:'#c9b98f',td:'#8a7a5a',bg:'#1c2230'},
 Medieval:{w:['#cfd3d6','#d4a62a'],k:['#3b3f45','#a8322d'],tl:'#9a9d96',td:'#656964',bg:'#2a2622'},
 Samurai:{w:['#f1ece4','#c8372d'],k:['#1d1b22','#e3b04b'],tl:'#d8c3a0',td:'#6b4f3a',bg:'#3a1d22'},
 Undead:{w:['#cfe0c0','#7ac143'],k:['#2a2438','#9b59d6'],glow:'#7CFF5A',tl:'#4a5a4a',td:'#2b352f',bg:'#101a14'}
};

export {C,N,P,PS,SKINS,ORDER};
