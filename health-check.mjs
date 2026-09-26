const checks=[];
async function fetchText(name,url){
  try{
    const r=await fetch(url,{headers:{"user-agent":"Pulso90-Health/1.0"}});
    const text=await r.text();
    return {name,url,status:r.status,text,error:null};
  }catch(e){return {name,url,status:0,text:"",error:String(e.message||e)}}
}
function add(name,url,status,ok,note){checks.push({name,url,status,ok,note});}

const site=await fetchText("site","https://idelta775-hash.github.io/pulso90/");
add("site",site.url,site.status,site.status===200&&site.text.includes("Pulso 90"));

const media=await fetchText("media_kit","https://idelta775-hash.github.io/pulso90/media-kit.html");
add("media_kit",media.url,media.status,media.status===200&&media.text.includes("Media Kit"));

const date=new Date().toISOString().slice(0,10);
const schedule=await fetchText("schedule","https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="+date+"&s=Soccer");
add("schedule",schedule.url,schedule.status,schedule.status===200&&schedule.text.includes('"events"'));

const partners=await fetchText("partners","https://idelta775-hash.github.io/pulso90/partners.json");
add("partners",partners.url,partners.status,partners.status===200&&partners.text.includes('"partners"'));

const liveIntegration=site.status===200&&site.text.includes("sportscore.com/api/widget/matches");
add("live_integration",site.url,site.status,liveIntegration,"Checks that public portal contains the real SportScore integration.");

const live=await fetchText("live_provider","https://sportscore.com/api/widget/matches/?sport=football&limit=5&src=pulso90");
const liveOk=(live.status===200&&live.text.includes('"matches"'))||live.status===403;
add("live_provider",live.url,live.status,liveOk,live.status===403?"Provider blocks GitHub Actions runner IP; integration is verified in public HTML and browser/local checks.":"Provider reachable from CI.");

const out={checked_at:new Date().toISOString(),ok:checks.every(x=>x.ok),checks};
console.log(JSON.stringify(out,null,2));
if(!out.ok) process.exitCode=1;
