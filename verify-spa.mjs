import fs from "node:fs";
const SOURCE="https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/transparencia-ativa-processos-de-autorizacao-de-apostas-de-quota-fixa/planilha-de-autorizacoes-1.csv/@@download/file";
const partners=JSON.parse(fs.readFileSync("partners.json","utf8")).partners;
const r=await fetch(SOURCE,{headers:{"user-agent":"Pulso90-Compliance/1.0"}});
if(!r.ok) throw new Error("SPA CSV HTTP "+r.status);
const csv=(await r.text()).toLowerCase();
const domains={};
for(const p of partners) domains[p.domain]=csv.includes(String(p.domain).toLowerCase());
const out={checked_at:new Date().toISOString(),source:SOURCE,domains};
fs.writeFileSync("spa-status.json",JSON.stringify(out,null,2)+"\n","utf8");
if(Object.values(domains).some(v=>!v)){console.error("One or more partner domains were not found in the official SPA CSV.");process.exitCode=2;}
