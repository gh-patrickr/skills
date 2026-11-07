---
name: real-estate-data-pipeline
description: Best practices for real estate data lineage, schema evolution, cross-portal deduplication, geo-filtering (Willy Brandt School Warsaw), and testing multi-stage data pipelines. Use when designing or changing storage, lineage, dedupe, or geo-targeting for a Polish property pipeline in any workspace; the WBS/Hub commute model is DreamHome's concrete configuration.
---

# Real Estate Data Pipeline & Schema Evolution

**Applies to:** any multi-stage Polish real-estate pipeline. The concrete thresholds,
table names and the Willy Brandt School / Google Hub commute model describe the DreamHome
Warsaw project; reuse the method and substitute the workspace's own configuration.

This skill covers the storage design, schema evolution, versioning/lineage model, and geo-spatial analytics for Polish property scraping.

## 1. Storage Architecture Recommendation

### Hybrid Store: Raw File Lake + DuckDB/PostgreSQL + JSONB
- **Raw Lake (Local File System or MinIO/S3)**:
  - Store unadulterated raw responses (HTML or raw JSON) and media assets (images, floor plans) indexed by `portal`, `portal_listing_id`, and `timestamp`.
  - Content-addressable hashing (SHA-256) enables instant change detection and idempotency.
- **Relational + Document Hybrid (PostgreSQL with JSONB or DuckDB for local embedded zero-dependency execution)**:
  - **Core Table**: Strongly typed common fields (`price_pln`, `living_area_m2`, `plot_area_m2`, `garden_area_m2`, `rooms`, `latitude`, `longitude`, `distance_to_school_km`, `created_at`, `updated_at`, `version`).
  - **Dynamic Attributes (`attributes JSONB`)**: Portal-specific raw tags, heating type, construction year, furnishing, finish status, etc.
  - **Lineage / Price History Table**: Captures timestamped snapshots whenever price or key attributes change:
    - `listing_id`, `version_id`, `recorded_at`, `price_pln`, `price_per_m2`, `delta_price`, `raw_payload_ref`.
- **Why this beats pure NoSQL or rigid SQL**:
  - Full schema evolution without blocking migrations. Rerunning stage 2 parser can rebuild or backfill any newly extracted column directly from the Raw Lake into the DB.
  - Zero-dependency local developer experience: DuckDB or SQLite runs locally inside environments without Docker, while Docker Compose can run PostgreSQL + PostGIS on the host.

## 2. Cross-Portal Deduplication
Brokers often post the same house or apartment across Otodom, Gratka, and Morizon with slightly varying prices or descriptions.
- **Fuzzy Deduplication Fingerprint**:
  - Geo-proximity (within 50-100 meters) OR identical street number + postal code.
  - Floor area rounded to 1 m² + total rooms.
  - Plot size (if house) matching within 5%.
- Assign a global `canonical_property_id` linking disparate portal listings to the same physical home.

## 3. Geo-Targeting: Willy Brandt School & Google The Hub
- **Willy Brandt School (WBS)**: `ul. św. Urszuli Ledóchowskiej 3, 02-972 Warszawa` (52.1584° N, 21.0747° E).
- **Google - The Hub**: `Rondo Daszyńskiego 2, 00-843 Warszawa` (52.2289° N, 20.9845° E).
- **Commute Categories** — four rungs on the school commute, all gated by one Hub budget:
  - **Category 1**: $\le$ 15 min walking to WBS (~1.2 km radius around Ledóchowskiej / Miasteczko Wilanów).
  - **Category 2**: $\le$ 35 min walking to WBS (~2.8 km radius) — the wider walking ring that split the old bike-based category 2.
  - **Category 3**: $\le$ 15 min biking to WBS (~4 km radius, e.g. Wilanów, Zawady, Powsin, Kabaty/Natolin).
  - **Category 4**: $\le$ 30 min biking to WBS (~7-8 km radius, e.g. Sadyba, Stegny, Mokotów, Konstancin) — the outer ring.
  - **Every** category additionally requires $\le$ 60 min biking to Google The Hub; failing that, the offer is **outside** (`category = NULL`) no matter how close it is to school. The rungs are evaluated in order (walk 15, walk 35, bike 15, bike 30), so a walkable offer is never labelled as a bike category. Walking time is routed for every offer inside the routing radius, so all four categories and outside offers show a walk time. Thresholds live in `CommuteRules`; every `commutes` row carries a `rules_key` fingerprint so editing a threshold (or bumping `COMMUTE_RULESET_VERSION`) makes the whole catalogue re-route on the next processing pass.

## 4. Subtask 2.1: Multi-Signal Location Inference Engine (Geo-OSINT)
Brokers deliberately omit exact street addresses. The pipeline reconstructs coordinates through:
1. **Text & POI Triangulation**:
   - Extract mentions: street names, estate names (*np. "Osiedle Królewskie", "Miasteczko Wilanów", "Ostoja"*).
   - Extract public transport stops & bus line numbers (*np. linie 217, 522, 379, 164* or Wilanów tram line) and walk distances (*"5 minut do przystanku"*).
   - Intersect radial buffers using OpenStreetMap Overpass API and Warsaw ZTM transit stops (`api.um.warszawa.pl`).
2. **Visual & Solar OSINT (Vision AI)**:
   - Analyze window/balcony/terrace views: neighboring building height, facade color, roof style/color (e.g. red ceramic tile vs graphite flat roof).
   - Sun azimuth & shadow angles: analyze sunlight direction in photos with Warsaw solar coordinates (e.g., South-facing garden vs North-facing street).
   - Garden/terrace orientation matching against building orientation.
3. **Warsaw Cadastral & Aerial Ground-Truthing**:
   - Query GUGiK / UM Warszawa WFS (`https://wfs.um.warszawa.pl/serwis`) for parcel shapes (*działki ewidencyjne*) and building footprints (*obrysy budynków*).
   - Match plot size ($m^2$) and building footprint against candidate parcels within the triangulated zone.

