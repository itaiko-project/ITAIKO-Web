// Usage: unzip assets/plywood-plates.3mf (the plywood plates from the drum assembly), then
//   node scripts/plywood-glb.cjs <unzipped>/3D/3dmodel.model public/plywood.glb
// Object ids 25/27 are the Don halves, 29/31 the Ka halves.
// Plywood Don + Ka halves (objects 25, 27, 29, 31) from the assembly 3MF → a GLB in the head's own frame, in mm:
// x across the face, y up along it, z out of the front face (z = 0 front, -12 back), origin at the Don's centre.
const fs=require("fs");const [,,model,out]=process.argv;const x=fs.readFileSync(model,"utf8");
const objs={};
for(const m of x.matchAll(/<object id="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/object>/g)){
 objs[m[1]]={name:m[2],vs:[...m[3].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(v=>v.slice(1).map(Number)),ts:[...m[3].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map(t=>t.slice(1).map(Number))};}
const N=[0,-0.8192,0.5736];const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const U=[1,0,0],V=cross(N,U);const P=p=>[dot(p,U),dot(p,V),dot(p,N)];
const ids=["25","27","29","31"];
const don=[...objs[25].vs,...objs[27].vs].map(P);
const c=[0,1].map(k=>(Math.min(...don.map(p=>p[k]))+Math.max(...don.map(p=>p[k])))/2);
const front=Math.max(...don.map(p=>p[2]));
const pos=[],idx=[];
for(const id of ids){const base=pos.length/3;for(const v of objs[id].vs){const p=P(v);pos.push(p[0]-c[0],p[1]-c[1],p[2]-front)}for(const t of objs[id].ts)idx.push(...t.map(i=>i+base));}
const count=pos.length/3;if(count>65535)throw new Error("too many verts");
const min=[0,1,2].map(k=>Math.min(...pos.filter((_,i)=>i%3===k))),max=[0,1,2].map(k=>Math.max(...pos.filter((_,i)=>i%3===k)));
const posBuf=Buffer.from(new Float32Array(pos).buffer);let idxBuf=Buffer.from(new Uint16Array(idx).buffer);
if(idxBuf.length%4)idxBuf=Buffer.concat([idxBuf,Buffer.alloc(4-idxBuf.length%4)]);
const bin=Buffer.concat([posBuf,idxBuf]);
const json={asset:{version:"2.0",generator:"plywood_glb.cjs from Assembly completa v8.3mf"},scene:0,scenes:[{nodes:[0]}],nodes:[{name:"Plywood",mesh:0}],
 meshes:[{name:"Plywood",primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],
 bufferViews:[{buffer:0,byteOffset:0,byteLength:posBuf.length,target:34962},{buffer:0,byteOffset:posBuf.length,byteLength:idx.length*2,target:34963}],
 accessors:[{bufferView:0,componentType:5126,count,type:"VEC3",min,max},{bufferView:1,componentType:5123,count:idx.length,type:"SCALAR"}]};
let js=Buffer.from(JSON.stringify(json));if(js.length%4)js=Buffer.concat([js,Buffer.alloc(4-js.length%4,0x20)]);
const hdr=Buffer.alloc(12);hdr.write("glTF",0);hdr.writeUInt32LE(2,4);hdr.writeUInt32LE(12+8+js.length+8+bin.length,8);
const ch=(len,type)=>{const b=Buffer.alloc(8);b.writeUInt32LE(len,0);b.write(type,4);return b};
fs.writeFileSync(out,Buffer.concat([hdr,ch(js.length,"JSON"),js,ch(bin.length,"BIN\0"),bin]));
console.log("verts",count,"tris",idx.length/3,"min",min.map(v=>v.toFixed(1)).join(","),"max",max.map(v=>v.toFixed(1)).join(","),"bytes",fs.statSync(out).size);
