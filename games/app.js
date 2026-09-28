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
  el.textContent=label+" · "+(net>=0?"+":"")+fmt(net)+" créditos";
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
function friendlyError(code){const m={demo_balance_insufficient:"Créditos insuficientes para esta jogada.",invalid_demo_stake:"Escolha um valor válido.",invalid_pick:"Escolha Casa, Empate ou Fora.",invalid_target:"Escolha um alvo entre 1,10× e 20×.",game_not_found:"Este jogo não está disponível agora.",session_error:"Não foi possível iniciar sua sessão.",state_error:"Não foi possível recuperar sua sessão.",play_error:"A rodada não pôde ser concluída.",reset_error:"Não foi possível recomeçar agora."};return m[String(code)]||"Algo não saiu como esperado. Tente novamente."}
function err(el,e){el.className="result lose";el.textContent=friendlyError(e&&e.message||e)}

$("tigerPlay").addEventListener("click",async()=>{
  const el=$("tigerResult");
  try{
    const stake=Number($("tigerBet").value);if(!Number.isFinite(stake)||stake<1||stake>100)throw new Error("invalid_demo_stake");
    const d=await play({game:"pulso-tiger",stake});
    ["t1","t2","t3"].forEach((id,i)=>$(id).textContent=d.symbols[i]);
    show(el,d,d.multiplier===0?"Sem prêmio":Number(d.multiplier).toLocaleString("pt-BR")+"×");
  }catch(e){err(el,e)}
});

$("crashPlay").addEventListener("click",async()=>{
  const el=$("crashResult");
  try{
    const stake=Number($("crashBet").value);if(!Number.isFinite(stake)||stake<1||stake>100)throw new Error("invalid_demo_stake");
    const target=Number($("cashTarget").value);if(!Number.isFinite(target)||target<1.10||target>20)throw new Error("invalid_target");
    const d=await play({game:"pulso-launch",stake,target});
    $("crashPoint").textContent=Number(d.crashPoint).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"×";
    show(el,d,d.won?"Alvo "+target.toFixed(2)+"× atingido":"Crash antes de "+target.toFixed(2)+"×");
  }catch(e){err(el,e)}
});

$("duelPlay").addEventListener("click",async()=>{
  const el=$("duelResult");
  try{
    const stake=Number($("duelBet").value);if(!Number.isFinite(stake)||stake<1||stake>100)throw new Error("invalid_demo_stake");
    const pick=$("duelPick").value;
    const d=await play({game:"pulso-goal-duel",stake,pick});
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