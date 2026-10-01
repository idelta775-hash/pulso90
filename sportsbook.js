const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
const FAVORITES_KEY="pulso90-sports-favorites-v1",SLIP_KEY="pulso90-sports-slip-v1",STAKE_KEY="pulso90-sports-stake-v1",SLIP_MODE_KEY="pulso90-sports-slip-mode-v1",LAB_TOKEN_KEY="pulso90-owner-lab-token-v1";
let sport="football",view="all",matches=[],favorites=new Set(),oddsEvents=[],slip=[],runtimeBase="",slipMode=localStorage.getItem(SLIP_MODE_KEY)||"multiple";
try{favorites=new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]"))}catch{}
try{slip=JSON.parse(localStorage.getItem(SLIP_KEY)||"[]");if(!Array.isArray(slip))slip=[]}catch{slip=[]}
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|ac|sc|club|clube|deportivo|sporting)\b/g,"").replace(/[^a-z0-9]+/g," ").trim();
function idOf(m){return btoa(unescape(encodeURIComponent([sport,m.competition,m.home,m.away,m.time].join("|")))).replace(/=+$/,"")}
function saveFav(){localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]))}
function saveSlip(){localStorage.setItem(SLIP_KEY,JSON.stringify(slip))}
function statusClass(s){s=String(s||"").toLowerCase();return s==="live"?"live":s==="finished"?"finished":""}
function statusLabel(m){const s=String(m.status||"").toLowerCase();if(s==="live")return "● AO VIVO";if(s==="finished")return "ENCERRADO";return (m.status_text||s||"AGENDADO").toUpperCase()}
function when(t){try{return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(t))}catch{return t||""}}
function normalized(m){return {...m,_id:idOf(m),home_score:m.home_score??"–",away_score:m.away_score??"–"}}
function visible(){return matches.filter(m=>view==="all"||view==="favorite"?view!=="favorite"||favorites.has(m._id):String(m.status||"").toLowerCase()===view)}
function findOdds(m){
 const h=norm(m.home),a=norm(m.away),mt=Date.parse(m.time||0);
 return oddsEvents.find(o=>{
   const oh=norm(o.home_team),oa=norm(o.away_team),ot=Date.parse(o.start_time||0);
   const names=(h===oh&&a===oa)||(h===oa&&a===oh);
   const timeOk=!Number.isFinite(mt)||!Number.isFinite(ot)||Math.abs(mt-ot)<6*3600000;
   return names&&timeOk
 })||null
}
function outcomeLabel(o,event){
 const n=norm(o.name),h=norm(event.home_team),a=norm(event.away_team);
 if(n===h)return "1";if(n===a)return "2";return "X"
}
function marketsHtml(m){
 if(String(m.status||"").toLowerCase()==="finished")return '<span class="state finished">ENCERRADO</span>';
 const o=findOdds(m);if(!o||!o.outcomes?.length)return '<span class="state '+statusClass(m.status)+'">'+esc(statusLabel(m))+'</span>';
 const sorted=[...o.outcomes].sort((x,y)=>{const lx=outcomeLabel(x,o),ly=outcomeLabel(y,o);return ["1","X","2"].indexOf(lx)-["1","X","2"].indexOf(ly)});
 return '<div class="markets">'+sorted.slice(0,3).map(x=>'<button class="odd-btn" data-odd-event="'+esc(o.event_id)+'" data-odd-name="'+esc(encodeURIComponent(x.name))+'"><span>'+outcomeLabel(x,o)+'</span><b>'+Number(x.price).toFixed(2)+'</b></button>').join("")+'</div>'
}
function render(){
 const arr=visible();
 if(!arr.length){$("events").innerHTML='<div class="panel" style="padding:18px">Nenhuma partida nesta visualização agora.</div>';renderWatch();renderSlip();return}
 const groups={};for(const m of arr)(groups[m.competition||"Outros"]??=[]).push(m);
 $("events").innerHTML=Object.entries(groups).map(([league,items])=>'<section class="league"><div class="league-head">'+(items[0].competition_logo?'<img src="'+esc(items[0].competition_logo)+'" alt="">':'')+'<b>'+esc(league)+'</b></div>'+items.map(eventHtml).join("")+'</section>').join("");
 $$("[data-fav-event]").forEach(b=>b.onclick=()=>toggleFav(b.dataset.favEvent));
 $$("[data-open-event]").forEach(b=>b.onclick=()=>openMatch(b.dataset.openEvent));
 $$("[data-odd-event]").forEach(b=>b.onclick=()=>addOdd(b.dataset.oddEvent,decodeURIComponent(b.dataset.oddName)));
 renderWatch();renderSlip()
}
function eventHtml(m){
 const fav=favorites.has(m._id);
 return '<article class="event"><button class="fav '+(fav?"on":"")+'" data-fav-event="'+m._id+'" aria-label="Favoritar">'+(fav?"★":"☆")+'</button><div class="teams"><span class="team">'+(m.home_logo?'<img src="'+esc(m.home_logo)+'" alt="">':'')+esc(m.home)+'</span><span class="score">'+esc(m.home_score)+'</span><span class="team">'+(m.away_logo?'<img src="'+esc(m.away_logo)+'" alt="">':'')+esc(m.away)+'</span><span class="score">'+esc(m.away_score)+'</span><span class="meta">'+esc(when(m.time))+' · '+esc(statusLabel(m))+'</span><span></span></div>'+marketsHtml(m)+'<button class="open" data-open-event="'+m._id+'">Detalhes</button></article>'
}
function toggleFav(id){favorites.has(id)?favorites.delete(id):favorites.add(id);saveFav();render()}
function renderWatch(){
 const favs=matches.filter(m=>favorites.has(m._id));
 $("watch").innerHTML=favs.length?'<h3 style="border:0;padding:6px 0;font-size:9px">Acompanhando</h3>'+favs.map(m=>'<div class="watch-item"><b>'+esc(m.home)+' × '+esc(m.away)+'</b><small>'+esc(m.competition||"")+' · '+esc(statusLabel(m))+'</small><button data-remove-watch="'+m._id+'">Remover</button></div>').join(""):'';
 $$("[data-remove-watch]").forEach(b=>b.onclick=()=>toggleFav(b.dataset.removeWatch))
}
function addOdd(eventId,name){
 const e=oddsEvents.find(x=>x.event_id===eventId);if(!e)return;
 const o=e.outcomes.find(x=>x.name===name);if(!o)return;
 const key=eventId+":"+name;
 const item={key,event_id:eventId,home:e.home_team,away:e.away_team,selection:name,price:Number(o.price),book:o.book||"",start_time:e.start_time};
 const i=slip.findIndex(x=>x.event_id===eventId);if(i>=0)slip[i]=item;else slip.push(item);
 slip=slip.slice(-12);saveSlip();renderSlip()
}
function renderSlip(){
 const empty=document.querySelector(".slip-empty"),note=document.querySelector(".slip-note");
 let host=$("slipSelections");if(!host){host=document.createElement("div");host.id="slipSelections";note.before(host)}
 if(!slip.length){empty.style.display="block";host.innerHTML="";return}
 empty.style.display="none";
 const combined=slip.reduce((a,x)=>a*Number(x.price||1),1),stake=Math.max(0,Number(localStorage.getItem(STAKE_KEY)||10)||0),singleReturn=slip.reduce((a,x)=>a+stake*Number(x.price||1),0),singleStake=stake*slip.length;
 const summary=slipMode==="single"?'<b><span>Aposta total</span><span>'+singleStake.toFixed(2)+'</span></b><b><span>Retorno potencial DEMO</span><span id="slipReturn">'+singleReturn.toFixed(2)+'</span></b>':'<b><span>Odd combinada</span><span>'+combined.toFixed(2)+'</span></b><b><span>Retorno potencial DEMO</span><span id="slipReturn">'+(stake*combined).toFixed(2)+'</span></b>';
 host.innerHTML=slip.map(x=>'<div class="slip-item"><b>'+esc(x.home)+' × '+esc(x.away)+'</b><small>'+esc(x.selection)+' · <span class="price">'+Number(x.price).toFixed(2)+'</span></small><button data-slip-remove="'+esc(x.key)+'">Remover</button></div>').join("")+'<div class="slip-total"><label>'+(slipMode==="single"?"Créditos DEMO por seleção":"Créditos DEMO")+'</label><input id="slipStake" type="number" min="0" max="1000" step="1" value="'+stake+'">'+summary+'</div>';
 $$("[data-slip-remove]").forEach(b=>b.onclick=()=>{slip=slip.filter(x=>x.key!==b.dataset.slipRemove);saveSlip();renderSlip()});
 const inp=$("slipStake");if(inp)inp.oninput=()=>{const v=Math.max(0,Number(inp.value)||0);localStorage.setItem(STAKE_KEY,String(v));$("slipReturn").textContent=(slipMode==="single"?slip.reduce((a,x)=>a+v*Number(x.price||1),0):v*combined).toFixed(2)}
}
async function getRuntime(){
 if(runtimeBase)return runtimeBase;
 try{const r=await fetch("runtime-config.json",{cache:"no-store"});const c=await r.json();runtimeBase=String(c.rgs_base||"").replace(/\/$/,"")}catch{}
 return runtimeBase
}
async function loadOdds(){
 oddsEvents=[];const base=await getRuntime();if(!base)return;
 try{const r=await fetch(base+"/api/sports/odds?scope="+encodeURIComponent(sport),{cache:"no-store"});const x=await r.json();if(r.ok&&x.available&&Array.isArray(x.events))oddsEvents=x.events}catch{}
}
async function load(){
 $("events").innerHTML='<div class="panel" style="padding:18px">Atualizando partidas…</div>';
 const base=await getRuntime(),labToken=localStorage.getItem(LAB_TOKEN_KEY)||"";
 if(base&&labToken&&["football","combat","futsal","snooker"].includes(sport)){
  try{const r=await fetch(base+"/api/internal/reference/sportsbook?scope="+encodeURIComponent(sport),{cache:"no-store",headers:{"x-lab-token":labToken}}),x=await r.json();if(r.ok&&x.available){matches=(x.matches||[]).map(normalized);oddsEvents=x.events||[];render();return}}catch{}
 }
 try{
  const [sports]=await Promise.all([fetch("https://sportscore.com/api/widget/matches/?sport="+encodeURIComponent(sport)+"&limit=50&src=pulso90",{cache:"no-store"}),loadOdds()]);
  const raw=await sports.json();if(!sports.ok)throw new Error("feed");
  matches=(Array.isArray(raw.matches)?raw.matches:[]).map(normalized);render()
 }catch{$("events").innerHTML='<div class="panel" style="padding:18px">Não foi possível atualizar as partidas agora. Tente novamente em instantes.</div>';renderSlip()}
}
function slugFrom(m){const u=String(m.url||"");const p=u.split("/").filter(Boolean);return p[p.length-1]||""}
async function openMatch(id){
 const m=matches.find(x=>x._id===id);if(!m)return;
 $("detailLeague").textContent=m.competition||"";$("detailHome").textContent=m.home||"";$("detailAway").textContent=m.away||"";
 $("detailHomeLogo").src=m.home_logo||"";$("detailAwayLogo").src=m.away_logo||"";$("detailScore").textContent=(m.home_score??"–")+" : "+(m.away_score??"–");
 $("detailMeta").textContent=statusLabel(m)+" · "+when(m.time);$("detailExtra").innerHTML='<p class="meta">Carregando detalhes da partida…</p>';$("detail").classList.add("open");
 const slug=slugFrom(m);if(!slug)return;
 try{const r=await fetch("https://sportscore.com/api/widget/match/?sport="+encodeURIComponent(sport)+"&slug="+encodeURIComponent(slug)+"&src=pulso90",{cache:"no-store"});const x=await r.json();if(!r.ok)throw new Error();const obj=x.match||x,extra=[];if(obj.venue)extra.push("<b>Local:</b> "+esc(obj.venue));if(obj.round)extra.push("<b>Rodada:</b> "+esc(obj.round));if(obj.referee)extra.push("<b>Árbitro:</b> "+esc(obj.referee));if(obj.timeline&&Array.isArray(obj.timeline))extra.push("<b>Lances:</b> "+obj.timeline.length);$("detailExtra").innerHTML=extra.length?'<p class="meta">'+extra.join("<br>")+'</p>':'<p class="meta">Detalhes atualizados da partida.</p>'}catch{$("detailExtra").innerHTML='<p class="meta">Detalhes adicionais indisponíveis por alguns instantes.</p>'}
}
$$("[data-sport]").forEach(b=>b.onclick=()=>{sport=b.dataset.sport;oddsEvents=[];$$("[data-sport]").forEach(x=>x.classList.toggle("active",x===b));load()});
$$("[data-slip-mode]").forEach(b=>{b.classList.toggle("active",b.dataset.slipMode===slipMode);b.onclick=()=>{slipMode=b.dataset.slipMode;localStorage.setItem(SLIP_MODE_KEY,slipMode);$$("[data-slip-mode]").forEach(x=>x.classList.toggle("active",x.dataset.slipMode===slipMode));renderSlip()}});
$$("[data-view]").forEach(b=>b.onclick=()=>{view=b.dataset.view;$$("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));render()});
$("detailClose").onclick=()=>$("detail").classList.remove("open");$("detail").onclick=e=>{if(e.target===$("detail"))$("detail").classList.remove("open")};document.addEventListener("keydown",e=>{if(e.key==="Escape")$("detail").classList.remove("open")});
renderSlip();load();setInterval(load,60000);