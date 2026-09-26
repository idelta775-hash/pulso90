import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const runtime=path.resolve(root,"..","runtime");
fs.mkdirSync(runtime,{recursive:true});
const auditFile=path.join(runtime,"games-lab-audit-v03.jsonl");
const telemetryFile=path.join(runtime,"product-telemetry-v1.jsonl");
const PORT=Number(process.env.PULSO90_GAMES_PORT||19011);
const sessions=new Map();
let lastAuditHash="GENESIS";

const tigerTable=[
  {p:.65,m:0,s:["🍒","🍋","🍊"]},{p:.10,m:.5,s:["🍒","🍒","🍋"]},
  {p:.08,m:1,s:["🍋","🍋","🍋"]},{p:.06,m:1.5,s:["🍊","🍊","🍊"]},
  {p:.04,m:2,s:["🍀","🍀","🍀"]},{p:.04,m:5,s:["⭐","⭐","⭐"]},
  {p:.02,m:10,s:["7️⃣","7️⃣","7️⃣"]},{p:.008,m:25,s:["💎","💎","💎"]},
  {p:.002,m:30,s:["🐯","🐯","🐯"]}
];
const duel={home:{p:.43,m:2.23,label:"CASA"},draw:{p:.14,m:6.85,label:"EMPATE"},away:{p:.43,m:2.23,label:"FORA"}};

