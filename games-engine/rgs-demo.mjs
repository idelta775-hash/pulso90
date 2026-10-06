import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const runtime=process.env.PULSO90_RUNTIME_DIR?path.resolve(process.env.PULSO90_RUNTIME_DIR):path.resolve(root,"..","runtime");
fs.mkdirSync(runtime,{recursive:true});
const auditFile=path.join(runtime,"games-lab-audit-v03.jsonl");
const telemetryFile=path.join(runtime,"product-telemetry-v1.jsonl");
const sessionFile=path.join(runtime,"games-lab-sessions-v04.jsonl");
const paymentFile=path.join(runtime,"payments-sandbox-v1.jsonl");
const internalLabFile=path.join(runtime,"owner-lab-v1.json");
const casinoAdaptersFile=path.join(root,"data","casino-adapters.json");
const financeVaultBridge=path.join(root,"ops","finance-provider-vault.py");
const PORT=Number(process.env.PULSO90_GAMES_PORT||19011);
const sessions=new Map();
const telemetryRate=new Map();
const oddsCache=new Map();
const paymentEvents=new Set(),creditedPayments=new Set();
const internalTokens=new Map();
const ASAAS_API_KEY=String(process.env.PULSO90_ASAAS_API_KEY||process.env.ASAAS_API_KEY||"").trim();
const ASAAS_WEBHOOK_TOKEN=String(process.env.PULSO90_ASAAS_WEBHOOK_TOKEN||"").trim();
const ASAAS_ENV=String(process.env.PULSO90_ASAAS_ENV||"sandbox").toLowerCase()==="production"?"production":"sandbox";
const ASAAS_BASE=ASAAS_ENV==="production"?"https://api.asaas.com/v3":"https://api-sandbox.asaas.com/v3";
const REAL_MONEY_ENABLED=ASAAS_ENV==="production"&&process.env.PULSO90_REAL_MONEY_ENABLE==="1"&&process.env.PULSO90_OPERATOR_REGULATORY_ACK==="1";
const PAYMENT_PREFIX=ASAAS_ENV==="production"?"pulso90-prod":"pulso90-sandbox";
const PAYMENT_METHODS=new Set(["PIX","BOLETO","CREDIT_CARD","UNDEFINED"]);
const PIX_KEY_TYPES=new Set(["CPF","CNPJ","EMAIL","PHONE","EVP"]);
const ODDS_API_KEY=String(process.env.THE_ODDS_API_KEY||process.env.ODDS_API_KEY||"").trim();
const ODDS_CACHE_MS=60000,ODDS_STALE_MS=10*60000,ODDS_MARKET="h2h",ODDS_REGIONS="eu";
const ODDS_SCOPE_KEYS={
  football:["soccer_brazil_campeonato","soccer_epl","soccer_spain_la_liga","soccer_germany_bundesliga","soccer_italy_serie_a","soccer_france_ligue_one","soccer_uefa_champs_league"],
  basketball:["basketball_nba"],
  tennis:[],cricket:[]
};
const ODDS_ALLOWED_SCOPES=new Set(Object.keys(ODDS_SCOPE_KEYS));
let lastAuditHash="GENESIS";

const tigerTable=[
  {p:.816031,m:0,symbol:""},{p:.109367,m:3,symbol:"🍊"},{p:.04,m:5,symbol:"🎆"},
  {p:.02,m:8,symbol:"🧧"},{p:.01,m:10,symbol:"👛"},{p:.004,m:25,symbol:"🟢"},
  {p:.0005,m:100,symbol:"🪙"},{p:.0001,m:250,symbol:"🐾"},{p:.000002,m:2500,symbol:"🐾"}
];
const duel={home:{p:.43,m:2.23,label:"CASA"},draw:{p:.14,m:6.85,label:"EMPATE"},away:{p:.43,m:2.23,label:"FORA"}};

