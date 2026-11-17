---
name: real-estate-data-pipeline
description: Best practices for real estate data lineage, schema evolution, cross-portal deduplication, multi-anchor commute geo-filtering, and testing multi-stage data pipelines. Use when designing or changing storage, lineage, dedupe, or geo-targeting for a Polish property pipeline in any workspace.
---

# Real Estate Data Pipeline & Schema Evolution

**Applies to:** any multi-stage Polish real-estate pipeline. Keep concrete anchor addresses,
coordinates, and commute budgets in project-local configuration; keep this skill generic.

This skill covers the storage design, schema evolution, versioning/lineage model, and geo-spatial analytics for Polish property scraping.

## 1. Storage Architecture Recommendation

### Hybrid Store: Raw File Lake + DuckDB/PostgreSQL + JSONB
- **Raw Lake (Local File System or MinIO/S3)**:
  - Store unadulterated raw responses (HTML or raw JSON) and media assets (images, floor plans) indexed by `portal`, `portal_listing_id`, and `timestamp`.
  - Content-addressable hashing (SHA-256) enables instant change detection and idempotency.
- **Relational + Document Hybrid (PostgreSQL with JSONB or DuckDB for local embedded zero-dependency execution)**:
  - **Core Table**: Strongly typed common fields (`price_pln`, `living_area_m2`, `plot_area_m2`, `garden_area_m2`, `rooms`, `latitude`, `longitude`, `distance_to_anchor_km`, `created_at`, `updated_at`, `version`).
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

## 3. Geo-Targeting: Multi-Anchor Commute Model
Configure target anchors (e.g. primary anchor such as a school or transit node, plus secondary anchor such as a workplace/city center) in project config (`CommuteRules`) rather than hardcoding coordinates in shared docs:
- **Primary Anchor**: `<ANCHOR_A_NAME>` (`<ANCHOR_A_LAT>, <ANCHOR_A_LON>`).
- **Secondary Anchor**: `<ANCHOR_B_NAME>` (`<ANCHOR_B_LAT>, <ANCHOR_B_LON>`).
- **Commute Categories** — ordered rungs on the primary anchor, gated by a secondary-anchor budget:
  - **Category 1**: $\le$ 15 min walking to Anchor A (~1.2 km radius).
  - **Category 2**: $\le$ 35 min walking to Anchor A (~2.8 km radius) — wider walking ring split from biking.
  - **Category 3**: $\le$ 15 min biking to Anchor A (~4 km radius).
  - **Category 4**: $\le$ 30 min biking to Anchor A (~7-8 km radius) — outer ring.
  - **Secondary Gate**: Every category additionally requires $\le$ 60 min commute to Anchor B; failing that, the offer is **outside** (`category = NULL`) no matter how close it is to Anchor A. Evaluate rungs in order (walk 15, walk 35, bike 15, bike 30) so a walkable offer is never labelled as a bike category. Compute walking time for every offer inside the routing radius so all categories and outside offers display a walk time. Store thresholds in `CommuteRules` and stamp every `commutes` row with a `rules_key` fingerprint (`COMMUTE_RULESET_VERSION`) so editing a threshold triggers re-routing on the next processing pass.

## 4. Multi-Signal Location Inference Engine (Geo-OSINT)
Brokers deliberately omit exact street addresses. The pipeline reconstructs coordinates through:
1. **Text & POI Triangulation**:
   - Extract mentions: street names and local district/estate names.
   - Extract public transport stops, line numbers, and walk distances (*"5 minut do przystanku"*).
   - Intersect radial buffers using OpenStreetMap Overpass API and municipal transit feeds.
2. **Visual & Solar OSINT (Vision AI)**:
   - Analyze window/balcony/terrace views: neighboring building height, facade color, roof style/color (e.g. red ceramic tile vs graphite flat roof).
   - Sun azimuth & shadow angles: analyze sunlight direction in photos using target-city solar coordinates (e.g., South-facing garden vs North-facing street).
   - Garden/terrace orientation matching against building orientation.
3. **Polish Cadastral & Aerial Ground-Truthing**:
   - Query GUGiK or municipal WFS services (e.g. `wfs.um.warszawa.pl` or regional geoportal WFS) for parcel shapes (*działki ewidencyjne*) and building footprints (*obrysy budynków*).
   - Match plot size ($m^2$) and building footprint against candidate parcels within the triangulated zone.