const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
const newServerSeed=()=>crypto.randomBytes(32).toString("hex");
const newClientSeed=()=>crypto.randomBytes(16).toString("hex");
function fairUnit(s,game){
  const nonce=s.nonce++;
  const msg=`${s.clientSeed}:${nonce}:${game}`;
  const digest=crypto.createHmac("sha256",s.serverSeed).update(msg).digest();
  const n=digest.readBigUInt64BE(0);
  const u=Number(n>>11n)/9007199254740992;
  return {u,nonce,message:msg};
}
function tiger(u){let c=0;for(const x of tigerTable){c+=x.p;if(u<c)return x}return tigerTable.at(-1)}
function crash(u){if(u<.03)return 1;return Math.min(100,Math.floor((.97/(1-u))*100)/100)}
function duelOutcome(u){if(u<.43)return"home";if(u<.57)return"draw";return"away"}
function tier(points){return points>=500?"GOLD":points>=250?"SILVER":points>=100?"BRONZE":"EXPLORER"}
function corsHeaders(){return {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-demo-session","access-control-max-age":"600","vary":"Origin"}}
function json(res,status,body){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...corsHeaders()});res.end(JSON.stringify(body))}
function audit(record){const base={...record,previousHash:lastAuditHash};const hash=sha256(JSON.stringify(base));const row={...base,hash};fs.appendFileSync(auditFile,JSON.stringify(row)+"\n","utf8");lastAuditHash=hash;return hash}
function state(s){return {balance:s.balance,points:s.points,rounds:s.rounds,tier:tier(s.points),fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:s.nonce}}}
function session(req){const id=String(req.headers["x-demo-session"]||"");return sessions.get(id)}
async function body(req){return await new Promise((resolve,reject)=>{let raw="";req.on("data",c=>{raw+=c;if(raw.length>4096)reject(new Error("too_large"))});req.on("end",()=>{try{const clean=raw.replace(/^\uFEFF/,"").trim();resolve(clean?JSON.parse(clean):{})}catch{reject(new Error("bad_json"))}});req.on("error",reject)})}
function safeStake(v,max=100){const n=Number(v);if(!Number.isFinite(n)||n<=0)return null;return Math.min(max,Math.round(n*100)/100)}
function historyFor(sessionId,limit=20){if(!fs.existsSync(auditFile))return[];const lines=fs.readFileSync(auditFile,"utf8").trim().split(/\r?\n/).filter(Boolean);const out=[];for(let i=lines.length-1;i>=0&&out.length<limit;i--){try{const row=JSON.parse(lines[i]);if(row.session===sessionId&&row.game)out.push(row)}catch{}}return out.reverse()}
const telemetryEvents=new Set(["page_view","game_open","favorite_toggle","filter","search","provider_open","partner_open","sport_tab","original_open"]);
function cleanText(v,max=80){return String(v??"").replace(/[^a-zA-Z0-9À-ÿ _.:+\-/]/g,"").slice(0,max)}
function dailyAnon(clientId,at){const day=String(at).slice(0,10);return sha256(day+":"+String(clientId||"anonymous")).slice(0,16)}
function appendTelemetry(v){
  const at=new Date().toISOString(),event=String(v.event||"");
  if(!telemetryEvents.has(event))throw new Error("invalid_telemetry_event");
  const row={at,event,anon:dailyAnon(v.clientId,at),item:cleanText(v.item),category:cleanText(v.category,40),provider:cleanText(v.provider,60),lang:cleanText(v.lang,8),surface:cleanText(v.surface,30)};
  fs.appendFileSync(telemetryFile,JSON.stringify(row)+"\n","utf8");
  return row;
}
function telemetrySummary(days=7){
  const windowDays=Number.isFinite(Number(days))?Math.max(1,Math.min(30,Number(days))):7;
  const cutoff=Date.now()-windowDays*86400000;
  const counts={events:{},items:{},providers:{},categories:{},daily:{}},unique=new Set();
  if(!fs.existsSync(telemetryFile))return {window_days:windowDays,total_events:0,unique_daily_visitors:0,events:{},top_items:[],top_providers:[],top_categories:[],daily:{}};
  const lines=fs.readFileSync(telemetryFile,"utf8").split(/\r?\n/).filter(Boolean);let total=0;
  for(const line of lines){try{const r=JSON.parse(line),t=Date.parse(r.at);if(!Number.isFinite(t)||t<cutoff)continue;total++;unique.add(String(r.at).slice(0,10)+":"+r.anon);counts.events[r.event]=(counts.events[r.event]||0)+1;if(r.item)counts.items[r.item]=(counts.items[r.item]||0)+1;if(r.provider)counts.providers[r.provider]=(counts.providers[r.provider]||0)+1;if(r.category)counts.categories[r.category]=(counts.categories[r.category]||0)+1;const day=String(r.at).slice(0,10);counts.daily[day]=(counts.daily[day]||0)+1}catch{}}
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,count])=>({name,count}));
  return {window_days:windowDays,total_events:total,unique_daily_visitors:unique.size,events:counts.events,top_items:top(counts.items),top_providers:top(counts.providers),top_categories:top(counts.categories),daily:counts.daily};
}
function settle(s,stake,multiplier,meta,fair){const payout=Math.round(stake*multiplier*100)/100;s.balance=Math.round((s.balance-stake+payout)*100)/100;s.rounds++;s.points+=1+(payout>stake?5:0);const record={at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",game:meta.game,version:"0.3.0",stake,payout,multiplier,balanceAfter:s.balance,outcome:meta.outcome,fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:fair.nonce,message:fair.message}};const auditHash=audit(record);return {payout,net:Math.round((payout-stake)*100)/100,auditHash,fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:fair.nonce,message:fair.message},...state(s)}}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  try{
    if(req.method==="OPTIONS"){res.writeHead(204,corsHeaders());return res.end()}
    if(req.method==="GET"&&url.pathname==="/api/lab/health")
      return json(res,200,{ok:true,mode:"DEMO_ONLY",version:"0.4.0",rng:"HMAC-SHA256 provably-fair demo",games:["pulso-tiger","pulso-launch","pulso-goal-duel"],sessions:sessions.size,telemetry:"anonymous_daily_hash_v1"});
    if(req.method==="POST"&&url.pathname==="/api/telemetry/event"){
      const v=await body(req);appendTelemetry(v);return json(res,202,{ok:true});
    }
    if(req.method==="GET"&&url.pathname==="/api/telemetry/summary"){
      const days=Number(url.searchParams.get("days")||7);return json(res,200,telemetrySummary(days));
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/session"){
      const id=crypto.randomUUID(),serverSeed=newServerSeed(),clientSeed=newClientSeed();
      const s={id,balance:1000,points:0,rounds:0,createdAt:new Date().toISOString(),serverSeed,serverSeedHash:sha256(serverSeed),clientSeed,nonce:0,revealed:[]};
      sessions.set(id,s);
      const auditHash=audit({at:new Date().toISOString(),session:id,mode:"DEMO_ONLY",type:"SESSION_CREATED",balance:1000,fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:0}});
      return json(res,201,{sessionId:id,auditHash,...state(s)});
    }
    if(req.method==="GET"&&url.pathname==="/api/lab/state"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      return json(res,200,state(s));
    }
    if(req.method==="GET"&&url.pathname==="/api/lab/fairness"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      return json(res,200,{current:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:s.nonce},revealed:s.revealed.slice(-5)});
    }
    if(req.method==="GET"&&url.pathname==="/api/lab/history"){const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});return json(res,200,{records:historyFor(s.id,20)});}
    if(req.method==="POST"&&url.pathname==="/api/lab/client-seed"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      const v=await body(req),seed=String(v.clientSeed||"").trim();
      if(!/^[a-zA-Z0-9._:-]{3,64}$/.test(seed))return json(res,400,{error:"invalid_client_seed"});
      s.clientSeed=seed;s.nonce=0;
      const auditHash=audit({at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",type:"CLIENT_SEED_CHANGED",clientSeed:seed,serverSeedHash:s.serverSeedHash});
      return json(res,200,{auditHash,...state(s)});
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/rotate-seed"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      const revealed={serverSeed:s.serverSeed,serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,finalNonce:s.nonce,revealedAt:new Date().toISOString()};
      s.revealed.push(revealed);s.serverSeed=newServerSeed();s.serverSeedHash=sha256(s.serverSeed);s.nonce=0;
      const auditHash=audit({at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",type:"SERVER_SEED_ROTATED",revealed,newServerSeedHash:s.serverSeedHash});
      return json(res,200,{auditHash,revealed,current:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:s.nonce}});
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/reset"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      s.balance=1000;s.points=0;s.rounds=0;
      const auditHash=audit({at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",type:"SESSION_RESET",balance:1000});
      return json(res,200,{auditHash,...state(s)});
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/play"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      const v=await body(req),game=String(v.game||"");
      const stake=safeStake(v.stake,100);if(stake===null)return json(res,400,{error:"invalid_demo_stake"});
      if(s.balance<stake)return json(res,400,{error:"demo_balance_insufficient"});
      const fair=fairUnit(s,game);
      if(game==="pulso-tiger"){
        const o=tiger(fair.u),set=settle(s,stake,o.m,{game,outcome:{symbols:o.s}},fair);
        return json(res,200,{game,symbols:o.s,multiplier:o.m,...set});
      }
      if(game==="pulso-launch"){
        const target=Math.max(1.1,Math.min(20,Number(v.target)||2)),cp=crash(fair.u),won=cp>=target;
        const set=settle(s,stake,won?target:0,{game,outcome:{crashPoint:cp,target,won}},fair);
        return json(res,200,{game,crashPoint:cp,target,won,multiplier:won?target:0,...set});
      }
      if(game==="pulso-goal-duel"){
        const pick=String(v.pick||"home");if(!duel[pick])return json(res,400,{error:"invalid_pick"});
        const out=duelOutcome(fair.u),won=pick===out,m=won?duel[pick].m:0;
        const set=settle(s,stake,m,{game,outcome:{pick,result:out,won}},fair);
        return json(res,200,{game,pick,result:out,resultLabel:duel[out].label,won,multiplier:m,...set});
      }
      return json(res,404,{error:"game_not_found"});
    }
    if(req.method!=="GET"&&req.method!=="HEAD")return json(res,405,{error:"method_not_allowed"});
    let rel=decodeURIComponent(url.pathname);if(rel==="/")rel="/index.html";
    let file=path.resolve(root,"."+rel);
    if(!file.startsWith(root)||!fs.existsSync(file))return json(res,404,{error:"not_found"});
    if(fs.statSync(file).isDirectory())file=path.join(file,"index.html");
    if(!fs.existsSync(file))return json(res,404,{error:"not_found"});
    const ext=path.extname(file).toLowerCase();
    const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".css":"text/css; charset=utf-8",".xml":"application/xml; charset=utf-8",".txt":"text/plain; charset=utf-8",".md":"text/markdown; charset=utf-8",".webmanifest":"application/manifest+json; charset=utf-8",".svg":"image/svg+xml"};
    res.writeHead(200,{"content-type":types[ext]||"application/octet-stream","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin"});
    if(req.method==="HEAD")return res.end();
    fs.createReadStream(file).pipe(res);
  }catch(e){const m=String(e&&e.message||"");if(m==="bad_json"||m==="too_large"||m==="invalid_telemetry_event")return json(res,400,{error:m});json(res,500,{error:"lab_internal_error"});}
});
server.listen(PORT,"127.0.0.1",()=>console.log("PULSO90_GAMES_RGS_V04=http://127.0.0.1:"+PORT));