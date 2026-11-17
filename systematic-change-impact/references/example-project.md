# Systematic change impact profile — Example Catalog Project

Reference implementation of the global `systematic-change-impact` skill. Shows how a
stateful catalog project wires its state map, blast-radius measurement, and rebuild gates.

## State map

| Store | Kind | Notes |
| --- | --- | --- |
| `data/catalog.duckdb` | DuckDB file + WAL | live catalogue; the web server is the only writer |
| `extracted`, `listings.current_version` | derived from the raw lake | versioned by `EXTRACTOR_VERSION` / `PIPELINE_VERSION` |
| `locations`, `commutes` | derived | rebuilt by the processing pass; `commutes.rules_key` identifies the rule set |
| `property_groups`, `group_members` | derived | rebuilt globally by the dedupe job |
| `media_hashes` | derived | content hash index |
| raw lake, media files | immutable input | never rewritten; replay source |
| human-data tables | protected | only through the documented helpers |

## Writer and supported paths

- The **web server is the only DuckDB writer**. If one is running, CLI `crawl`/`process`/
  `repair` submit over HTTP.
- If none is running, the CLI owns the DB through an embedded foreground UI for the job;
  never auto-launch a detached server.
- Dedupe/grouping rebuild: `POST /api/jobs {"kind":"dedupe"}` on the running server.
- Extraction change: bump the version constant, replay from the raw lake
  (`process --rebuild`, scoped to the source when possible), then rebuild groups.
- Protected data: `catalog human-data verify` plus a backup; never `DELETE`/`DROP`.

## Blast-radius recipe

```bash
rm -rf /tmp/impact && mkdir -p /tmp/impact
cp data/catalog.duckdb data/catalog.duckdb.wal /tmp/impact/
ln -s "$PWD/data/media" /tmp/impact/media
```

Run baseline and candidate over the same copy; record groups before → after, changed
groups and their members, the targeted population, and a safety sample of items that
must not merge.

## Definition of done specifics

`catalog human-data verify` passes, `scripts/runtime_health.py` exits `0`, and the numbers
are written to `log.md` and the final answer.

## Worked examples (synthetic dedupe cases)

1. Reported: four IDs of one sample listing not grouped. Measurement showed the pair-only fix
   would miss the class: exact-copy records also appeared twice on one source, and the
   gallery was boilerplate-filtered. Added the exact-copy layer, rebuilt globally: 555 →
   557 groups, 1,874 → 1,881 grouped listings, 3 changed groups inspected.
2. Reported: `source_a/100001` + `source_b/200002`. Measurement of the whole snapshot found
   the class: **room-count taxonomy** (`10` vs the `99` sentinel, `3` vs `4`). 11 of the 13
   affected clusters were not the reported pair. Removing rooms from the copy-identity gate
   re-evaluated 352 clusters, changed 13 (+43 listings), and merged all four offers of
   Listing Alpha. Both fixes were applied with a global `dedupe` job and verified live.

## Related skills

- `runtime-health-verification` — restart and re-probe after a rebuild.
- `okf-architecture-maintenance` — regenerate folder docs when tables/jobs change.
- `clean-checkout-delivery` — record before/after numbers in the commit body.