const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
function pinHash(pin,salt){return crypto.scryptSync(String(pin),salt,32).toString("hex")}
function loadInternalLab(){
  let d={version:1,users:{},ledger:[],sportsTickets:[],treasury:1000000,operatorConfig:{financial_mode:"demo",selected_provider:"asaas",real_execution_state:"locked"}};
  if(fs.existsSync(internalLabFile)){try{d={...d,...JSON.parse(fs.readFileSync(internalLabFile,"utf8"))}}catch{}}
  if(!d.users||typeof d.users!=="object")d.users={};
  if(!Array.isArray(d.ledger))d.ledger=[];
  if(!Array.isArray(d.sportsTickets))d.sportsTickets=[];
  if(!d.operatorConfig||typeof d.operatorConfig!=="object")d.operatorConfig={financial_mode:"demo",selected_provider:"asaas",real_execution_state:"locked"};
  if(!["demo","real"].includes(String(d.operatorConfig.financial_mode)))d.operatorConfig.financial_mode="demo";
  if(!Number.isFinite(Number(d.treasury)))d.treasury=1000000;
  return d;
}
let internalLab=loadInternalLab();
function saveInternalLab(){const tmp=internalLabFile+".tmp";fs.writeFileSync(tmp,JSON.stringify(internalLab,null,2),"utf8");fs.renameSync(tmp,internalLabFile)}
function ensureInternalDemoSession(user){
  if(user.demoSessionId&&sessions.has(user.demoSessionId))return sessions.get(user.demoSessionId);
  const id=crypto.randomUUID(),serverSeed=newServerSeed(),clientSeed=newClientSeed();
  const ss={id,balance:0,points:0,rounds:0,createdAt:new Date().toISOString(),serverSeed,serverSeedHash:sha256(serverSeed),clientSeed,nonce:0,revealed:[]};
  sessions.set(id,ss);persistSession(ss,"owner_lab_created");user.demoSessionId=id;saveInternalLab();return ss;
}
function internalUserSafe(u){return {username:u.username,name:u.name,role:u.role,demoSessionId:u.demoSessionId||"",createdAt:u.createdAt}}
function internalAuth(req){
  const t=String(req.headers["x-lab-token"]||"");const x=internalTokens.get(t);
  if(!x||x.expires<Date.now()){if(t)internalTokens.delete(t);return null}
  const u=internalLab.users[x.username];return u||null;
}
function canCreateRole(actor,role){
  if(!actor)return false;if(actor.role==="dono")return ["dono","socio","tecnico","tester"].includes(role);
  if(actor.role==="socio")return ["tecnico","tester"].includes(role);
  return actor.role==="tecnico"&&role==="tester";
}
function labLedger(row){const r={id:crypto.randomUUID(),at:new Date().toISOString(),...row};internalLab.ledger.push(r);if(internalLab.ledger.length>2000)internalLab.ledger=internalLab.ledger.slice(-2000);saveInternalLab();return r}
function financeVault(action,payload={}){const x=spawnSync("python",[financeVaultBridge,action],{input:JSON.stringify(payload),encoding:"utf8",windowsHide:true,timeout:10000});if(x.status!==0)throw new Error("finance_vault_failed");const out=JSON.parse(String(x.stdout||"{}"));if(!out.ok)throw new Error(out.error||"finance_vault_failed");return out}
function operatorConfig(){return {...internalLab.operatorConfig,real_execution_enabled:false,real_execution_reason:"provider_connector_not_certified"}}
function casinoAdapters(){try{return JSON.parse(fs.readFileSync(casinoAdaptersFile,"utf8"))}catch{return {version:"0",policy:{},contract:{},aggregators:[],providers:[]}}}
function casinoProvider(id){return (casinoAdapters().providers||[]).find(x=>x.id===id)||null}
function casinoAggregator(id){return (casinoAdapters().aggregators||[]).find(x=>x.id===id)||null}
function hub88Config(){const operatorId=String(process.env.PULSO90_HUB88_OPERATOR_ID||"").trim(),privateKey=String(process.env.PULSO90_HUB88_PRIVATE_KEY_PEM||"").trim(),subPartnerId=String(process.env.PULSO90_HUB88_SUB_PARTNER_ID||"").trim(),base=String(process.env.PULSO90_HUB88_BASE||"https://api.server1.ih.testenv.io").trim(),publicKey=String(process.env.PULSO90_HUB88_PUBLIC_KEY_PEM||"").trim();return {configured:Boolean(operatorId&&privateKey),operator_id_set:Boolean(operatorId),private_key_set:Boolean(privateKey),public_key_set:Boolean(publicKey),sub_partner_id_set:Boolean(subPartnerId),base,is_staging:/testenv|server1\.ih\.testenv/i.test(base)}}
function aggregatorReadiness(){const x=casinoAdapters();return (x.aggregators||[]).map(a=>{const extra=a.id==="hub88"?hub88Config():{configured:false};return {id:a.id,name:a.name,priority:a.priority,commercial_status:a.commercial_status,technical_status:extra.configured?"credentials_loaded_pending_certification":a.technical_status,supports_demo:!!a.supports_demo,supports_real:!!a.supports_real,configured:!!extra.configured,environment:a.id==="hub88"?(extra.is_staging?"staging":"custom"):"not_configured"}})}

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
function tigerGrid(outcome,fair){
  const base=["🍊","🎆","🧧","👛","🟢","🪙","🐾","🍊","🎆"],grid=[...base];
  const digest=crypto.createHash("sha256").update(fair.message+":grid").digest();
  for(let i=grid.length-1,j=0;i>0;i--,j++){const k=digest[j%digest.length]%(i+1);[grid[i],grid[k]]=[grid[k],grid[i]]}
  if(outcome.m===2500)return Array(9).fill("🐾");
  if(outcome.m>0){const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]],line=lines[digest[20]%lines.length];for(const i of line)grid[i]=outcome.symbol}
  return grid;
}
function crash(u){if(u<.03)return 1;return Math.min(100,Math.floor((.97/(1-u))*100)/100)}
function duelOutcome(u){if(u<.43)return"home";if(u<.57)return"draw";return"away"}
function tier(points){return points>=500?"GOLD":points>=250?"SILVER":points>=100?"BRONZE":"EXPLORER"}
function corsHeaders(){return {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-demo-session,x-lab-token","access-control-max-age":"600","vary":"Origin"}}
function json(res,status,body){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...corsHeaders()});res.end(JSON.stringify(body))}
function audit(record){const base={...record,previousHash:lastAuditHash};const hash=sha256(JSON.stringify(base));const row={...base,hash};fs.appendFileSync(auditFile,JSON.stringify(row)+"\n","utf8");lastAuditHash=hash;return hash}
function state(s){return {balance:s.balance,points:s.points,rounds:s.rounds,tier:tier(s.points),fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:s.nonce}}}
function persistSession(s,reason="update"){const row={at:new Date().toISOString(),reason,id:s.id,balance:s.balance,points:s.points,rounds:s.rounds,createdAt:s.createdAt,serverSeed:s.serverSeed,serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:s.nonce,revealed:Array.isArray(s.revealed)?s.revealed.slice(-10):[]};fs.appendFileSync(sessionFile,JSON.stringify(row)+"\n","utf8")}
function restoreSessions(){if(!fs.existsSync(sessionFile))return 0;const latest=new Map();for(const line of fs.readFileSync(sessionFile,"utf8").split(/\r?\n/)){if(!line.trim())continue;try{const r=JSON.parse(line);if(r&&r.id)latest.set(r.id,r)}catch{}}for(const r of latest.values()){sessions.set(r.id,{id:r.id,balance:Number(r.balance)||0,points:Number(r.points)||0,rounds:Number(r.rounds)||0,createdAt:r.createdAt||new Date().toISOString(),serverSeed:String(r.serverSeed||newServerSeed()),serverSeedHash:String(r.serverSeedHash||""),clientSeed:String(r.clientSeed||newClientSeed()),nonce:Number(r.nonce)||0,revealed:Array.isArray(r.revealed)?r.revealed:[]});const s=sessions.get(r.id);if(!s.serverSeedHash)s.serverSeedHash=sha256(s.serverSeed)}return sessions.size}
function session(req){const id=String(req.headers["x-demo-session"]||"");return sessions.get(id)}
async function body(req){return await new Promise((resolve,reject)=>{let raw="";req.on("data",c=>{raw+=c;if(raw.length>4096)reject(new Error("too_large"))});req.on("end",()=>{try{const clean=raw.replace(/^\uFEFF/,"").trim();resolve(clean?JSON.parse(clean):{})}catch{reject(new Error("bad_json"))}});req.on("error",reject)})}
function safeStake(v,max=100){const n=Number(v);if(!Number.isFinite(n)||n<=0)return null;return Math.min(max,Math.round(n*100)/100)}
function safeMoney(v,min=5,max=1000){const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)return null;return Math.round(n*100)/100}
function paymentRecord(row){fs.appendFileSync(paymentFile,JSON.stringify({at:new Date().toISOString(),...row})+"\n","utf8")}
function restorePaymentState(){
  if(!fs.existsSync(paymentFile))return;
  for(const line of fs.readFileSync(paymentFile,"utf8").split(/\r?\n/)){if(!line.trim())continue;try{const r=JSON.parse(line);if(r.event_id)paymentEvents.add(r.event_id);if(r.credited_payment_id)creditedPayments.add(r.credited_payment_id)}catch{}}
}
function paymentHistory(sessionId,limit=30){
  if(!fs.existsSync(paymentFile))return[];
  const out=[];for(const line of fs.readFileSync(paymentFile,"utf8").split(/\r?\n/)){if(!line.trim())continue;try{const r=JSON.parse(line);if(r.session===sessionId)out.push(r)}catch{}}
  return out.slice(-limit).reverse();
}
async function asaas(pathname,{method="GET",data=null}={}){
  if(!ASAAS_API_KEY)throw new Error("asaas_not_configured");
  const r=await fetch(ASAAS_BASE+pathname,{method,headers:{"content-type":"application/json","user-agent":"Pulso90/0.19 (Node.js; "+ASAAS_ENV+")","access_token":ASAAS_API_KEY},body:data?JSON.stringify(data):undefined});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error("asaas_request_failed");e.status=r.status;e.payload=payload;throw e}
  return payload;
}
async function createAsaasLink(s,v){
  const value=safeMoney(v.value),billingType=String(v.billingType||"PIX").toUpperCase();
  if(value===null)throw new Error("invalid_payment_value");
  if(!PAYMENT_METHODS.has(billingType))throw new Error("invalid_payment_method");
  if(ASAAS_ENV==="production"&&!REAL_MONEY_ENABLED)throw new Error("real_money_gate_closed");
  const ref=PAYMENT_PREFIX+":"+s.id+":"+crypto.randomUUID();
  const payload={name:"Pulso 90 "+(ASAAS_ENV==="sandbox"?"Sandbox":"Operador"),description:ASAAS_ENV==="sandbox"?"Recarga de créditos de homologação Pulso 90":"Depósito Pulso 90",value,billingType,chargeType:"DETACHED",externalReference:ref,notificationEnabled:false,isAddressRequired:false};
  if(billingType==="BOLETO"||billingType==="UNDEFINED")payload.dueDateLimitDays=5;
  const x=await asaas("/paymentLinks",{method:"POST",data:payload});
  const row={type:"payment_link_created",session:s.id,provider:"asaas",environment:ASAAS_ENV,external_reference:ref,payment_link_id:String(x.id||""),billing_type:billingType,value,status:"PENDING"};
  paymentRecord(row);
  return {provider:"asaas",environment:ASAAS_ENV,id:String(x.id||""),url:String(x.url||x.invoiceUrl||""),value,billingType,externalReference:ref};
}
function historyFor(sessionId,limit=20){if(!fs.existsSync(auditFile))return[];const lines=fs.readFileSync(auditFile,"utf8").trim().split(/\r?\n/).filter(Boolean);const out=[];for(let i=lines.length-1;i>=0&&out.length<limit;i--){try{const row=JSON.parse(lines[i]);if(row.session===sessionId&&row.game)out.push(row)}catch{}}return out.reverse()}
const telemetryEvents=new Set(["page_view","game_open","favorite_toggle","filter","search","provider_open","partner_open","sport_tab","original_open"]);
function cleanText(v,max=80){return String(v??"").replace(/[^a-zA-Z0-9À-ÿ _.:+\-/]/g,"").slice(0,max)}
function dailyAnon(clientId,at){const day=String(at).slice(0,10);return sha256(day+":"+String(clientId||"anonymous")).slice(0,16)}
function telemetryAllowed(req){const now=Date.now(),key=sha256(String(req.socket.remoteAddress||"unknown")).slice(0,16),cur=telemetryRate.get(key);if(!cur||now-cur.start>=60000){telemetryRate.set(key,{start:now,count:1});return true}cur.count++;return cur.count<=120}
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

