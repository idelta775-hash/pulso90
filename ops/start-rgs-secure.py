import os,sys,subprocess
from pathlib import Path

PULSO=Path(r"D:\gpt\Pulso 90\deploy-pages")
DELTA=Path(r"D:\gpt\Delta ISP")
ENGINE=PULSO/"games-engine"/"rgs-demo.mjs"

def load_asaas_sandbox(env):
    try:
        sys.path.insert(0,str(DELTA))
        from core import asaas_saas_cert_v281 as cert
        key=cert._secret("api_key_cipher","saas:asaas:sandbox:api_key")
        token=cert._secret("webhook_token_cipher","saas:asaas:sandbox:webhook_token")
        if key:
            env["PULSO90_ASAAS_API_KEY"]=key
        if token:
            env["PULSO90_ASAAS_WEBHOOK_TOKEN"]=token
        return bool(key),bool(token)
    except Exception:
        return False,False

def main():
    env=os.environ.copy()
    mode=env.get("PULSO90_ASAAS_ENV","sandbox").strip().lower()
    if mode not in {"sandbox","production"}:
        mode="sandbox"
    env["PULSO90_ASAAS_ENV"]=mode
    loaded_key=loaded_webhook=False
    if mode=="sandbox":
        loaded_key,loaded_webhook=load_asaas_sandbox(env)
    env.setdefault("PULSO90_REAL_MONEY_ENABLE","0")
    env.setdefault("PULSO90_OPERATOR_REGULATORY_ACK","0")
    print("PULSO90_SECURE_LAUNCH env="+mode+" asaas="+("configured" if loaded_key else "not_configured")+" webhook="+("configured" if loaded_webhook else "not_configured"),flush=True)
    raise SystemExit(subprocess.call(["node",str(ENGINE)],cwd=str(PULSO),env=env))

if __name__=="__main__":
    main()
