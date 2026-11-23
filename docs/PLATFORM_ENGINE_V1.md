# Pulso 90 Platform Engine V1

Release target: v0.34

## Objective
Convert Pulso 90 from a mostly page-configured frontend into a server-driven platform engine inspired by the architecture observed in public white-label casino platforms, without copying proprietary code, artwork, game math or credentials.

## Core services

### 1. Tenant Config
Public:
- GET /api/platform/tenant
- GET /api/platform/bootstrap

Owner:
- GET /api/internal/platform/engine
- POST /api/internal/platform/tenant

Runtime overrides are persisted under the private runtime directory and do not require editing public HTML.

REAL execution is always forced to false in this release.

### 2. Dynamic Catalog
Public:
- GET /api/platform/catalog
- filters: provider, type, tag, q

The base catalog is stored in:
- data/platform-engine.json

Commercial third-party titles remain:
- editorial_pending_provider
- supports_demo=false
- supports_real=false

Pulso Originals remain:
- demo_live
- supports_demo=true
- supports_real=false

### 3. Promotion Engine
Public:
- GET /api/platform/promotions?environment=demo|real|all

Owner:
- POST /api/internal/platform/promotion

Campaigns are server-driven and localized (PT/EN/ES). Real-money incentives are not enabled.

### 4. Affiliate Attribution Engine
Public:
- POST /api/platform/affiliate/touch

Supported attribution inputs include:
- code
- affiliateId
- trackerId
- UTM parameters
- selected campaign tracking fields

Events are persisted privately in:
- affiliate-events-v1.jsonl

Owner summary is returned through:
- GET /api/internal/platform/engine?days=30

Mode:
- attribution_only
- real_commission_enabled=false

No commission or real-money payout is performed.

## Frontend behavior
Home attempts to load /api/platform/bootstrap from the runtime.
If unavailable, it falls back to data/platform-engine.json.

This keeps GitHub Pages usable while allowing the live runtime to control tenant, catalog and promotions when connected.

## Fail-closed rules
- No third-party game becomes playable because it appears in the catalog.
- No REAL execution is enabled by tenant configuration.
- No affiliate commission is paid.
- Provider credentials remain server-side.
- Official provider launch still requires B2B onboarding and certified adapters.

## Validation
Validated in an isolated runtime on port 19012:
- public bootstrap
- catalog filtering
- promotions
- affiliate touch
- isolated internal owner bootstrap/login
- tenant runtime override
- promotion enable/disable
- owner affiliate summary
- dynamic frontend path
- static fallback path
- owner console rendering
