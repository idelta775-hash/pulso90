# Pulso 90 — Recovery Checkpoint

Release: GLOBAL_HUB_LAB_0.13_INTELLIGENCE_DISCOVERY
Date: 2026-09-26

## Why this exists
The ChatGPT web UI showed "ChatGPT stream recovery polling timed out". This is a chat-stream/UI failure, not a Pulso 90 application failure.

## Recovery architecture
- Source of truth: Git repository `idelta775-hash/pulso90`
- Persistent frontend: https://idelta775-hash.github.io/pulso90/
- Runtime endpoint is discovered from `runtime-config.json`
- Current RGS lab: https://method-ftp-vip-freeze.trycloudflare.com
- RGS local port: 19011
- Original games remain DEMO_ONLY.

## If the chat times out
1. Do not roll back.
2. Read `release.json`, `runtime-config.json` and this file.
3. Validate `/api/lab/health`.
4. If the Quick Tunnel changed, update only `runtime-config.json`.
5. Keep real-money functionality disabled until regulatory/contractual prerequisites are actually met.

## Self-healing runtime
- Script: `ops/recover-global-lab.ps1`
- At login, it checks the RGS on port 19011 and the runtime health endpoint.
- If the current tunnel is dead, it creates a new Quick Tunnel.
- With `-Publish`, it updates `runtime-config.json` and pushes only the endpoint change to `main`.
- Healthy runtime = no duplicate process and no unnecessary commit.

## RGS guarantees in current lab
- HMAC-SHA256 commit/reveal
- configurable client seed
- nonce per round
- seed rotation/reveal
- history endpoint
- hash-chained audit log
- invalid JSON returns HTTP 400
- CORS bridge for the persistent static frontend