const REF_SPORT_MAP={football:1,combat:2,futsal:6,snooker:18};
async function fetchReferenceSportsbook(scope){
  const sid=REF_SPORT_MAP[scope];if(!sid)return {available:false,scope,matches:[],events:[],reason:"unsupported_reference_scope"};
  const r=await fetch("https://esportesgol.net/axios/data",{method:"POST",headers:{"content-type":"application/json","accept":"application/json","user-agent":"Pulso90-LabReference/0.21"},body:JSON.stringify({filtro:-1})});
  if(!r.ok)throw new Error("reference_feed_failed");
  const x=await r.json(),rows=Array.isArray(x.lista)?x.lista.filter(g=>Number(g.esporte_id)===sid):[];
  const matches=[],events=[];
  for(const g of rows){
    const eventId="ref:"+String(g.id||"");
    matches.push({competition:String(g.campeonato||""),home:String(g.tc||""),away:String(g.tf||""),time:String(g.data_hora||""),status:"scheduled",status_text:"AGENDADO",home_score:null,away_score:null,source:"reference_feed"});
    const outcomes=[];
    if(Number(g.od_casa)>1)outcomes.push({name:String(g.tc||"Casa"),price:Number(g.od_casa),book:"reference"});
    if(Number(g.od_empate)>1)outcomes.push({name:"Draw",price:Number(g.od_empate),book:"reference"});
    if(Number(g.od_fora)>1)outcomes.push({name:String(g.tf||"Fora"),price:Number(g.od_fora),book:"reference"});
    if(outcomes.length)events.push({event_id:eventId,sport_key:scope,league:String(g.campeonato||""),home_team:String(g.tc||""),away_team:String(g.tf||""),start_time:String(g.data_hora||""),outcomes,reference_markets:{double_chance:{home_draw:Number(g.od_1x)||0,home_away:Number(g.od_12)||0,draw_away:Number(g.od_x2)||0},btts:{yes:Number(g.od_btsy)||0,no:Number(g.od_btsn)||0},totals_25:{over:Number(g.od_mais25)||0,under:Number(g.od_menos25)||0},more_markets:Number(g.mais_jogos)||0}});
  }
  return {available:true,scope,source:"public_reference_only",captured_at:new Date().toISOString(),matches,events,source_config:{min_stake:Number(x?.config?.valor_minimo)||null,max_stake:Number(x?.config?.valor_maximo)||null,max_prize:Number(x?.config?.premio_maximo)||null,max_games:Number(x?.config?.max_jogos)||null,cashout_active:Boolean(x?.config?.cashout_ativo),bet_builder_active:Boolean(x?.config?.bet_builder_ativo)}};
}
function normTeam(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|ac|sc|club|clube|deportivo|sporting)\b/g,"").replace(/[^a-z0-9]+/g," ").trim()}
async function validateSportsSelections(selections){
  const rows=[],cache=new Map();
  for(const raw of selections){
    const scope=String(raw.scope||"football").toLowerCase(),eventId=String(raw.event_id||""),selection=String(raw.selection||"");
    if(!REF_SPORT_MAP[scope]||!eventId||!selection)throw new Error("invalid_sports_selection");
    if(!cache.has(scope))cache.set(scope,await fetchReferenceSportsbook(scope));
    const feed=cache.get(scope),ev=(feed.events||[]).find(x=>x.event_id===eventId);
    if(!ev)throw new Error("sports_event_not_available");
    const out=(ev.outcomes||[]).find(x=>String(x.name)===selection);
    if(!out||!Number.isFinite(Number(out.price))||Number(out.price)<=1)throw new Error("sports_odd_not_available");
    rows.push({scope,event_id:eventId,league:ev.league,home:ev.home_team,away:ev.away_team,start_time:ev.start_time,selection:String(out.name),price:Number(out.price)});
  }
  return rows;
}
async function fetchFinishedFootball(){
  const r=await fetch("https://sportscore.com/api/widget/matches/?sport=football&limit=200&src=pulso90",{headers:{accept:"application/json"}});
  if(!r.ok)throw new Error("result_feed_failed");const x=await r.json();return (Array.isArray(x.matches)?x.matches:[]).filter(m=>String(m.status||"").toLowerCase()==="finished");
}
function findFootballResult(leg,finished){
  const h=normTeam(leg.home),a=normTeam(leg.away),t=Date.parse(String(leg.start_time||"").replace(" ","T"));
  return finished.find(m=>{
    const names=(normTeam(m.home)===h&&normTeam(m.away)===a)||(normTeam(m.home)===a&&normTeam(m.away)===h);
    const mt=Date.parse(m.time||"");return names&&(!Number.isFinite(t)||!Number.isFinite(mt)||Math.abs(mt-t)<36*3600000);
  })||null;
}
async function settleSportsTickets(username=""){
  const pending=internalLab.sportsTickets.filter(t=>t.status==="PENDING"&&(!username||t.username===username));if(!pending.length)return [];
  let football=[];try{football=await fetchFinishedFootball()}catch{}
  const settled=[];
  for(const ticket of pending){
    let unresolved=false,lost=false;
    for(const leg of ticket.selections){
      if(leg.scope!=="football"){unresolved=true;continue}
      const m=findFootballResult(leg,football);if(!m){unresolved=true;continue}
      const hs=Number(m.home_score),as=Number(m.away_score);if(!Number.isFinite(hs)||!Number.isFinite(as)){unresolved=true;continue}
      const result=hs>as?String(m.home):as>hs?String(m.away):"Draw";leg.result={home_score:hs,away_score:as,winner:result,source:"SportScore",confirmed_at:new Date().toISOString()};
      if(normTeam(leg.selection)!==normTeam(result))lost=true;
    }
    if(lost||(!unresolved&&ticket.selections.every(x=>x.result))){
      ticket.status=lost?"LOST":"WON";ticket.settled_at=new Date().toISOString();ticket.payout=lost?0:Math.round(ticket.stake*ticket.combined_odds*100)/100;
      const u=internalLab.users[ticket.username],ss=u?ensureInternalDemoSession(u):null;
      if(ss&&ticket.payout>0){ss.balance=Math.round((ss.balance+ticket.payout)*100)/100;persistSession(ss,"sports_ticket_win");internalLab.treasury=Math.round((Number(internalLab.treasury)-ticket.payout)*100)/100}
      labLedger({type:"sports_ticket_settled",username:ticket.username,ticket_id:ticket.id,status:ticket.status,stake:ticket.stake,payout:ticket.payout});
      settled.push(ticket);
    }
  }
  saveInternalLab();return settled;
}

