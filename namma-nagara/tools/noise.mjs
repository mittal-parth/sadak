import {readFileSync} from 'node:fs'; import {PNG} from 'pngjs';
for(const [f,x,y,w,h] of [[process.argv[2],250,900,300,120],[process.argv[2],700,640,300,80]]){
 const p=PNG.sync.read(readFileSync(f)); let s=[0,0,0],s2=[0,0,0],n=0, sc=0;
 for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){const a=(j*p.width+i)*4;for(let c=0;c<3;c++){const v=p.data[a+c];s[c]+=v;s2[c]+=v*v;} n++;
   // local chroma deviation vs 3x3 mean
 }
 const mean=s.map(v=>v/n), sd=s2.map((v,c)=>Math.sqrt(v/n-mean[c]*mean[c]));
 // high-frequency chroma: difference between (R-G) at pixel and blurred
 let hf=0;
 for(let j=y+1;j<y+h-1;j++)for(let i=x+1;i<x+w-1;i++){
   const at=(jj,ii)=>{const a=(jj*p.width+ii)*4;return [p.data[a],p.data[a+1],p.data[a+2]];};
   const c0=at(j,i); let m=[0,0,0];
   for(const [dj,di] of [[-1,0],[1,0],[0,-1],[0,1]]){const q=at(j+dj,i+di);m[0]+=q[0]/4;m[1]+=q[1]/4;m[2]+=q[2]/4;}
   const dr=c0[0]-m[0], dg=c0[1]-m[1], db=c0[2]-m[2];
   const l=(dr+dg+db)/3; hf += Math.abs(dr-l)+Math.abs(db-l);
 }
 console.log(`${f} [${x},${y}] mean=${mean.map(v=>v.toFixed(1)).join('/')} sd=${sd.map(v=>v.toFixed(1)).join('/')} chromaHF=${(hf/((w-2)*(h-2))).toFixed(2)}`);
}
