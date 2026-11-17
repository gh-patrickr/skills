---
name: polish-property-scraping
description: Expert guidelines, selector strategies, anti-bot evasion techniques (Playwright, Patchright, stealth), fixture recording, and parser maintenance for Polish real estate portals (Otodom, Gratka, Morizon, Adresowo, OLX, Nieruchomosci-online). Use when building, repairing, or recording fixtures for a scraper of any of these portals, in any workspace.
---

# Polish Property Scraping & Anti-Bot Evasion Guide

**Applies to:** scrapers for the Polish portals listed below, in any repository. Paths
such as `tests/fixtures/{portal}/` and `raw_storage/...` follow a standard 2-stage layout;
adapt the names to the workspace you are in.

This skill guides the creation, testing, and maintenance of scrapers for Polish real estate portals, adhering to a strict 2-stage decoupled pipeline (Raw Ingestion -> Local Extraction).

## 1. Supported Portals & Technical Signatures

| Portal | Typical Anti-Bot / WAF | Data Delivery in DOM | Key Quirks |
| :--- | :--- | :--- | :--- |
| **otodom.pl** | Cloudflare + DataDome | Next.js `__NEXT_DATA__` JSON or Hydrated React state | Extracting `__NEXT_DATA__` script tag gives full structured data without parsing fragile HTML! |
| **olx.pl** | Cloudflare + DataDome | `window.__PRERENDERED_STATE__` or Next.js JSON | Owned by same parent (Naspers/Prosus) as Otodom; shares API structures |
| **morizon.pl** | Cloudflare | SSR HTML + JSON-LD | Rich JSON-LD schema with `schema.org/Product` or `SingleFamilyResidence` |
| **gratka.pl** | Cloudflare / Custom WAF | SSR HTML + Schema.org / data attributes | Poland Press group; structured property parameter tables |
| **adresowo.pl** | Cloudflare / Light rate-limit | Server rendered HTML tables | Directly lists private offers (bez pośredników) |
| **nieruchomosci-online.pl** | Cloudflare / Custom checks | SSR HTML + embedded JSON | Dense technical parameters table |

## 2. Anti-Bot & Evasion Principles
1. **Per-Domain Concurrency = 1**: Never send concurrent requests to the same portal from a single IP. Run scrapers for *different* portals in parallel.
2. **Stealth Headless Execution**:
   - Use `playwright-stealth` or `patchright` (dropping `navigator.webdriver`, fixing CDC / Chrome DevTools protocol flags).
   - Standard browser flags: `--disable-blink-features=AutomationControlled`, `--no-sandbox`.
   - Realistic Polish user context: `locale: "pl-PL"`, `timezone_id: "Europe/Warsaw"`, standard desktop resolution (1920x1080).
3. **Randomized Human Delays**:
   - Normal distribution delays (e.g. 3.5s ± 1.2s) between page clicks and transitions.
   - Smooth viewport mouse movement and scrolling before clicking pagination.
4. **Proxy & Session Management**:
   - Support rotating residential Polish proxies (`http://<user>:<pass>@<host>:<port>`).
   - Persist session cookies per domain to avoid triggering fresh consent banners on every visit.

## 3. Two-Stage Decoupled Workflow
- **Stage 1 (Ingestion)**:
  - Fetches page HTML/JSON and downloads media (photos, floor plans).
  - Calculates content hash (SHA-256) of raw payload.
  - Compares with previous version in storage: if unchanged, skips re-ingestion. If changed, creates a new version record linked by `source_portal` + `portal_listing_id`.
  - Saves raw payload to disk/object storage: `raw_storage/{portal}/{date}/{listing_id}_{hash}.html` (or `.json`).
- **Stage 2 (Local Processing)**:
  - Parses raw payloads entirely offline.
  - Zero network hits to portals during extraction iteration, debugging, or schema evolution.
  - Extracts standard attributes (price, surface, plot size, garden, rooms, address, coordinates).

## 4. Testing & Maintenance Runbook
- **Golden Fixtures**: Always record real anonymized HTML/JSON responses in `tests/fixtures/{portal}/`.
- Unit tests run 100% offline against golden fixtures.
- Selector failure alerts: If a portal updates DOM, tests fail immediately on the updated fixture before touching production runs.