function summarizeOddsEvent(e,sportKey){
  const best=new Map();
  for(const b of Array.isArray(e.bookmakers)?e.bookmakers:[]){
    for(const m of Array.isArray(b.markets)?b.markets:[]){
      if(String(m.key||"")!==ODDS_MARKET)continue;
      for(const o of Array.isArray(m.outcomes)?m.outcomes:[]){
        const name=String(o.name||"").trim(),price=Number(o.price);
        if(!name||!Number.isFinite(price)||price<=1)continue;
        const prev=best.get(name);
        if(!prev||price>prev.price)best.set(name,{name,price,book:String(b.title||b.key||"")});
      }
    }
  }
  return {event_id:String(e.id||""),sport_key:String(e.sport_key||sportKey),league:String(e.sport_title||""),home_team:String(e.home_team||""),away_team:String(e.away_team||""),start_time:String(e.commence_time||""),outcomes:[...best.values()]};
}
async function fetchOddsScope(scope){
  if(!ODDS_ALLOWED_SCOPES.has(scope))return {available:false,configured:Boolean(ODDS_API_KEY),scope,events:[],reason:"unsupported_scope"};
  const keys=ODDS_SCOPE_KEYS[scope]||[];
  if(!keys.length)return {available:false,configured:Boolean(ODDS_API_KEY),scope,events:[],reason:"scope_not_configured"};
  if(!ODDS_API_KEY)return {available:false,configured:false,scope,events:[],reason:"provider_not_configured"};
  const cacheKey=scope,hit=oddsCache.get(cacheKey),age=hit?Date.now()-hit.at:Infinity;
  if(hit&&age<ODDS_CACHE_MS)return {...hit.value,cache:"fresh"};
  const errors=[],events=[],quota={remaining:null,used:null,last:null};
  await Promise.all(keys.map(async sportKey=>{
    try{
      const qs=new URLSearchParams({apiKey:ODDS_API_KEY,regions:ODDS_REGIONS,markets:ODDS_MARKET,oddsFormat:"decimal",dateFormat:"iso"});
      const endpoint="https://api.the-odds-api.com/v4/sports/"+encodeURIComponent(sportKey)+"/odds/?"+qs.toString();
      const r=await fetch(endpoint,{headers:{accept:"application/json"}});
      quota.remaining=r.headers.get("x-requests-remaining")??quota.remaining;
      quota.used=r.headers.get("x-requests-used")??quota.used;
      quota.last=r.headers.get("x-requests-last")??quota.last;
      const payload=await r.json().catch(()=>null);
      if(!r.ok){errors.push({sport_key:sportKey,status:r.status});return}
      const rows=Array.isArray(payload)?payload:[];
      for(const row of rows){const x=summarizeOddsEvent(row,sportKey);if(x.event_id&&x.home_team&&x.away_team&&x.outcomes.length)events.push(x)}
    }catch{errors.push({sport_key:sportKey,status:0})}
  }));
  if(!events.length&&hit&&age<ODDS_STALE_MS){
    return {...hit.value,available:hit.value.events.length>0,stale:true,cache:"stale",errors};
  }
  const value={available:events.length>0,configured:true,scope,market:ODDS_MARKET,regions:ODDS_REGIONS,events,fetched_at:new Date().toISOString(),errors,quota};
  oddsCache.set(cacheKey,{at:Date.now(),value});return {...value,cache:"miss"};
}
function settle(s,stake,multiplier,meta,fair){const payout=Math.round(stake*multiplier*100)/100;s.balance=Math.round((s.balance-stake+payout)*100)/100;s.rounds++;s.points+=1+(payout>stake?5:0);const record={at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",game:meta.game,version:"0.3.0",stake,payout,multiplier,balanceAfter:s.balance,outcome:meta.outcome,fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:fair.nonce,message:fair.message}};const auditHash=audit(record);persistSession(s,"settle:"+meta.game);return {payout,net:Math.round((payout-stake)*100)/100,auditHash,fairness:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:fair.nonce,message:fair.message},...state(s)}}
restoreSessions();
restorePaymentState();
if(fs.existsSync(auditFile)){try{const lines=fs.readFileSync(auditFile,"utf8").trim().split(/\r?\n/).filter(Boolean);if(lines.length){const last=JSON.parse(lines.at(-1));if(last&&last.hash)lastAuditHash=last.hash}}catch{}}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  try{
    if(req.method==="OPTIONS"){res.writeHead(204,corsHeaders());return res.end()}
    if(req.method==="GET"&&url.pathname==="/api/lab/health")
      return json(res,200,{ok:true,mode:"DEMO_ONLY",version:"0.5.1",rng:"HMAC-SHA256 provably-fair demo",games:["pulso-tiger","pulso-launch","pulso-goal-duel"],sessions:sessions.size,telemetry:"anonymous_daily_hash_v1",odds_provider_configured:Boolean(ODDS_API_KEY),payments:{provider:"asaas",environment:ASAAS_ENV,configured:Boolean(ASAAS_API_KEY),real_money_enabled:REAL_MONEY_ENABLED}});
    if(req.method==="GET"&&url.pathname==="/api/platform/operator-mode") return json(res,200,{operator:operatorConfig()});
    if(req.method==="GET"&&url.pathname==="/api/platform/capabilities")
      return json(res,200,{mode:"DEMO_ONLY",sportsbook:{prematch:true,live:true,single:true,multiple:true,bet_builder:"provider_required",cashout:"provider_required",results:true,real_odds:Boolean(ODDS_API_KEY)},games:{originals:true,provider_catalog:true,slots:"catalog_only",live_casino:"catalog_only",crash:"demo_original"},payments:{provider:"asaas",environment:ASAAS_ENV,methods:["PIX","BOLETO","CREDIT_CARD"],withdrawals:ASAAS_ENV==="sandbox"?"sandbox_homologation":(REAL_MONEY_ENABLED?"operator_enabled":"operator_gate_closed"),real_money_enabled:REAL_MONEY_ENABLED}});
    if(req.method==="GET"&&url.pathname==="/api/payments/status")
      return json(res,200,{provider:"asaas",environment:ASAAS_ENV,configured:Boolean(ASAAS_API_KEY),webhook_configured:Boolean(ASAAS_WEBHOOK_TOKEN),methods:["PIX","BOLETO","CREDIT_CARD"],withdrawals:ASAAS_ENV==="sandbox"?"sandbox_homologation":(REAL_MONEY_ENABLED?"operator_enabled":"operator_gate_closed"),real_money_enabled:REAL_MONEY_ENABLED});
    if(req.method==="GET"&&url.pathname==="/api/payments/history"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      return json(res,200,{environment:ASAAS_ENV,records:paymentHistory(s.id)});
    }
    if(req.method==="POST"&&url.pathname==="/api/payments/create-link"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      if(!ASAAS_API_KEY)return json(res,503,{error:"asaas_not_configured",environment:ASAAS_ENV});
      try{return json(res,201,await createAsaasLink(s,await body(req)))}catch(e){
        if(["invalid_payment_value","invalid_payment_method"].includes(String(e.message)))return json(res,400,{error:e.message});
        if(String(e.message)==="real_money_gate_closed")return json(res,403,{error:"real_money_gate_closed"});
        return json(res,502,{error:"asaas_request_failed",environment:ASAAS_ENV,status:Number(e.status)||0});
      }
    }
    if(req.method==="POST"&&url.pathname==="/api/payments/asaas/webhook"){
      if(!ASAAS_WEBHOOK_TOKEN)return json(res,503,{error:"asaas_webhook_not_configured"});
      if(String(req.headers["asaas-access-token"]||"")!==ASAAS_WEBHOOK_TOKEN)return json(res,401,{error:"invalid_webhook_token"});
      const v=await body(req),eventId=String(v.id||""),event=String(v.event||""),pmt=v.payment||{};
      if(!eventId)return json(res,400,{error:"invalid_webhook_event"});
      if(paymentEvents.has(eventId))return json(res,200,{ok:true,duplicate:true});
      paymentEvents.add(eventId);
      const ref=String(pmt.externalReference||""),parts=ref.split(":"),sid=parts[0]===PAYMENT_PREFIX?parts[1]:"";
      const row={type:"asaas_webhook",event_id:eventId,event,payment_id:String(pmt.id||""),session:sid,billing_type:String(pmt.billingType||""),value:Number(pmt.value)||0,status:String(pmt.status||""),external_reference:ref};
      let credited=false;
      if(sid&&(ASAAS_ENV==="sandbox"||REAL_MONEY_ENABLED)&&["PAYMENT_RECEIVED","PAYMENT_CONFIRMED"].includes(event)&&pmt.id&&!creditedPayments.has(String(pmt.id))){
        const target=sessions.get(sid),value=safeMoney(pmt.value,0.01,1000);
        if(target&&value!==null){target.balance=Math.round((target.balance+value)*100)/100;persistSession(target,"asaas_"+ASAAS_ENV+"_credit");creditedPayments.add(String(pmt.id));row.credited_payment_id=String(pmt.id);credited=true}
      }
      paymentRecord(row);return json(res,200,{ok:true,environment:ASAAS_ENV,credited_balance:credited});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/bootstrap"){
      if(Object.keys(internalLab.users).length)return json(res,409,{error:"owner_already_bootstrapped"});
      if(req.socket.remoteAddress!=="127.0.0.1"&&req.socket.remoteAddress!=="::1")return json(res,403,{error:"loopback_only"});
      const v=await body(req),username=cleanText(v.username||"owner",40).toLowerCase(),name=cleanText(v.name||"Dono Pulso 90",80),pin=String(v.pin||"");
      if(!/^[a-z0-9._-]{3,40}$/.test(username)||!/^[0-9]{6,12}$/.test(pin))return json(res,400,{error:"invalid_owner_bootstrap"});
      const salt=crypto.randomBytes(16).toString("hex"),u={username,name,role:"dono",pinSalt:salt,pinHash:pinHash(pin,salt),createdAt:new Date().toISOString(),demoSessionId:""};
      internalLab.users[username]=u;ensureInternalDemoSession(u);labLedger({type:"owner_bootstrap",username,role:"dono"});return json(res,201,{ok:true,user:internalUserSafe(u)});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/login"){
      const v=await body(req),username=String(v.username||"").trim().toLowerCase(),pin=String(v.pin||""),u=internalLab.users[username];
      if(!u||!u.pinSalt||pinHash(pin,u.pinSalt)!==u.pinHash)return json(res,401,{error:"invalid_credentials"});
      const token=crypto.randomBytes(32).toString("hex");internalTokens.set(token,{username,expires:Date.now()+12*60*60*1000});const ss=ensureInternalDemoSession(u);
      labLedger({type:"login",username,role:u.role});return json(res,200,{token,user:internalUserSafe(u),state:state(ss)});
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/me"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});const ss=ensureInternalDemoSession(u);
      return json(res,200,{user:internalUserSafe(u),state:state(ss),treasury:internalLab.treasury});
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/operator/config"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      let providers={providers:[]};try{providers=financeVault("status")}catch{}
      return json(res,200,{operator:operatorConfig(),providers:providers.providers||[]});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/operator/config"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});if(u.role!=="dono")return json(res,403,{error:"owner_required"});
      const v=await body(req),mode=String(v.financial_mode||"demo").toLowerCase(),provider=String(v.selected_provider||"asaas").toLowerCase();
      if(!["demo","real"].includes(mode))return json(res,400,{error:"invalid_financial_mode"});
      if(!["asaas","mercado_pago","generic"].includes(provider))return json(res,400,{error:"invalid_provider"});
      internalLab.operatorConfig={...internalLab.operatorConfig,financial_mode:mode,selected_provider:provider,real_execution_state:"locked",updated_at:new Date().toISOString(),updated_by:u.username};
      saveInternalLab();labLedger({type:"operator_mode_changed",username:u.username,financial_mode:mode,selected_provider:provider});
      return json(res,200,{ok:true,operator:operatorConfig()});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/operator/provider"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});if(u.role!=="dono")return json(res,403,{error:"owner_required"});
      const v=await body(req),provider=String(v.provider||"").toLowerCase();
      if(!["asaas","mercado_pago","generic"].includes(provider))return json(res,400,{error:"invalid_provider"});
      try{const out=financeVault("save",v);labLedger({type:"provider_vault_updated",username:u.username,provider,environment:String(v.environment||"")});return json(res,200,out)}
      catch{return json(res,500,{error:"provider_vault_failed"})}
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/operator/provider/delete"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});if(u.role!=="dono")return json(res,403,{error:"owner_required"});
      const v=await body(req),provider=String(v.provider||"").toLowerCase();
      try{const out=financeVault("delete",{provider});labLedger({type:"provider_vault_removed",username:u.username,provider});return json(res,200,out)}
      catch{return json(res,500,{error:"provider_vault_failed"})}
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/users"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      return json(res,200,{users:Object.values(internalLab.users).map(internalUserSafe)});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/users"){
      const actor=internalAuth(req);if(!actor)return json(res,401,{error:"lab_auth_required"});
      const v=await body(req),username=String(v.username||"").trim().toLowerCase(),name=cleanText(v.name||username,80),role=String(v.role||"tester").toLowerCase(),pin=String(v.pin||"");
      if(!/^[a-z0-9._-]{3,40}$/.test(username)||!/^[0-9]{6,12}$/.test(pin))return json(res,400,{error:"invalid_user_data"});
      if(internalLab.users[username])return json(res,409,{error:"username_exists"});
      if(!canCreateRole(actor,role))return json(res,403,{error:"role_not_allowed"});
      const salt=crypto.randomBytes(16).toString("hex"),u={username,name,role,pinSalt:salt,pinHash:pinHash(pin,salt),createdAt:new Date().toISOString(),demoSessionId:""};
      internalLab.users[username]=u;ensureInternalDemoSession(u);labLedger({type:"user_created",actor:actor.username,username,role});return json(res,201,{user:internalUserSafe(u)});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/wallet/credit"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});const v=await body(req),amount=safeMoney(v.amount,1,100000);
      if(amount===null)return json(res,400,{error:"invalid_amount"});const ss=ensureInternalDemoSession(u);
      ss.balance=Math.round((ss.balance+amount)*100)/100;persistSession(ss,"owner_lab_credit");internalLab.treasury=Math.round((Number(internalLab.treasury)-amount)*100)/100;
      const entry=labLedger({type:"test_credit",username:u.username,amount,source:"laboratory_treasury",balanceAfter:ss.balance,treasuryAfter:internalLab.treasury});
      return json(res,200,{ok:true,entry,state:state(ss),treasury:internalLab.treasury});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/wallet/withdraw"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});const v=await body(req),amount=safeMoney(v.amount,1,100000);
      if(amount===null)return json(res,400,{error:"invalid_amount"});const ss=ensureInternalDemoSession(u);if(ss.balance<amount)return json(res,400,{error:"insufficient_test_balance"});
      ss.balance=Math.round((ss.balance-amount)*100)/100;persistSession(ss,"owner_lab_withdraw");internalLab.treasury=Math.round((Number(internalLab.treasury)+amount)*100)/100;
      const entry=labLedger({type:"test_withdrawal",username:u.username,amount,destination:"laboratory_treasury",balanceAfter:ss.balance,treasuryAfter:internalLab.treasury,status:"completed"});
      return json(res,200,{ok:true,entry,state:state(ss),treasury:internalLab.treasury});
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/ledger"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      const rows=u.role==="dono"||u.role==="socio"?internalLab.ledger:internalLab.ledger.filter(x=>x.username===u.username||x.actor===u.username);
      return json(res,200,{records:rows.slice(-200).reverse(),treasury:internalLab.treasury});
    }
    if(req.method==="GET"&&url.pathname==="/api/casino/providers"){
      const x=casinoAdapters(),ready=new Map(aggregatorReadiness().map(a=>[a.id,a]));return json(res,200,{version:x.version,policy:x.policy,contract:x.contract,aggregators:(x.aggregators||[]).map(p=>({id:p.id,name:p.name,commercial_status:p.commercial_status,technical_status:ready.get(p.id)?.technical_status||p.technical_status,supports_demo:!!p.supports_demo,supports_real:!!p.supports_real,priority:p.priority,adapter:p.adapter,configured:!!ready.get(p.id)?.configured,environment:ready.get(p.id)?.environment||"not_configured",notes:p.notes||""})),providers:(x.providers||[]).map(p=>({id:p.id,name:p.name,commercial_status:p.commercial_status,technical_status:p.technical_status,targets:p.targets,adapter:p.adapter}))});
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/casino/readiness"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});return json(res,200,{aggregators:aggregatorReadiness(),hub88:{...hub88Config(),operator_id_set:hub88Config().operator_id_set,private_key_set:hub88Config().private_key_set,public_key_set:hub88Config().public_key_set,sub_partner_id_set:hub88Config().sub_partner_id_set},real_execution:operatorConfig()});
    }
    if(req.method==="GET"&&url.pathname==="/api/casino/catalog"){
      const provider=String(url.searchParams.get("provider")||"");const p=casinoProvider(provider);
      if(!p)return json(res,404,{error:"provider_not_found"});
      if(!["ready_for_homologation","live"].includes(String(p.technical_status)))return json(res,503,{error:"provider_not_configured",provider,technical_status:p.technical_status,games:[]});
      return json(res,200,{provider,games:[],note:"catalog_adapter_ready_but_no_provider_credentials_loaded"});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/casino/launch"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      const v=await body(req),provider=String(v.provider||""),gameId=String(v.game_id||""),p=casinoProvider(provider);
      if(!p)return json(res,404,{error:"provider_not_found"});
      if(!gameId)return json(res,400,{error:"game_id_required"});
      if(!["ready_for_homologation","live"].includes(String(p.technical_status)))return json(res,503,{error:"provider_not_configured",provider,technical_status:p.technical_status});
      return json(res,503,{error:"provider_launch_adapter_not_bound",provider});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/sports/bet"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      const v=await body(req),mode=String(v.mode||"multiple")==="single"?"single":"multiple",stake=safeMoney(v.stake,1,1000),raw=Array.isArray(v.selections)?v.selections:[];
      if(stake===null||!raw.length||raw.length>12)return json(res,400,{error:"invalid_sports_bet"});
      let selections;try{selections=await validateSportsSelections(raw)}catch(e){return json(res,409,{error:String(e.message||"sports_validation_failed")})}
      const ss=ensureInternalDemoSession(u),totalStake=mode==="single"?Math.round(stake*selections.length*100)/100:stake;
      if(ss.balance<totalStake)return json(res,400,{error:"insufficient_test_balance"});
      ss.balance=Math.round((ss.balance-totalStake)*100)/100;persistSession(ss,"sports_bet_placed");internalLab.treasury=Math.round((Number(internalLab.treasury)+totalStake)*100)/100;
      const created=[];
      if(mode==="single"){
        for(const leg of selections){const t={id:crypto.randomUUID(),username:u.username,mode:"single",stake,combined_odds:leg.price,selections:[leg],status:"PENDING",payout:0,created_at:new Date().toISOString()};internalLab.sportsTickets.push(t);created.push(t)}
      }else{
        const odds=Math.round(selections.reduce((a,x)=>a*Number(x.price),1)*1000000)/1000000,t={id:crypto.randomUUID(),username:u.username,mode:"multiple",stake,combined_odds:odds,selections,status:"PENDING",payout:0,created_at:new Date().toISOString()};internalLab.sportsTickets.push(t);created.push(t);
      }
      labLedger({type:"sports_bet_placed",username:u.username,mode,total_stake:totalStake,tickets:created.map(x=>x.id),balanceAfter:ss.balance,treasuryAfter:internalLab.treasury});saveInternalLab();
      return json(res,201,{ok:true,tickets:created,state:state(ss),treasury:internalLab.treasury});
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/sports/tickets"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      await settleSportsTickets(u.username);const rows=internalLab.sportsTickets.filter(t=>t.username===u.username).slice(-100).reverse();
      return json(res,200,{tickets:rows,treasury:internalLab.treasury});
    }
    if(req.method==="POST"&&url.pathname==="/api/internal/sports/settle"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      const rows=await settleSportsTickets(u.username),ss=ensureInternalDemoSession(u);return json(res,200,{settled:rows,state:state(ss),treasury:internalLab.treasury});
    }
    if(req.method==="GET"&&url.pathname==="/api/internal/reference/sportsbook"){
      const u=internalAuth(req);if(!u)return json(res,401,{error:"lab_auth_required"});
      const scope=String(url.searchParams.get("scope")||"football").toLowerCase();
      try{return json(res,200,await fetchReferenceSportsbook(scope))}catch{return json(res,502,{error:"reference_feed_unavailable",scope})}
    }
    if(req.method==="GET"&&url.pathname==="/api/sports/odds"){
      const scope=String(url.searchParams.get("scope")||"football").toLowerCase();
      return json(res,200,await fetchOddsScope(scope));
    }
    if(req.method==="POST"&&url.pathname==="/api/telemetry/event"){
      if(!telemetryAllowed(req))return json(res,429,{error:"telemetry_rate_limited"});
      const v=await body(req);appendTelemetry(v);return json(res,202,{ok:true});
    }
    if(req.method==="GET"&&url.pathname==="/api/telemetry/summary"){
      const days=Number(url.searchParams.get("days")||7);return json(res,200,telemetrySummary(days));
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/session"){
      const id=crypto.randomUUID(),serverSeed=newServerSeed(),clientSeed=newClientSeed();
      const s={id,balance:1000,points:0,rounds:0,createdAt:new Date().toISOString(),serverSeed,serverSeedHash:sha256(serverSeed),clientSeed,nonce:0,revealed:[]};
      sessions.set(id,s);persistSession(s,"created");
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
      s.clientSeed=seed;s.nonce=0;persistSession(s,"client_seed_changed");
      const auditHash=audit({at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",type:"CLIENT_SEED_CHANGED",clientSeed:seed,serverSeedHash:s.serverSeedHash});
      return json(res,200,{auditHash,...state(s)});
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/rotate-seed"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      const revealed={serverSeed:s.serverSeed,serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,finalNonce:s.nonce,revealedAt:new Date().toISOString()};
      s.revealed.push(revealed);s.serverSeed=newServerSeed();s.serverSeedHash=sha256(s.serverSeed);s.nonce=0;persistSession(s,"server_seed_rotated");
      const auditHash=audit({at:new Date().toISOString(),session:s.id,mode:"DEMO_ONLY",type:"SERVER_SEED_ROTATED",revealed,newServerSeedHash:s.serverSeedHash});
      return json(res,200,{auditHash,revealed,current:{serverSeedHash:s.serverSeedHash,clientSeed:s.clientSeed,nonce:s.nonce}});
    }
    if(req.method==="POST"&&url.pathname==="/api/lab/reset"){
      const s=session(req);if(!s)return json(res,401,{error:"demo_session_required"});
      s.balance=1000;s.points=0;s.rounds=0;persistSession(s,"reset");
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
        const o=tiger(fair.u),grid=tigerGrid(o,fair),set=settle(s,stake,o.m,{game,outcome:{grid,multiplier:o.m,symbol:o.symbol||""}},fair);
        return json(res,200,{game,grid,symbols:grid,multiplier:o.m,target_rtp:0.9681,...set});
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