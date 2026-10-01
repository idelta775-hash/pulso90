const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
const FAVORITES_KEY="pulso90-sports-favorites-v1";
let sport="football",view="all",matches=[],favorites=new Set();
try{favorites=new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]"))}catch{}
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function idOf(m){return btoa(unescape(encodeURIComponent([sport,m.competition,m.home,m.away,m.time].join("|")))).replace(/=+$/,"")}
function saveFav(){localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]))}
function statusClass(s){s=String(s||"").toLowerCase();return s==="live"?"live":s==="finished"?"finished":""}
function statusLabel(m){const s=String(m.status||"").toLowerCase();if(s==="live")return "● AO VIVO";if(s==="finished")return "ENCERRADO";return (m.status_text||s||"AGENDADO").toUpperCase()}
function when(t){try{return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(t))}catch{return t||""}}
function normalized(m){return {...m,_id:idOf(m),home_score:m.home_score??"–",away_score:m.away_score??"–"}}
function visible(){
 return matches.filter(m=>view==="all"||view==="favorite"?view!=="favorite"||favorites.has(m._id):String(m.status||"").toLowerCase()===view)
}
function render(){
 const arr=visible();
 if(!arr.length){$("events").innerHTML='<div class="panel" style="padding:18px">Nenhuma partida nesta visualização agora.</div>';renderWatch();return}
 const groups={};for(const m of arr)(groups[m.competition||"Outros"]??=[]).push(m);
 $("events").innerHTML=Object.entries(groups).map(([league,items])=>'<section class="league"><div class="league-head">'+(items[0].competition_logo?'<img src="'+esc(items[0].competition_logo)+'" alt="">':'')+'<b>'+esc(league)+'</b></div>'+items.map(eventHtml).join("")+'</section>').join("");
 $$("[data-fav-event]").forEach(b=>b.onclick=()=>toggleFav(b.dataset.favEvent));
 $$("[data-open-event]").forEach(b=>b.onclick=()=>openMatch(b.dataset.openEvent));
 renderWatch()
}
function eventHtml(m){
 const fav=favorites.has(m._id);
 return '<article class="event"><button class="fav '+(fav?"on":"")+'" data-fav-event="'+m._id+'" aria-label="Favoritar">'+(fav?"★":"☆")+'</button><div class="teams"><span class="team">'+(m.home_logo?'<img src="'+esc(m.home_logo)+'" alt="">':'')+esc(m.home)+'</span><span class="score">'+esc(m.home_score)+'</span><span class="team">'+(m.away_logo?'<img src="'+esc(m.away_logo)+'" alt="">':'')+esc(m.away)+'</span><span class="score">'+esc(m.away_score)+'</span><span class="meta">'+esc(when(m.time))+'</span><span></span></div><span class="state '+statusClass(m.status)+'">'+esc(statusLabel(m))+'</span><button class="open" data-open-event="'+m._id+'">Detalhes</button></article>'
}
function toggleFav(id){favorites.has(id)?favorites.delete(id):favorites.add(id);saveFav();render()}
function renderWatch(){
 const favs=matches.filter(m=>favorites.has(m._id));
 $("watch").innerHTML=favs.length?favs.map(m=>'<div class="watch-item"><b>'+esc(m.home)+' × '+esc(m.away)+'</b><small>'+esc(m.competition||"")+' · '+esc(statusLabel(m))+'</small><button data-remove-watch="'+m._id+'">Remover</button></div>').join(""):'';
 $$("[data-remove-watch]").forEach(b=>b.onclick=()=>toggleFav(b.dataset.removeWatch))
}
async function load(){
 $("events").innerHTML='<div class="panel" style="padding:18px">Atualizando partidas…</div>';
 try{
  const r=await fetch("https://sportscore.com/api/widget/matches/?sport="+encodeURIComponent(sport)+"&limit=50&src=pulso90",{cache:"no-store"});
  const raw=await r.json();if(!r.ok)throw new Error("feed");
  matches=(Array.isArray(raw.matches)?raw.matches:[]).map(normalized);
  render()
 }catch{$("events").innerHTML='<div class="panel" style="padding:18px">Não foi possível atualizar as partidas agora. Tente novamente em instantes.</div>'}
}
function slugFrom(m){const u=String(m.url||"");const p=u.split("/").filter(Boolean);return p[p.length-1]||""}
async function openMatch(id){
 const m=matches.find(x=>x._id===id);if(!m)return;
 $("detailLeague").textContent=m.competition||"";
 $("detailHome").textContent=m.home||"";$("detailAway").textContent=m.away||"";
 $("detailHomeLogo").src=m.home_logo||"";$("detailAwayLogo").src=m.away_logo||"";
 $("detailScore").textContent=(m.home_score??"–")+" : "+(m.away_score??"–");
 $("detailMeta").textContent=statusLabel(m)+" · "+when(m.time);
 $("detailExtra").innerHTML='<p class="meta">Carregando detalhes da partida…</p>';
 $("detail").classList.add("open");
 const slug=slugFrom(m);if(!slug)return;
 try{
   const r=await fetch("https://sportscore.com/api/widget/match/?sport="+encodeURIComponent(sport)+"&slug="+encodeURIComponent(slug)+"&src=pulso90",{cache:"no-store"});
   const x=await r.json();if(!r.ok)throw new Error();
   const obj=x.match||x;
   const extra=[];
   if(obj.venue)extra.push("<b>Local:</b> "+esc(obj.venue));
   if(obj.round)extra.push("<b>Rodada:</b> "+esc(obj.round));
   if(obj.referee)extra.push("<b>Árbitro:</b> "+esc(obj.referee));
   if(obj.timeline&&Array.isArray(obj.timeline))extra.push("<b>Lances:</b> "+obj.timeline.length);
   $("detailExtra").innerHTML=extra.length?'<p class="meta">'+extra.join("<br>")+'</p>':'<p class="meta">Detalhes atualizados da partida.</p>'
 }catch{$("detailExtra").innerHTML='<p class="meta">Detalhes adicionais indisponíveis por alguns instantes.</p>'}
}
$$("[data-sport]").forEach(b=>b.onclick=()=>{sport=b.dataset.sport;$$("[data-sport]").forEach(x=>x.classList.toggle("active",x===b));load()});
$$("[data-view]").forEach(b=>b.onclick=()=>{view=b.dataset.view;$$("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));render()});
$("detailClose").onclick=()=>$("detail").classList.remove("open");
$("detail").onclick=e=>{if(e.target===$("detail"))$("detail").classList.remove("open")};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("detail").classList.remove("open")});
load();setInterval(load,60000);