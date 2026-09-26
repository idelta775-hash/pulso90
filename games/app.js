(()=>{
const KEY="pulso90-demo-session-v2";
let sessionId=localStorage.getItem(KEY)||"";
let API_BASE="";
async function loadRuntime(){try{const r=await fetch("../runtime-config.json",{cache:"no-store"});if(r.ok){const c=await r.json();API_BASE=String(c.rgs_base||"").replace(/\/$/,"")}}catch{API_BASE=""}}
function api(path){return API_BASE?API_BASE+path:".."+path}
const $=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
function headers(){return {"content-type":"application/json","x-demo-session":sessionId}}
function update(s){$("balance").textContent=fmt(s.balance);$("points").textContent=String(s.points);$("rounds").textContent=String(s.rounds);$("tier").textContent=s.tier||"EXPLORER"}
function show(el,data,label){
  const net=Number(data.net||0);
  el.className="result "+(net>0?"win":net<0?"lose":"");
  el.textContent=label+" · "+(net>=0?"+":"")+fmt(net)+" créditos demo · audit "+String(data.auditHash||"").slice(0,10);
  update(data);
}
async function createSession(){
  const r=await fetch(api("/api/lab/session"),{method:"POST"});
  const d=await r.json();if(!r.ok)throw new Error(d.error||"session_error");
  sessionId=d.sessionId;localStorage.setItem(KEY,sessionId);update(d);
}
async function ensureSession(){
  if(!sessionId)return createSession();
  const r=await fetch(api("/api/lab/state"),{headers:{"x-demo-session":sessionId}});
  if(r.status===401){sessionId="";localStorage.removeItem(KEY);return createSession()}
  const d=await r.json();if(!r.ok)throw new Error(d.error||"state_error");update(d);
}
async function play(payload){
  let r=await fetch(api("/api/lab/play"),{method:"POST",headers:headers(),body:JSON.stringify(payload)});
  if(r.status===401){await createSession();r=await fetch(api("/api/lab/play"),{method:"POST",headers:headers(),body:JSON.stringify(payload)})}
  const d=await r.json();if(!r.ok)throw new Error(d.error||"play_error");return d;
}
function err(el,e){el.className="result lose";el.textContent=String(e.message||e)}

$("tigerPlay").addEventListener("click",async()=>{
  const el=$("tigerResult");
  try{
    const stake=Math.max(1,Math.min(100,Number($("tigerBet").value)||10));
    const d=await play({game:"pulso-tiger",stake});
    ["t1","t2","t3"].forEach((id,i)=>$(id).textContent=d.symbols[i]);
    show(el,d,d.multiplier===0?"Sem prêmio":Number(d.multiplier).toLocaleString("pt-BR")+"×");
  }catch(e){err(el,e)}
});

$("crashPlay").addEventListener("click",async()=>{
  const el=$("crashResult");
  try{
    const target=Math.max(1.10,Math.min(20,Number($("cashTarget").value)||2));
    const d=await play({game:"pulso-launch",stake:10,target});
    $("crashPoint").textContent=Number(d.crashPoint).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"×";
    show(el,d,d.won?"Alvo "+target.toFixed(2)+"× atingido":"Crash antes de "+target.toFixed(2)+"×");
  }catch(e){err(el,e)}
});

$("duelPlay").addEventListener("click",async()=>{
  const el=$("duelResult");
  try{
    const pick=$("duelPick").value;
    const d=await play({game:"pulso-goal-duel",stake:10,pick});
    $("duelOutcome").textContent=d.resultLabel;
    show(el,d,d.won?"Palpite correto · "+Number(d.multiplier).toFixed(2)+"×":"Resultado "+d.resultLabel);
  }catch(e){err(el,e)}
});

$("resetLab").addEventListener("click",async()=>{
  try{
    const r=await fetch(api("/api/lab/reset"),{method:"POST",headers:headers()});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"reset_error");
    update(d);["tigerResult","crashResult","duelResult"].forEach(id=>$(id).textContent="");
  }catch(e){err($("tigerResult"),e)}
});

loadRuntime().then(ensureSession).catch(e=>err($("tigerResult"),e));
})();