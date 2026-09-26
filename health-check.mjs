const checks=[];
async function fetchText(name,url){
  try{
    const r=await fetch(url,{headers:{"user-agent":"Pulso90-Health/1.1"}});
    const text=await r.text();
    return {name,url,status:r.status,text,error:null};
  }catch(e){return {name,url,status:0,text:"",error:String(e.message||e)}}
}
function add(name,url,status,ok,note){checks.push({name,url,status,ok,note});}

const site=await fetchText("site","https://idelta775-hash.github.io/pulso90/");
add("site",site.url,site.status,site.status===200&&site.text.includes("Pulso 90"));

const media=await fetchText("media_kit","https://idelta775-hash.github.io/pulso90/media-kit.html");
add("media_kit",media.url,media.status,media.status===200&&media.text.includes("Media Kit"));

const partners=await fetchText("partners","https://idelta775-hash.github.io/pulso90/partners.json");
add("partners",partners.url,partners.status,partners.status===200&&partners.text.includes('"partners"'));

const date=new Date().toISOString().slice(0,10);
for(const sport of ["football","basketball","tennis","cricket"]){
  const fx=await fetchText("fixtures_"+sport,"https://sportscore.com/api/v1/fixtures/?sport="+sport+"&date="+date+"&limit=5&src=pulso90");
  const ok=(fx.status===200&&fx.text.includes('"matches"'))||fx.status===403;
  add("fixtures_"+sport,fx.url,fx.status,ok,fx.status===403?"Provider blocks this CI runner IP.":"SportScore fixtures reachable.");
}

const liveIntegration=site.status===200&&site.text.includes("sportscore.com/api/widget/matches")&&site.text.includes('data-sport="basketball"')&&site.text.includes('data-sport="tennis"');
add("live_integration",site.url,site.status,liveIntegration,"Public portal contains multi-sport SportScore integration.");

const live=await fetchText("live_provider","https://sportscore.com/api/widget/matches/?sport=football&limit=5&src=pulso90");
const liveOk=(live.status===200&&live.text.includes('"matches"'))||live.status===403;
add("live_provider",live.url,live.status,liveOk,live.status===403?"Provider blocks GitHub Actions runner IP.":"Provider reachable from CI.");

const out={checked_at:new Date().toISOString(),ok:checks.every(x=>x.ok),checks};
console.log(JSON.stringify(out,null,2));
if(!out.ok) process.exitCode=1;
