---
name: systematic-change-impact
description: ALWAYS use before reporting any change that can alter persisted or derived state — database rows, derived tables, search indexes, caches, generated artefacts, migrations or backfills — in any project. Forces a systematic-versus-one-off decision, a measured blast radius on a snapshot, and the supported reprocessing or migration path, so a fix for one reported case cannot leave the rest of the catalogue wrong. Includes a DreamHome Warsaw profile with worked examples.
---

# Systematic change impact (always-on)

**Applies to:** any project that stores state and derives something from it — a database
with derived tables, a search index, a cache, a generated corpus, a materialised view, a
reporting snapshot.

It does **not** apply to a purely presentational change that reads existing state without
altering it. If the change can make previously processed records wrong, it applies.

The recurring failure this skill prevents is **whack-a-mole**: one reported bad record gets
fixed, the next report exposes the same class of bug, and the stored state was never
re-evaluated. A green unit test for the reported example proves almost nothing about the
rest of the corpus. This skill makes the data question part of "done".

## 1. Does this change touch stored or derived state?

Signals that it does:

- migrations, schema files, ORM models, raw SQL, view/materialised-view definitions;
- ingest/parse/extract, normalisation, identity or dedupe keys, thresholds, ranking;
- enrichment, geocoding, routing, pricing or classification rules;
- search-index/schema changes, cache key or cache-invalidation changes;
- generated artefacts that are committed or served (reports, static pages, embeddings);
- backfills, reprocessing jobs, scheduled pipelines.

Signals that it does not: copy, CSS, a read-only view, a test-only change. Say so
explicitly and stop.

## 2. Map the state and its writer

Before editing, write down:

- **Stores** — every database, index, cache, object store or generated tree that can change.
- **Writer** — the single component allowed to write (server, CLI, job runner). Find the
  rule in `AGENTS.md`/`README`/architecture docs; if there is no single writer, treat that
  as a finding and avoid concurrent writes while measuring.
- **Protected state** — human-entered data, append-only raw data, media, audit logs. These
  must never be rewritten by a reprocessing step.
- **Supported path** — the job, CLI command, migration or API that is allowed to apply the
  change. Hand-editing derived state is not a supported path.

## 3. The four-question gate — answer all four before reporting

1. **Is this a one-off correction or a rule/class change?**  If it changes a parser,
   threshold, identity key, normalisation, route rule, index mapping or schema, it is a
   **class change** by default.
2. **Which stored rows/tables/keys can it change?**  List them explicitly. Include
   downstream stores derived from them.
3. **How large is the effect on the live corpus?**  Measured on a snapshot: how many
   records/rows/groups change, and a review of *every* changed cluster, not only the
   reported one.
4. **Which supported operation applies it, and what proves the result?**  Job/CLI/migration,
   version bump if needed, before/after counts, target example, protected-data check,
   runtime probe.

If you cannot answer 2–4 with numbers, the task is not finished. A test is evidence for the
rule, never evidence that the stored data was updated.

## 4. Classify the change

| Change | Stored state typically affected | Required re-evaluation |
| --- | --- | --- |
| Parser / extraction / ingest | raw-derived records, then everything downstream | bump the extractor/version constant, replay from immutable raw input |
| Identity / dedupe / grouping | grouping tables or keys | full rebuild of the grouping, not a per-report patch |
| Enrichment / routing / classification | enrichment tables keyed by rule version | reprocess the affected population with the new rule |
| Schema / migration | the whole store | append-only migration, backup first, protected-data check, restart + probe |
| Protected-data helper | protected tables | project verify command + backup; never `DELETE`/`DROP` |
| Index / cache / generated artefacts | index documents, cache entries, generated files | invalidate and rebuild through the writer |
| UI / query / template only | none | no rebuild; still run the runtime probe |

**Default assumption: systematic.** "One-off" is allowed only for a genuinely single-record
correction, and even then prefer a durable rule plus a reevaluation over hand-editing.

## 5. Measure the blast radius on a snapshot (never on the live writer)

