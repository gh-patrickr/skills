# Systematic change impact profile — DreamHome Warsaw

Reference implementation of the global `systematic-change-impact` skill. Everything here is
DreamHome's concrete configuration.

## State map

| Store | Kind | Notes |
| --- | --- | --- |
| `data/dreamhome.duckdb` | DuckDB file + WAL | live catalogue; the web server is the only writer |
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
  (`process --rebuild`, scoped to the portal when possible), then rebuild groups.
- Protected data: `dreamhome human-data verify` plus a backup; never `DELETE`/`DROP`.

## Blast-radius recipe

```bash
rm -rf /tmp/dhimpact && mkdir -p /tmp/dhimpact
cp data/dreamhome.duckdb data/dreamhome.duckdb.wal /tmp/dhimpact/
ln -s "$PWD/data/media" /tmp/dhimpact/media
```

Run baseline and candidate over the same copy; record groups before → after, changed
groups and their members, the targeted population, and a safety sample of developments that
must not merge.

## Definition of done specifics

`dreamhome human-data verify` passes, `scripts/runtime_health.py` exits `0`, and the numbers
are written to `log.md` and the final answer.

## Worked examples (2026-10-27, dedupe)

1. Reported: four ids of one Mokotów flat not grouped. Measurement showed the pair-only fix
   would miss the class: exact-copy adverts also appeared twice on one portal, and the
   gallery was boilerplate-filtered. Added the exact-copy layer, rebuilt globally: 555 →
   557 groups, 1 874 → 1 881 grouped listings, 3 changed groups inspected.
2. Reported: `otodom/68240315` + `gratka/48343353`. Measurement of the whole snapshot found
   the class: **room-count taxonomy** (`10` vs the `99` sentinel, `3` vs `4`). 11 of the 13
   affected clusters were not the reported pair. Removing rooms from the copy-identity gate
   re-evaluated 352 clusters, changed 13 (+43 listings), and merged four offers of the
   Belgijska flat. Both fixes were applied with a global `dedupe` job and verified live.

## Related skills

- `runtime-health-verification` — restart and re-probe after a rebuild.
- `okf-architecture-maintenance` — regenerate folder docs when tables/jobs change.
- `clean-checkout-delivery` — record before/after numbers in the commit body.
