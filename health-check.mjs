const checks=[];
async function check(name,url,test){
  try{
    const r=await fetch(url,{headers:{"user-agent":"Pulso90-Health/1.0"}});
    const text=await r.text();
    const ok=r.ok && (!test || test(text));
    checks.push({name,url,status:r.status,ok});
  }catch(e){checks.push({name,url,status:0,ok:false,error:String(e.message||e)})}
}
await check("site","https://idelta775-hash.github.io/pulso90/",t=>t.includes("Pulso 90"));
await check("media_kit","https://idelta775-hash.github.io/pulso90/media-kit.html",t=>t.includes("Media Kit"));
await check("schedule","https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="+new Date().toISOString().slice(0,10)+"&s=Soccer",t=>t.includes('"events"'));
await check("live","https://sportscore.com/api/widget/matches/?sport=football&limit=5&src=pulso90",t=>t.includes('"matches"'));
await check("partners","https://idelta775-hash.github.io/pulso90/partners.json",t=>t.includes('"partners"'));
const out={checked_at:new Date().toISOString(),ok:checks.every(x=>x.ok),checks};
console.log(JSON.stringify(out,null,2));
if(!out.ok) process.exitCode=1;
