// Pixel Chess boards. buildBoard(skin) -> [x,y,z,tag] voxels. 1 square = 14x14 voxels, board = 112x112, arena = 140x140.
// Tile top is y=-1, so pieces (which start at y=0) stand on it. Tags map to colors in BPAL[skin].
const BT=14,HALF=56,BW=6,MG=8,RG=HALF+BW+MG,OB=HALF+BW;
const BPAL={
 Classic:{l:'#e8d3a2',L:'#dcc590',d:'#9a6a3f',D:'#8c5e36',w:'#5a3a22',W:'#6b4629',t:'#c9a54a',g:'#2f4a3a',G:'#2a4234'},
 Medieval:{l:'#b4b0a3',L:'#a7a396',d:'#6e6b64',D:'#615e58',m:'#5d8a3a',s:'#3a3a3a',w:'#8b887f',W:'#7c7970',r:'#a8322d',t:'#d4a62a',g:'#4d7a35',G:'#44702f',e:'#7a5a38',n:'#2f5a2a',N:'#3a6a30'},
 Samurai:{l:'#d9c79a',L:'#cdbb8c',d:'#7d8a4c',D:'#707c42',w:'#3a2a22',W:'#2e2019',r:'#c8372d',t:'#e3b04b',s:'#8d8a85',p:'#f4a6c0',f:'#ffb347',g:'#cfcab9',G:'#bdb8a5'},
 Undead:{t:'#7a8a6a',l:'#5c6a5c',L:'#516051',d:'#2f3a33',D:'#28322c',m:'#4f7a3a',s:'#1d1f1e',w:'#3d3a45',W:'#34313c',b:'#d8d4bf',f:'#7CFF5A',u:'#9b59d6',e:'#4a3b2a',g:'#1a2220',G:'#141b19'}
};
function buildBoard(skin){
 const M=new Map(),h=(x,y,z)=>((x*73856093)^(y*19349663)^(z*83492791))>>>0;
 const set=(x,y,z,t)=>M.set(x+','+y+','+z,[x,y,z,t]);
 const box=(x0,x1,y0,y1,z0,z1,t)=>{for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)set(x,y,z,t)};
 const blob=(cx,cy,cz,r,t)=>{for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)for(let z=-r;z<=r;z++)if(x*x+y*y+z*z<=r*r+.5)set(cx+x,cy+y,cz+z,t)};
 const cone=(cx,cz,y0,radii,t,t2)=>radii.forEach((r,k)=>{for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)if(x*x+z*z<=r*r+.5)set(cx+x,y0+k,cz+z,(x+z+k)%3===0?t2:t)});
 // ground
 for(let x=-RG;x<RG;x++)for(let z=-RG;z<RG;z++){let t=h(x,0,z)%6===0?'G':'g';
  if(skin==='Samurai'&&h(x,1,z)%97===0)t='p';
  if(skin==='Undead'&&h(x,2,z)%173===0)t='f';
  if(skin==='Medieval'&&h(x,3,z)%53===0)t='e';
  set(x,-4,z,t)}
 // squares (a1 is dark)
 for(let x=-HALF;x<HALF;x++)for(let z=-HALF;z<HALF;z++){
  const dark=(Math.floor((x+HALF)/BT)+Math.floor((z+HALF)/BT))%2===0,k=h(x,5,z);
  let top=dark?'d':'l';if(k%9===0)top=dark?'D':'L';
  if(skin==='Samurai'&&z%2===0)top=dark?'D':'L';
  if(skin==='Medieval'&&k%29===0)top='m';
  if(skin==='Undead'){if(k%23===0)top='m';else if(k%37===0)top='s'}
  set(x,-3,z,dark?'d':'l');set(x,-2,z,dark?'d':'l');set(x,-1,z,top)}
 // border ring
 for(let x=-OB;x<OB;x++)for(let z=-OB;z<OB;z++){
  if(x>=-HALF&&x<HALF&&z>=-HALF&&z<HALF)continue;
  const ax=Math.abs(x+.5),az=Math.abs(z+.5),r=Math.max(ax,az);
  for(let y=-3;y<=0;y++)set(x,y,z,h(x,y,z)%5===0?'W':'w');
  if(r<HALF+1)set(x,0,z,'t');
  if(skin==='Samurai'&&r>OB-1)set(x,0,z,'r');
  if(skin==='Medieval'&&r>OB-2&&Math.floor(((ax>=az?z:x)+100)/4)%2===0)box(x,x,1,2,z,z,'w')}
 const corners=f=>{for(const sx of[-1,1])for(const sz of[-1,1])f(sx>0?HALF:-OB,sz>0?HALF:-OB,sx,sz)};
 if(skin==='Medieval'){
  corners((x0,z0)=>{box(x0,x0+5,1,12,z0,z0+5,'w');
   for(let a=0;a<6;a++)for(let b=0;b<6;b++)if((a===0||b===0||a===5||b===5)&&(a+b)%2===0)box(x0+a,x0+a,13,14,z0+b,z0+b,'W');
   box(x0+2,x0+2,13,20,z0+2,z0+2,'w');box(x0+3,x0+5,18,20,z0+2,z0+2,'r');box(x0+2,x0+3,6,8,z0,z0,'s')});
  for(const z of[-60,59]){box(-2,3,3,8,z,z,'r');box(-3,3,9,9,z,z,'w');box(-3,-3,1,9,z,z,'w')}
  [[-66,-44],[-66,0],[-66,44],[66,-44],[66,0],[66,44],[-24,-66],[24,66]].forEach(([x,z])=>{box(x,x,-3,1,z,z,'e');cone(x,z,2,[3,3,2,2,1,1,0],'n','N')})}
 if(skin==='Samurai'){
  corners((x0,z0)=>{box(x0+1,x0+3,1,2,z0+1,z0+3,'s');box(x0+2,x0+2,3,5,z0+2,z0+2,'s');box(x0+1,x0+3,6,8,z0+1,z0+3,'f');box(x0,x0+4,9,9,z0,z0+4,'s');box(x0+1,x0+3,10,10,z0+1,z0+3,'s');set(x0+2,11,z0+2,'s')});
  for(const px of[-22,22])box(px-1,px+1,1,15,57,59,'r');
  box(-26,26,11,12,57,59,'r');box(-29,29,16,17,56,60,'W');box(-31,31,18,18,56,60,'W');
  [[-65,-40],[-65,30],[65,-30],[65,40],[-30,65],[30,-65]].forEach(([x,z])=>{box(x,x,-3,3,z,z,'w');blob(x,6,z,4,'p')})}
 if(skin==='Undead'){
  corners((x0,z0,sx,sz)=>{box(x0+1,x0+4,1,8,z0+1,z0+4,'w');box(x0,x0+5,9,12,z0,z0+5,'b');const ze=sz>0?z0:z0+5;box(x0+1,x0+1,10,11,ze,ze,'f');box(x0+4,x0+4,10,11,ze,ze,'f')});
  for(const[x,z]of[[0,-59],[0,58],[-59,0],[58,0]]){box(x,x,1,5,z,z,'w');box(x-1,x,6,8,z,z+1,'f')}
  [[-66,-34],[-66,16],[-66,38],[66,-38],[66,12],[-40,66],[10,66],[36,-66],[-18,-66]].forEach(([x,z])=>{box(x-2,x+2,-3,2,z,z+1,'s');box(x-1,x+1,3,3,z,z+1,'s')});
  [[-66,-6],[66,-10]].forEach(([x,z])=>{box(x,x,-3,10,z,z,'e');box(x-3,x,8,8,z,z,'e');box(x,x+3,6,6,z,z,'e');box(x-2,x-2,9,11,z,z,'e')});
  [[-66,-66],[66,66],[-66,66],[66,-66]].forEach(([x,z])=>{box(x,x,-3,6,z,z,'u');box(x+1,x+1,-3,3,z,z,'u');box(x-1,x-1,-3,1,z,z,'u')})}
 // drop fully hidden voxels
 const out=[];for(const v of M.values()){const[x,y,z]=v;if(M.has((x+1)+','+y+','+z)&&M.has((x-1)+','+y+','+z)&&M.has(x+','+(y+1)+','+z)&&M.has(x+','+(y-1)+','+z)&&M.has(x+','+y+','+(z+1))&&M.has(x+','+y+','+(z-1)))continue;out.push(v)}
 return out}
export {BT,HALF,BPAL,buildBoard};
