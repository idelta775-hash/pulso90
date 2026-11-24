# Pulso 90 Identity Engine V1

Release target: v0.35

## Scope
Public DEMO identity for Pulso 90 players. This identity layer is completely separate from the internal Owner Lab and does not enable real-money wagering, deposits, withdrawals, KYC or administrative access.

## Public endpoints
- POST /api/identity/register
- POST /api/identity/login
- GET /api/identity/me
- POST /api/identity/logout
- POST /api/identity/profile

## Registration
Fields:
- displayName
- username
- password
- optional demo_session
- optional referral_code

Rules:
- username: 3–32 chars, lowercase-compatible [a-z0-9._-]
- password: 8–72 chars
- password persisted only as scrypt hash + random salt
- existing unclaimed DEMO session may be attached to the new account
- each account receives a unique P90 referral code
- referral attribution does not pay real commission

## Tokens
- bearer token lifetime: 7 days
- raw token is returned once to the browser
- persisted store contains SHA-256 token hash only
- max 5 non-expired tokens retained per player
- logout revokes the current token
- transient runtime/network errors do not delete browser tokens
- HTTP 401 removes an invalid/expired browser token

## DEMO wallet persistence
Each public account owns one demoSessionId.
The same DEMO balance, rounds, points and fairness state are recovered:
- after navigation between Home / Meu Pulso / Originais / Carteira
- after logout + login
- after backend restart

The DEMO session remains a test-credit wallet with no monetary value.

## Referral model
Each player gets:
- referralCode: P90XXXXXXXXXX
- referredByCode when a valid invite code was used

Owner summary includes:
- public DEMO accounts
- referred registrations
- accounts created in the last 7 days
- active tokens

No financial commission is calculated or paid.

## Security controls
- scrypt password hashing
- timingSafeEqual for password hash comparison
- per-IP auth rate gate
- player token stored server-side only as hash
- separate identity event JSONL
- no CPF or payment credential required
- public identity has no Owner Lab role or permission
- REAL account flag is forced false

## Frontend integration
Identity is consumed by:
- account.html / account.js
- Home identity hydration
- games/app.js
- wallet.js

Local storage keys:
- pulso90-player-token-v1
- pulso90-demo-session-v2
- pulso90-profile-v1

## Validation performed
Isolated API validation:
- guest DEMO round
- register while claiming guest session
- wallet/round preservation
- logout invalidation
- invalid password rejection
- login recovery
- second account through referral
- referral count increment
- profile update
- persisted store checked for absence of raw password/token
- token + wallet recovered after backend restart

Browser validation:
- Account -> Originals -> Wallet -> Home -> Account
- same DEMO session across all surfaces
- logout clears token and local DEMO session
- login restores same session
- runtime loss preserves browser identity token
- zero page errors

Identity event JSONL validated with one physical line per event.

## V1.1 hardening — v0.37

Additional protections and globalization:

- Unicode display names are preserved with NFC normalization.
- Control characters and angle brackets are removed from display names.
- Player token hashes are verified with timing-safe comparison.
- Expired player tokens are pruned during authentication.
- Per-username credential failure tracking blocks the account temporarily after repeated wrong passwords.
- Direct links to `account.html?code=...` capture the referral code even when the visitor never opened the Home first.
- Direct account referral visits also call the Affiliate Attribution Engine once per stored attribution state.
- REAL public accounts remain forced disabled.

New isolated validation:

- Arabic + CJK mixed display name preserved exactly.
- existing anonymous DEMO session claimed by account without losing prior round/state.
- credential lock activated after repeated invalid attempts.
- raw password and raw bearer token absent from persisted player store.
- token, demoSessionId, balance and round count preserved after runtime restart.
- direct referral page visit persisted `code` locally and appended one Affiliate Engine event.
- direct referral browser validation produced zero page errors.