1. Take a consistent snapshot using the project's method: copy the database file with its
   WAL/journal, `pg_dump`, a read replica, an index snapshot, or a copy of the generated
   tree. Record the snapshot time.
2. Keep a baseline and a candidate: the old rule and the new rule over the *same* snapshot.
   Ways to get the baseline:
   - keep a second copy and disable the new stage (monkeypatch it to `[]`);
   - `git stash` the change and run the old code against the same copy;
   - serialise the old result before applying the change.
3. Diff the derived rows and report:
   - counts before → after (records, groups, index documents, cache entries);
   - the full list of changed clusters, each inspected (members, source, evidence signal);
   - the population the new rule targets;
   - a safety sample proving the rule did **not** collapse things that must stay apart.
4. Never open the live store read-write while the writer runs, and never point the candidate
   build at production data.

Minimal diff harness (adapt the store and keys):

```python
def load(path):
    # read-only connection to a snapshot; return {group_id: {(source, record_id), ...}}
    ...

before = load("snapshot-before")
after = load("snapshot-after")
changed = {k for k in before.keys() | after.keys() if before.get(k) != after.get(k)}
print(f"{len(before)} -> {len(after)} groups, {len(changed)} changed")
```

For a rule change, **a case-specific test is mandatory but insufficient**: add the reported
example *and* at least one test for the class (sentinel/missing value, taxonomy difference,
duplicate source, similar records that must stay apart).

## 6. Decide one-off vs systematic (and write it down)

Systematic if any of these is true:

- the fix changes a threshold, identity key, normalisation, filter, index mapping or parser;
- the same condition can occur on other records (query the snapshot for the population);
- the reported case was produced by data that already exists for other records.

When in doubt, treat it as systematic. Say so explicitly in the final answer
("systematic: 13 clusters / 43 records re-evaluated").

## 7. Apply it through the supported path

- Use the project's job/CLI/migration. Never `INSERT`/`UPDATE` derived state by hand.
- Raw input is immutable; replay from it with a bumped version instead of mutating history.
- A grouping/identity change needs a **global** rebuild; a scoped rebuild splits records
  that should stay together.
- "The next crawl/import will fix it" is **not** a migration: records that are no longer
  fetched will never be corrected, and the user sees the wrong state meanwhile.
- Take a backup before a migration or destructive rebuild.

## 8. Definition of done

- [ ] Systematic/one-off decision written down, with the affected stores.
- [ ] Blast radius measured on a snapshot (before → after counts).
- [ ] Every changed cluster inspected; nothing that must stay apart was collapsed; no
      protected row touched.
- [ ] Reported example **and** its class covered by tests; safety test added.
- [ ] Live reprocessing/migration run through the supported path.
- [ ] Target example verified in the live store **and** in the user-visible surface.
- [ ] Protected data unchanged, runtime probe green (when a service runs).
- [ ] Numbers recorded in the project log/`log.md` and the final answer.

## Anti-patterns (all are failures)

- Fixing only the reported case plus a test and declaring victory.
- Substituting a green test suite for a reevaluation of stored state.
- Rebuilding only the reported slice when the rule is global.
- Editing the live store with ad-hoc SQL while the writer runs.
- Waiting for the next ingest to apply a rule change.
- Adding a rule without measuring how many existing records change — the next report is
  already in the data.

## Project profiles

Concrete stores, commands and worked examples for specific projects:

- DreamHome Warsaw — [`references/dreamhome-warsaw.md`](references/dreamhome-warsaw.md)
  (DuckDB catalogue, derived tables, job paths, two measured dedupe rebuilds).
- Orbital Delivery (`ag_sternendenker`) — [`references/orbital-delivery.md`](references/orbital-delivery.md)
  (18 solver-verified Solar System campaign JSONs, back-rotated orbiting gravity assists, lateral aphelion detuning, downstream 3★ buoy divergence, and headless Mesa EGL/GLES3 + stereo audio playthrough recording).

When you onboard another stateful project, add `references/<project>.md` with its stores,
writer, protected data, migration command and measurement recipe — and keep this file
generic.
