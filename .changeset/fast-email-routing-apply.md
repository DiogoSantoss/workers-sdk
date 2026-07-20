---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Apply Email Routing rule changes concurrently

Email Routing reconciliation now starts all planned rule mutations concurrently while continuing to report progress and collect individual failures. This reduces deployment time when an `addresses` configuration changes multiple rules or zones.
