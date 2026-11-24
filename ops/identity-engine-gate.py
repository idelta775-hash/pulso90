from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parents[1]
errors=[]
engine=json.loads((root/"data"/"platform-engine.json").read_text(encoding="utf-8-sig"))
features=(engine.get("tenant") or {}).get("features") or {}
if features.get("player_identity") is not True: errors.append("player_identity_feature_missing")
if features.get("persistent_demo_account") is not True: errors.append("persistent_demo_account_missing")
if features.get("referrals") is not True: errors.append("referrals_feature_missing")
if features.get("identity_international_display_names") is not True: errors.append("international_display_names_missing")
if features.get("direct_referral_attribution") is not True: errors.append("direct_referral_attribution_missing")
if features.get("credential_lockout") is not True: errors.append("credential_lockout_missing")
if features.get("timing_safe_player_tokens") is not True: errors.append("timing_safe_player_tokens_missing")
if features.get("real_execution") is not False: errors.append("real_execution_must_be_false")
server=(root/"games-engine"/"rgs-demo.mjs").read_text(encoding="utf-8")
account=(root/"account.js").read_text(encoding="utf-8")
required=[
 "/api/identity/register","/api/identity/login","/api/identity/me","/api/identity/logout","/api/identity/profile",
 "crypto.scryptSync","crypto.timingSafeEqual","x-player-token","auth_rate_limited","account_temporarily_locked","credentialAllowed","cleanDisplayName","secureHexEqual(t.hash,hash)","real_account_enabled:false",
 "players-v1.json","identity-events-v1.jsonl"
]
for item in required:
    if item not in server: errors.append("server_missing:"+item)
if "pulso90-player-token-v1" not in account: errors.append("account_token_key_missing")
if "new URLSearchParams(location.search)" not in account: errors.append("direct_referral_query_capture_missing")
if "/api/platform/affiliate/touch" not in account: errors.append("direct_affiliate_touch_missing")
if re.search(r'localStorage\.setItem\([^\n]*password',account,re.I): errors.append("password_written_to_local_storage")
if "real_money_enabled=true" in server.replace(" ","").lower(): errors.append("real_money_static_true")
if not (root/"account.html").exists(): errors.append("account_html_missing")
if not (root/"account.js").exists(): errors.append("account_js_missing")
out={"pass":not errors,"identity":features.get("player_identity"),"persistent_demo":features.get("persistent_demo_account"),"referrals":features.get("referrals"),"real_execution":features.get("real_execution"),"errors":errors}
print(json.dumps(out,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 2)
