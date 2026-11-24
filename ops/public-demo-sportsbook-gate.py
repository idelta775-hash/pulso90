from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
errors=[]
cfg=json.loads((root/"data"/"platform-engine.json").read_text(encoding="utf-8-sig"))
features=(cfg.get("tenant") or {}).get("features") or {}
for key in ("public_demo_sportsbook","sports_reference_feed","sports_ticket_persistence"):
    if features.get(key) is not True: errors.append("feature_missing:"+key)
if features.get("real_execution") is not False: errors.append("real_execution_must_be_false")
server=(root/"games-engine"/"rgs-demo.mjs").read_text(encoding="utf-8")
front=(root/"sportsbook.js").read_text(encoding="utf-8")
html=(root/"sportsbook.html").read_text(encoding="utf-8")
required_server=[
"/api/sports/demo-feed","/api/sports/demo/bet","/api/sports/demo/tickets","/api/sports/demo/settle",
"playerAuth(req)","validateSportsSelections(raw)","official_provider_integration:false",
"environment:\"demo\"","player_id:u.id","reference_feed_demo_only"
]
for item in required_server:
    if item not in server: errors.append("server_missing:"+item)
required_front=["PLAYER_TOKEN_KEY","/api/sports/demo/bet","/api/sports/demo/tickets","ENTRAR NO MEU PULSO","APOSTAR DEMO","Apostas reais ficam bloqueadas"]
for item in required_front:
    if item not in front: errors.append("frontend_missing:"+item)
if "integração oficial de bookmaker: não ativa" not in html: errors.append("reference_disclosure_missing")
if "/api/sports/real" in server or "/api/sports/real" in front: errors.append("real_sports_endpoint_detected")
if re.search(r'official_provider_integration\s*:\s*true',server): errors.append("official_integration_false_required")
out={"pass":not errors,"public_demo_sportsbook":features.get("public_demo_sportsbook"),"real_execution":features.get("real_execution"),"errors":errors}
print(json.dumps(out,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 2)
