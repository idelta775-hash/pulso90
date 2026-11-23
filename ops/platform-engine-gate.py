from pathlib import Path
import json,sys
root=Path(__file__).resolve().parents[1]
p=root/"data"/"platform-engine.json"
errors=[]
try:
    x=json.loads(p.read_text(encoding="utf-8-sig"))
except Exception as e:
    print(json.dumps({"pass":False,"errors":["invalid_json:"+str(e)]}))
    raise SystemExit(2)
tenant=x.get("tenant") or {}
features=tenant.get("features") or {}
affiliate=x.get("affiliate") or {}
games=((x.get("catalog") or {}).get("games") or [])
promos=x.get("promotions") or []
ids=[str(g.get("id") or "") for g in games]
if len(ids)!=len(set(ids)): errors.append("duplicate_game_ids")
if any(not i for i in ids): errors.append("blank_game_id")
if features.get("real_execution") is not False: errors.append("tenant_real_execution_must_be_false")
if affiliate.get("real_commission_enabled") is not False: errors.append("affiliate_real_commission_must_be_false")
for g in games:
    if g.get("provider")!="Pulso 90 Originals" and g.get("supports_real") is True:
        errors.append("third_party_real_enabled:"+str(g.get("id")))
    if g.get("provider")!="Pulso 90 Originals" and g.get("supports_demo") is True:
        errors.append("third_party_demo_claim_without_provider:"+str(g.get("id")))
    art=str(g.get("art") or "")
    if art and not (root/art).exists(): errors.append("missing_art:"+art)
pids=[str(p.get("id") or "") for p in promos]
if len(pids)!=len(set(pids)): errors.append("duplicate_promotion_ids")
for p0 in promos:
    copy=p0.get("copy") or {}
    for lang in ("pt","en","es"):
        c=copy.get(lang) or {}
        if not all(str(c.get(k) or "").strip() for k in ("kicker","title","text","state")):
            errors.append("promotion_copy_missing:"+str(p0.get("id"))+":"+lang)
out={"pass":not errors,"games":len(games),"promotions":len(promos),"tenant":tenant.get("id"),"real_execution":features.get("real_execution"),"affiliate_real_commission":affiliate.get("real_commission_enabled"),"errors":errors}
print(json.dumps(out,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 2)
