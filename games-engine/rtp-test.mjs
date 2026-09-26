import { randomInt } from "node:crypto";

const N=1_000_000;
const tiger=[
  {w:650000,m:0},{w:100000,m:.5},{w:80000,m:1},{w:60000,m:1.5},
  {w:40000,m:2},{w:40000,m:5},{w:20000,m:10},{w:8000,m:25},{w:2000,m:30}
];
const tigerTheory=tiger.reduce((a,x)=>a+(x.w/1_000_000)*x.m,0);
const tigerE2=tiger.reduce((a,x)=>a+(x.w/1_000_000)*x.m*x.m,0);
const tigerVar=tigerE2-tigerTheory*tigerTheory;
const tigerSE=Math.sqrt(tigerVar/N);
function tigerSpin(){
  const r=randomInt(1_000_000);let c=0;
  for(const x of tiger){c+=x.w;if(r<c)return x.m}
  return 0;
}
let tigerReturn=0;
for(let i=0;i<N;i++) tigerReturn+=tigerSpin();
const tigerObserved=tigerReturn/N;
const tigerZ=(tigerObserved-tigerTheory)/tigerSE;

function crash(){
  const u=randomInt(0x100000000)/0x100000000;
  if(u<.03)return 1;
  return Math.min(100,Math.floor((.97/(1-u))*100)/100);
}
const targets=[1.5,2,3,5,10,20], crashStats={};
for(const target of targets){
  let wins=0;
  for(let i=0;i<N;i++) if(crash()>=target)wins++;
  const observed=(wins/N)*target;
  const expected=.97;
  const p=.97/target;
  const se=target*Math.sqrt(p*(1-p)/N);
  crashStats[target]={observed,expected,z:(observed-expected)/se};
}

const duel={
  home:{p:.43,m:2.23},
  draw:{p:.14,m:6.85},
  away:{p:.43,m:2.23}
};
const duelRtp=Object.fromEntries(Object.entries(duel).map(([k,v])=>[k,v.p*v.m]));

const out={
  rounds:N,
  pulsoTiger:{theoreticalRtp:tigerTheory,observedRtp:tigerObserved,standardError:tigerSE,zScore:tigerZ,pass:Math.abs(tigerZ)<5},
  pulsoLaunch:{theoreticalReturn:.97,observedByTarget:crashStats,pass:Object.values(crashStats).every(x=>Math.abs(x.z)<5)},
  pulsoGoalDuel:{theoreticalByPick:duelRtp,pass:Object.values(duelRtp).every(x=>x>.95&&x<.97)}
};
out.pass=out.pulsoTiger.pass&&out.pulsoLaunch.pass&&out.pulsoGoalDuel.pass;
console.log(JSON.stringify(out,null,2));
if(!out.pass) process.exitCode=1;
