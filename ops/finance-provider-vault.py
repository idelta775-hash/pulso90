from __future__ import annotations
import json,sys,os
from pathlib import Path

PULSO=Path(r"D:\gpt\Pulso 90")
DELTA=Path(r"D:\gpt\Delta ISP")
RUNTIME=PULSO/"runtime"
VAULT=RUNTIME/"finance-provider-vault.json"
sys.path.insert(0,str(DELTA))
from core.crypto_store import encrypt,decrypt

SCHEMAS={
 "asaas":{"secret":["api_key","webhook_secret"],"nonsecret":["api_base","wallet_id","pix_key"]},
 "mercado_pago":{"secret":["access_token","webhook_secret"],"nonsecret":["api_base","public_key","collector_id"]},
 "generic":{"secret":["api_key","client_id","client_secret","webhook_secret"],"nonsecret":["api_base","account_id"]}
}

def load():
 RUNTIME.mkdir(parents=True,exist_ok=True)
 if not VAULT.exists(): return {"version":1,"providers":{}}
 try:return json.loads(VAULT.read_text(encoding="utf-8"))
 except:return {"version":1,"providers":{}}

def write(d):
 tmp=VAULT.with_suffix(".tmp")
 tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8")
 try: os.chmod(tmp,0o600)
 except: pass
 tmp.replace(VAULT)
 try: os.chmod(VAULT,0o600)
 except: pass
def mask(v):
 s=str(v or "")
 if not s:return ""
 return ("***"+s[-4:]) if len(s)<=10 else (s[:3]+"••••••"+s[-4:])

def safe_provider(p):
 pid=str(p.get("provider") or "")
 schema=SCHEMAS.get(pid,SCHEMAS["generic"])
 out={"provider":pid,"environment":p.get("environment") or "demo","enabled":bool(p.get("enabled")),
      "label":p.get("label") or pid,"nonsecret":dict(p.get("nonsecret") or {}),"secrets":{}}
 for k in schema["secret"]:
  enc=(p.get("secrets") or {}).get(k,"")
  if enc:
   try: raw=decrypt(enc,"pulso90:"+pid+":"+k)
   except: raw=""
   out["secrets"][k]={"configured":bool(raw),"masked":mask(raw)}
 return out

def list_status():
 d=load()
 return {"ok":True,"providers":[safe_provider({"provider":k,**v}) for k,v in (d.get("providers") or {}).items()]}

def save(payload):
 pid=str(payload.get("provider") or "").strip().lower()
 if pid not in SCHEMAS: pid="generic"
 env=str(payload.get("environment") or "demo").strip().lower()
 if env not in {"demo","sandbox","real","production"}: raise ValueError("invalid_environment")
 d=load(); old=(d.setdefault("providers",{}).get(pid) or {})
 schema=SCHEMAS[pid]; secrets=dict(old.get("secrets") or {})
 for k in schema["secret"]:
  v=str(payload.get(k) or "").strip()
  if v: secrets[k]=encrypt(v,"pulso90:"+pid+":"+k)
 non=dict(old.get("nonsecret") or {})
 for k in schema["nonsecret"]:
  if k in payload: non[k]=str(payload.get(k) or "").strip()
 d["providers"][pid]={"label":str(payload.get("label") or old.get("label") or pid)[:80],
  "environment":env,"enabled":bool(payload.get("enabled",True)),"secrets":secrets,"nonsecret":non}
 write(d)
 return {"ok":True,"provider":safe_provider({"provider":pid,**d["providers"][pid]})}
def delete(payload):
 pid=str(payload.get("provider") or "").strip().lower()
 d=load(); existed=bool((d.get("providers") or {}).pop(pid,None)); write(d)
 return {"ok":True,"provider":pid,"removed":existed}

def main():
 action=(sys.argv[1] if len(sys.argv)>1 else "status").lower()
 payload={}
 if action!="status":
  raw=sys.stdin.read()
  payload=json.loads(raw) if raw.strip() else {}
 if action=="status": out=list_status()
 elif action=="save": out=save(payload)
 elif action=="delete": out=delete(payload)
 else: raise ValueError("invalid_action")
 print(json.dumps(out,ensure_ascii=False))

if __name__=="__main__":
 try: main()
 except Exception as e:
  print(json.dumps({"ok":False,"error":str(e)[:160]},ensure_ascii=False))
  raise SystemExit(1)
