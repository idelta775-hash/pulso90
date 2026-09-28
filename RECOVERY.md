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

## Guardian support — stream recovery incident
- 2026-09-26 11:40 BRT: ChatGPT UI showed `Resume stream unavailable` after earlier `ChatGPT stream recovery polling timed out`.
- Guardian Direct Control support request opened as private issue #17 and processed successfully.
- Guardian result: direct-control agent healthy enough to process the request, but global Guardian state = `DEGRADED_GUARDIAN`; self-test = `DEGRADED`; `safeHealUnlocked=false`.
- Allowed while degraded: observe, diagnose, classify, prepare handoff, update local index, write audit log, refresh dashboard, self-test.
- Therefore Pulso 90 continuity does not rely on Guardian auto-heal during this state; GitHub Pages + runtime bridge + release/checkpoint remain the source of truth.
- The ChatGPT `Resume stream unavailable` message is treated as a UI/stream continuity fault, not a Pulso 90 runtime failure.

## Visual identity assets
- Release 0.14 applies Pulso 90-generated visual assets from `assets/visual/`.
- Hero/community visual and 16 branded icons are original Pulso 90 assets generated for this project.
- Full concept mockups containing fictional balances/bonuses were not embedded as functional product claims.
- No official competitor artwork or third-party game thumbnails were embedded without authorization.
- PWA cache version: `pulso90-shell-v3-visual`.

## RGS guarantees in current lab
- HMAC-SHA256 commit/reveal
- configurable client seed
- nonce per round
- seed rotation/reveal
- history endpoint
- hash-chained audit log
- invalid JSON returns HTTP 400
- CORS bridge for the persistent static frontend
