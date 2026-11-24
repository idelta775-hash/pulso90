# Pulso 90 Public DEMO Sportsbook V1

Release target: v0.36

## Scope
Authenticated public Pulso 90 players can use their persistent DEMO account to create sports tickets using externally sourced reference events and prices.

This is not an official bookmaker/provider integration and does not enable real-money wagering.

## Public feed
GET /api/sports/demo-feed?scope=football

Supported reference scopes:
- football
- combat
- futsal
- snooker

Response explicitly includes:
- mode: DEMO_ONLY
- official_provider_integration: false
- source: reference_feed_demo_only

A 45-second server cache reduces source load.

## Server-side price validation
The browser sends:
- scope
- event_id
- selection

The browser does not set the accepted ticket price.

Before ticket creation the backend:
1. refetches the reference feed with force=true;
2. resolves the exact event;
3. resolves the exact outcome;
4. obtains the current source price;
5. rejects unavailable/changed selections;
6. rejects clearly started events;
7. calculates combined odds on the server.

## Public DEMO endpoints
- POST /api/sports/demo/bet
- GET /api/sports/demo/tickets
- POST /api/sports/demo/settle

All ticket endpoints require x-player-token.

## Wallet
Stake is debited only from the player account's DEMO session.

Single:
- stake is applied independently to every selection.

Multiple:
- one stake is debited;
- combined odds are calculated server-side.

Winning tickets are credited back to the same DEMO session.

No public DEMO sports transaction touches real money.

## Settlement
Football settlement uses the existing SportScore result bridge and the existing normalized team/time matching heuristic.

States:
- PENDING
- WON
- LOST

Non-football tickets remain unresolved until a verified result adapter exists.

This is still a laboratory-grade settlement path. Production requires canonical provider event IDs, immutable result snapshots, VOID/cancellation rules and certified provider integration.

## Isolation
Tickets persist in players-v1.json under sportsTickets and use player_id.

GET /api/sports/demo/tickets filters strictly by authenticated player_id.

Internal Owner Lab sports tickets remain in owner-lab-v1.json and keep their existing internal endpoints.

## Frontend behavior
Guests:
- may view reference prices;
- cannot place a ticket;
- receive CTA to Meu Pulso.

Authenticated DEMO player:
- sees APOSTAR DEMO;
- stake uses the account DEMO balance;
- saved tickets appear in the betslip;
- tickets survive backend restart.

REAL selected:
- no DEMO submit button is rendered;
- UI explains that REAL remains blocked until certified real connector exists.

## Validation performed
API:
- unauthenticated bet rejected 401
- 360 football events loaded in reference snapshot
- forged selection rejected
- server price matched current source price
- 10 DEMO credits deducted from authenticated player
- second player could not see first player's ticket
- single mode with two selections validated
- only environment=demo tickets persisted

Browser:
- guest saw 1,080 odds buttons and login CTA
- authenticated player placed 2-credit DEMO ticket
- account balance decreased from 984 to 982
- tickets visible
- REAL mode rendered no DEMO submit button
- zero page errors

Restart:
- account balance 982 recovered
- 4 tickets recovered
- all remained PENDING because events had not finished
