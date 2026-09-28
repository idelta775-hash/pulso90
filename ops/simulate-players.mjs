import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,".."), engine=path.join(root,"games-engine","rgs-demo.mjs");
const runtime=path.resolve(root,"..","tests","runtime-player-sim");
const reportDir=path.resolve(root,"..","tests");
const port=19021, base="http://127.0.0.1:"+port;
fs.rmSync(runtime,{recursive:true,force:true});fs.mkdirSync(runtime,{recursive:true});fs.mkdirSync(reportDir,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const lat=[], failures=[], sessions=[];
let server=null,totalRequests=0,successfulPlays=0,expectedErrors=0;
function start(){
  server=spawn(process.execPath,[engine],{cwd:path.dirname(engine),env:{...process.env,PULSO90_GAMES_PORT:String(port),PULSO90_RUNTIME_DIR:runtime},stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",()=>{});server.stderr.on("data",d=>failures.push({type:"server_stderr",message:String(d).trim().slice(0,500)}));
}
async function stop(){if(!server)return;server.kill("SIGTERM");await Promise.race([new Promise(r=>server.once("exit",r)),sleep(2500)]);if(server.exitCode===null)server.kill("SIGKILL");server=null;await sleep(300)}
async function waitHealth(){for(let i=0;i<60;i++){try{const r=await fetch(base+"/api/lab/health");if(r.ok)return r.json()}catch{}await sleep(150)}throw new Error("health_timeout")}
async function req(url,opt={},expect=[200]){const t=performance.now();let r;try{r=await fetch(base+url,opt)}catch(e){failures.push({type:"network",url,message:e.message});return null}lat.push(performance.now()-t);totalRequests++;let body={};try{body=await r.json()}catch{}if(!expect.includes(r.status))failures.push({type:"http",url,status:r.status,body});return {status:r.status,body}}
const pick=a=>a[Math.floor(Math.random()*a.length)];
function persona(i){const types=[["casual",12],["explorer",22],["regular",32],["enthusiast",48],["reconnect",24]];const p=types[i%types.length];return {id:i,type:p[0],rounds:p[1]+Math.floor(Math.random()*7)}}
async function runUser(p){
  const s=await req("/api/lab/session",{method:"POST"},[201]);if(!s)return;
  const sid=s.body.sessionId;let expectedRounds=0,last=s.body;
  for(let n=0;n<p.rounds;n++){
    const game=Math.random()<.48?"pulso-tiger":Math.random()<.58?"pulso-launch":"pulso-goal-duel";
    let stake=1+Math.floor(Math.random()*20);if(Number(last.balance)<stake)stake=Math.max(1,Math.floor(Number(last.balance)||1));
    let payload={game,stake};
    if(game==="pulso-launch")payload.target=Number((1.2+Math.random()*3.8).toFixed(2));
    if(game==="pulso-goal-duel")payload.pick=pick(["home","draw","away"]);
    const r=await req("/api/lab/play",{method:"POST",headers:{"content-type":"application/json","x-demo-session":sid},body:JSON.stringify(payload)},[200,400]);
    if(!r)continue;
    if(r.status===200){successfulPlays++;expectedRounds++;last=r.body;if(Number(last.balance)<-0.001)failures.push({type:"negative_balance",sid,balance:last.balance})}
    else if(r.status===400&&r.body.error==="demo_balance_insufficient"){expectedErrors++;const rr=await req("/api/lab/reset",{method:"POST",headers:{"x-demo-session":sid}},[200]);if(rr?.status===200)last=rr.body}
    if(n%10===9){const st=await req("/api/lab/state",{headers:{"x-demo-session":sid}},[200]);if(st?.body&&Number(st.body.rounds)!==Number(last.rounds))failures.push({type:"state_mismatch",sid,seen:st.body.rounds,last:last.rounds})}
  }
  const final=await req("/api/lab/state",{headers:{"x-demo-session":sid}},[200]);
  sessions.push({sid,type:p.type,state:final?.body||last});
}
async function pool(items,limit,fn){let i=0;const workers=Array.from({length:limit},async()=>{while(true){const idx=i++;if(idx>=items.length)return;await fn(items[idx])}});await Promise.all(workers)}
function pct(a,p){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]}
function verifyAudit(){
 const f=path.join(runtime,"games-lab-audit-v03.jsonl");if(!fs.existsSync(f))return {ok:false,reason:"missing"};
 const lines=fs.readFileSync(f,"utf8").split(/\r?\n/).filter(Boolean);let prev="GENESIS";
 for(let i=0;i<lines.length;i++){const row=JSON.parse(lines[i]);const hash=row.hash;delete row.hash;if(row.previousHash!==prev)return {ok:false,reason:"previous_hash",line:i+1};const calc=crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");if(calc!==hash)return {ok:false,reason:"hash",line:i+1};prev=hash}
 return {ok:true,rows:lines.length,lastHash:prev};
}
async function staticChecks(){for(const u of ["/","/account.html","/games/","/assets/visual/hero-community.webp","/assets/visual/esportes.webp","/runtime-config.json"]){const r=await fetch(base+u);if(!r.ok)failures.push({type:"static",url:u,status:r.status})}}
async function edgeChecks(){
 const s=await req("/api/lab/session",{method:"POST"},[201]);const sid=s.body.sessionId;
 await req("/api/lab/play",{method:"POST",headers:{"content-type":"application/json","x-demo-session":sid},body:JSON.stringify({game:"pulso-tiger",stake:0})},[400]);expectedErrors++;
 await req("/api/lab/client-seed",{method:"POST",headers:{"content-type":"application/json","x-demo-session":sid},body:JSON.stringify({clientSeed:"x"})},[400]);expectedErrors++;
 await req("/api/lab/play",{method:"POST",headers:{"content-type":"application/json","x-demo-session":sid},body:"{bad"},[400]);expectedErrors++;
}
const started=new Date().toISOString();
start();const health1=await waitHealth();await staticChecks();await edgeChecks();
const people=Array.from({length:300},(_,i)=>persona(i));await pool(people,36,runUser);
const before=new Map(sessions.slice(0,80).map(x=>[x.sid,x.state]));
const auditBefore=verifyAudit();
await stop();start();const health2=await waitHealth();
let restored=0;for(const [sid,old] of before){const r=await req("/api/lab/state",{headers:{"x-demo-session":sid}},[200]);if(r?.status===200){restored++;if(Number(r.body.rounds)!==Number(old.rounds)||Math.abs(Number(r.body.balance)-Number(old.balance))>.001)failures.push({type:"restore_mismatch",sid,before:{rounds:old.rounds,balance:old.balance},after:{rounds:r.body.rounds,balance:r.body.balance}})}}
const auditAfter=verifyAudit();await stop();
const summary={started,finished:new Date().toISOString(),players:people.length,personas:Object.fromEntries(["casual","explorer","regular","enthusiast","reconnect"].map(t=>[t,people.filter(p=>p.type===t).length])),successfulPlays,totalRequests,expectedErrors,latency_ms:{p50:Number(pct(lat,.5).toFixed(2)),p95:Number(pct(lat,.95).toFixed(2)),p99:Number(pct(lat,.99).toFixed(2)),max:Number(Math.max(...lat,0).toFixed(2))},persistence:{sampled:before.size,restored,rate:before.size?restored/before.size:0},audit_before_restart:auditBefore,audit_after_restart:auditAfter,health_before:health1,health_after:health2,failures,pass:failures.filter(x=>x.type!=="server_stderr").length===0&&restored===before.size&&auditAfter.ok};
fs.writeFileSync(path.join(reportDir,"player-simulation-300.json"),JSON.stringify(summary,null,2),"utf8");
const md=["# Pulso 90 — simulação de 300 jogadores","",`- PASS: **${summary.pass}**`,`- Jogadores: ${summary.players}`,`- Rodadas concluídas: ${successfulPlays}`,`- Requests: ${totalRequests}`,`- Latência p50/p95/p99: ${summary.latency_ms.p50} / ${summary.latency_ms.p95} / ${summary.latency_ms.p99} ms`,`- Sessões restauradas após reinício: ${restored}/${before.size}`,`- Auditoria: ${auditAfter.ok?"PASS":"FAIL"} (${auditAfter.rows||0} linhas)`,`- Falhas inesperadas: ${failures.filter(x=>x.type!=="server_stderr").length}`,"","## Personas",...Object.entries(summary.personas).map(([k,v])=>`- ${k}: ${v}`),"","## Falhas",...(failures.length?failures.slice(0,50).map(x=>"- "+JSON.stringify(x)):["- Nenhuma"])];
fs.writeFileSync(path.join(reportDir,"player-simulation-300.md"),md.join("\n"),"utf8");
console.log(JSON.stringify(summary,null,2));