from pathlib import Path
from html.parser import HTMLParser
import json,re,subprocess,tempfile,sys

ROOT=Path(r"D:\gpt\Pulso 90\deploy-pages")
TESTS=Path(r"D:\gpt\Pulso 90\tests")
PAGES=[ROOT/"index.html",ROOT/"account.html",ROOT/"games"/"index.html",ROOT/"catalog"/"index.html",ROOT/"providers"/"index.html"]

class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.refs=[];self.images=[];self.viewport=False;self.text=[];self._skip=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ("script","style"): self._skip+=1
        if "id" in a:self.ids.append(a["id"])
        if tag=="meta" and a.get("name","").lower()=="viewport":self.viewport=True
        if tag in ("img","script") and a.get("src"):self.refs.append(a["src"])
        if tag=="link" and a.get("href"):self.refs.append(a["href"])
        if tag=="a" and a.get("href"):self.refs.append(a["href"])
        if tag=="img":self.images.append(a)
    def handle_endtag(self,tag):
        if tag in ("script","style") and self._skip:self._skip-=1
    def handle_data(self,data):
        if not self._skip:self.text.append(data)

def local_exists(base,ref):
    if not ref or ref.startswith(("#","http://","https://","mailto:","tel:","javascript:","data:")):return True
    ref=ref.split("?",1)[0].split("#",1)[0]
    if not ref:return True
    p=(base/ref).resolve()
    if p.is_dir():p=p/"index.html"
    return p.exists()

checks={}
detail={}
all_refs_ok=True;all_ids_ok=True;all_alt_ok=True;all_viewport=True;copy_ok=True
blocked=["b2b","licenciamento","certificação","rgs","hmac","rng","pipeline"," spa "," api "]
for page in PAGES:
    if not page.exists():
        all_refs_ok=all_ids_ok=all_alt_ok=all_viewport=False;detail[str(page)]={"missing":True};continue
    text=page.read_text(encoding="utf-8");p=AuditParser();p.feed(text)
    dup=sorted({x for x in p.ids if p.ids.count(x)>1})
    broken=sorted({r for r in p.refs if not local_exists(page.parent,r)})
    noalt=[x.get("src","") for x in p.images if "alt" not in x]
    visible=" ".join(p.text).lower()
    bad=[w for w in blocked if w in " "+visible+" "] if page in PAGES[:3] else []
    detail[str(page.relative_to(ROOT))]={"duplicates":dup,"broken_refs":broken,"images_without_alt":noalt,"viewport":p.viewport,"blocked_copy":bad}
    all_refs_ok &= not broken;all_ids_ok &= not dup;all_alt_ok &= not noalt;all_viewport &= p.viewport;copy_ok &= not bad

checks["1_core_pages"]=all(p.exists() for p in PAGES)
checks["2_local_links_assets"]=all_refs_ok
checks["3_unique_ids"]=all_ids_ok
checks["4_image_accessibility"]=all_alt_ok
checks["5_mobile_viewport"]=all_viewport
checks["6_player_copy_clean"]=copy_ok

js_files=[ROOT/"games"/"app.js",ROOT/"sw.js"]
embedded=[]
for page in [ROOT/"index.html",ROOT/"account.html"]:
    txt=page.read_text(encoding="utf-8")
    for i,s in enumerate(re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>",txt,re.S|re.I)):
        if s.strip():
            f=TESTS/f"audit-{page.stem}-{i}.js";f.write_text(s,encoding="utf-8");embedded.append(f)
js_ok=True;js_err=[]
for f in js_files+embedded:
    r=subprocess.run(["node","--check",str(f)],capture_output=True,text=True)
    if r.returncode:js_ok=False;js_err.append({"file":str(f),"err":r.stderr[-800:]})
checks["7_javascript_valid"]=js_ok;detail["js_errors"]=js_err

sim_path=TESTS/"player-simulation-300.json"
sim=json.loads(sim_path.read_text(encoding="utf-8")) if sim_path.exists() else {}
checks["8_session_persistence"]=bool(sim.get("persistence",{}).get("rate")==1 and sim.get("persistence",{}).get("restored")==sim.get("persistence",{}).get("sampled"))
lat=sim.get("latency_ms",{})
checks["9_load_performance"]=bool(lat and lat.get("p95",9999)<250 and lat.get("p99",9999)<500)
checks["10_integrity_zero_failures"]=bool(sim.get("audit_after_restart",{}).get("ok") and not sim.get("failures") and sim.get("pass"))

score=sum(1 for v in checks.values() if v)
report={"score":score,"max":10,"pass":score==10,"checks":checks,"details":detail,"simulation":{"players":sim.get("players"),"plays":sim.get("successfulPlays"),"requests":sim.get("totalRequests"),"latency_ms":lat,"persistence":sim.get("persistence"),"audit":sim.get("audit_after_restart")}}
(TESTS/"quality-gate-10.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
lines=["# Pulso 90 — Quality Gate","",f"## Score: {score}/10",f"PASS: **{score==10}**",""]+[f"- {'PASS' if v else 'FAIL'} — {k}" for k,v in checks.items()]
(TESTS/"quality-gate-10.md").write_text("\n".join(lines),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(0 if score==10 else 2)
