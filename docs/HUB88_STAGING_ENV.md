# Hub88 staging configuration - Pulso 90

Do not commit real credentials.

Required environment variables:
- PULSO90_HUB88_OPERATOR_ID
- PULSO90_HUB88_PRIVATE_KEY_PEM

Optional / depending on onboarding:
- PULSO90_HUB88_PUBLIC_KEY_PEM
- PULSO90_HUB88_SUB_PARTNER_ID
- PULSO90_HUB88_BASE

Default staging base currently configured by the Pulso 90 readiness layer:
https://api.server1.ih.testenv.io

Runtime check:
GET /api/internal/casino/readiness
Requires internal lab authentication.

Expected lifecycle:
1. credentials_missing
2. credentials_loaded_pending_certification
3. staging_catalog_verified
4. staging_launch_verified
5. wallet_callbacks_verified
6. certified_for_authorized_jurisdiction

Never place provider secrets in:
- Git
- browser JavaScript
- localStorage
- public GitHub Pages
- telemetry
