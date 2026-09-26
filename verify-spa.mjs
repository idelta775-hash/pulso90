import fs from "node:fs";
const SOURCE="https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/transparencia-ativa-processos-de-autorizacao-de-apostas-de-quota-fixa/planilha-de-autorizacoes-1.csv/@@download/file";
const partners=JSON.parse(fs.readFileSync("partners.json","utf8")).partners;
const r=await fetch(SOURCE,{headers:{"user-agent":"Pulso90-Compliance/1.1"}});
if(!r.ok) throw new Error("SPA CSV HTTP "+r.status);
const csv=new TextDecoder("utf-8").decode(await r.arrayBuffer());
const lines=csv.split(/\r?\n/);
let current={portaria:"",empresa:"",cnpj:"",requerimento:""};
const found={};
const clean=s=>{const v=String(s||"");return /\uFFFD|[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v)?null:v;};
for(const line of lines){
  const c=line.split(";").map(x=>x.trim());
  if(c.length<6) continue;
  if(c[1] && !c[1].startsWith("(")) current.portaria=c[1];
  if(c[2]) current.empresa=c[2];
  if(c[3]) current.cnpj=c[3];
  if(c[6]) current.requerimento=c[6];
  const marca=c[4]||"";
  const dominio=(c[5]||"").toLowerCase();
  if(dominio){
    found[dominio]={
      portaria:clean(current.portaria),
      empresa:clean(current.empresa),
      cnpj:clean(current.cnpj),
      marca:clean(marca),
      requerimento:clean(current.requerimento)
    };
  }
}
const domains={},details={};
for(const p of partners){
  const key=String(p.domain||"").toLowerCase();
  domains[p.domain]=Boolean(found[key]);
  if(found[key]) details[p.domain]=found[key];
}
const out={checked_at:new Date().toISOString(),source:SOURCE,domains,details};
fs.writeFileSync("spa-status.json",JSON.stringify(out,null,2)+"\n","utf8");
if(Object.values(domains).some(v=>!v)){
  console.error("One or more partner domains were not found in the official SPA CSV.");
  process.exitCode=2;
}
