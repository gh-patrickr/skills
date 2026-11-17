---
name: rust-workspace-disk-hygiene
description: Shrink and bound a Cargo `target/` directory — including statically bundled C/C++ sys crates such as DuckDB, SQLite, RocksDB or Arrow — on a disk-constrained machine without giving up usable debugging.
whenToUse: Use when `rust/target` or `target/` is tens of GB, a VM or CI runner is running out of disk, a link step fails with "No space left on device", a workspace bundles a large C/C++ library, or before changing profile settings, features, `RUSTFLAGS` or the toolchain.
---

# Rust workspace disk hygiene

## The fact that explains almost every huge `target/`

Cargo **never garbage-collects old build units**. Every change to a profile setting, a feature
set, a dependency version, a toolchain or `RUSTFLAGS` creates a new fingerprint and writes a
**complete new build unit** next to the previous ones. `target/` grows as
`number of configurations ever built × size of one unit`, forever.

Measured example (2026-10-31, aarch64 macOS VM, 12 vCPU): a 10-crate workspace with DuckDB had
reached **68 GB / 231,114 files** — about eight stacked copies of one 8.5 GB clean build. `cargo
clean` reported **68.2 GiB** (cargo's tally is authoritative; `du` showed 63–65 GB because of
APFS/`du` accounting). Deleting took 45 s; one rebuild took 2m22s.

So there are exactly two questions to answer:

1. **How big is one build unit?** → shrink it (steps 2–3).
2. **How many units are lying around?** → `cargo clean` at the right moments (steps 1 and 4).

## 60-second diagnosis

```bash
du -sh target
du -sh target/debug/* 2>/dev/null | sort -h | tail -8
find target/debug/deps -maxdepth 1 -type f -size +100M -exec ls -lh {} \; | sort -k5 -h | tail -15
cargo clean --dry-run | tail -3          # what cargo itself would delete, in GiB
```

Read the result against this table:

| Where the GB are | Meaning | Fix |
| --- | --- | --- |
| `deps/` dominates, with many ~150–200 MB **executables** | every test/example binary embeds a statically linked C library | step 3 |
| `deps/` dominates, mostly `.rlib` | full debuginfo for dependencies | step 2 |
| `build/<sys-crate>-*` entries of 0.6–3 GB each, several per package | duplicated bundled C++ builds | step 2 (`debug = false` for that package) + `cargo clean -p` |
| `incremental/` of several GB | incremental artifacts (on by default in dev/test) | step 2 (`incremental = false`) |
| `examples/` large | benches/examples linking the same static lib | step 3, or build them on demand |
| everything moderate but N copies | stale units | step 1 |

## Step 1 — reclaim stale units first (no source change)

`cargo clean` is always safe: everything is reproducible offline from `Cargo.lock` plus the
registry cache. Measure what it costs first:

```bash
cargo clean --dry-run | tail -2                # prints the total
time cargo clean                               # then actually delete
time cargo build --workspace --all-targets     # know your rebuild cost
```

Targeted alternatives are cheaper when you only changed one thing:

```bash
cargo clean -p libduckdb-sys      # before/after changing that package's features
cargo clean --profile dev         # drop one profile's units only
rm -rf target/debug/incremental   # safe, always regenerated
```

## Step 2 — bound the size of one unit (`Cargo.toml`)

```toml
# Dependencies are never stepped through: no debuginfo at all.
[profile.dev.package."*"]
debug = false
[profile.test.package."*"]
debug = false

# Workspace code keeps file:line in backtraces and lldb, without variables/types.
[profile.dev]
debug = "line-tables-only"
incremental = false

# Keep this identical to [profile.dev]: differing settings give `cargo test` its own
# second copy of every unit (a 2x tree).
[profile.test]
debug = "line-tables-only"
incremental = false
```

Measured effect on the same tree: 8.5 GB → 7.1 GB, 2m22s → 1m51s, and (because dev and test
are now identical) `cargo test --no-run` reused the existing units and added **0 GB**; a full
`cargo clippy --all-targets` added 0.1 GB. Touching a crate and rebuilding all targets took 4 s
without incremental — incremental only bought seconds here.

Debugging tradeoff:

| `debug =` | Backtrace | Breakpoints/locals | Size |
| --- | --- | --- | --- |
| `2` / `true` | file:line + args | full | 100% |
| `"line-tables-only"` | file:line | source stepping, no locals | ~85% of full here |
| `false` / `0` | symbol names only | no | smallest |

Rules of thumb:

- Dependency debuginfo is the largest *Rust* lever (arrow/duckdb/serde/tokio trees); disable it
  for the whole dependency closure with the `"*"` glob and keep line tables for your own crates.
- A bundled C/C++ sys crate is also a **build script** package: `debug = false` for it turns a
  1.6 GB `libduckdb.a` into a 349 MB one (C++ debuginfo is huge).
- `incremental = false` is usually a win on VMs: the artifacts are the most volatile part of the
  tree and full rebuilds of a mid-size workspace are minutes, not hours. Measure one `touch` +
  rebuild before deciding.
- Release profile: `strip = "debuginfo"` (or `"symbols"`), `lto`/`codegen-units = 1` shrink and
  speed the shipped binary but not the dev tree.
- One-off deep debugging without editing the manifest: `cargo build --config
  'profile.dev.debug=2'` — this writes a **second** unit, so `cargo clean` afterwards.

## Step 3 — stop embedding a static C library in every binary (biggest lever)

If `du` shows dozens of 150–200 MB executables, the C library is being linked statically into
each test binary. That is normal per-binary behaviour and pathological at scale: in the measured
workspace **29 executables × 165–197 MB = 5.0 GB** of a 7.1 GB tree, while all `.rlib`s together
were 0.8 GB. Removing Rust debuginfo only recovered 1.4 GB; the static C library was the cost.

Diagnose:

```bash
find target/debug/deps -maxdepth 1 -type f ! -name '*.rlib' ! -name '*.rmeta' ! -name '*.d' \
  -exec stat -f '%z %N' {} \; | sort -rn | head -10      # macOS
# GNU: find ... -printf '%s %p\n' | sort -rn | head -10
otool -L target/debug/deps/<a-test-binary> | grep -i duckdb   # macOS: expect the shared lib
ldd target/debug/deps/<a-test-binary> | grep -i duckdb        # Linux
nm -a target/debug/deps/<x>.rlib | grep -c debug_info         # 0 when dep debuginfo is off
```

Fix — link the library once:

1. **If the crate supports a system/prebuilt library mode, use it.** Most `*-sys` crates accept an
   env var or a non-`bundled` feature: `DUCKDB_LIB_DIR`, `SQLITE3_LIB_DIR`, `ROCKSDB_LIB_DIR`,
   `PKG_CONFIG_PATH`, `OPENSSL_DIR`, `PROTOBUF_PROTOC`, … Consult the crate's `build.rs`.
2. **Otherwise build the static bundle once in a throwaway project and link it into a shared
   library.** The sys crate is usually only buildable in `bundled` mode, so:

   ```bash
   # a standalone package OUTSIDE the workspace (it needs its own [workspace] table),
   # depending on the sys crate with bundled features and `[profile.dev] debug = false`
   cargo build --offline --manifest-path /tmp/bootstrap/Cargo.toml
   # take <target>/debug/build/<sys>-*/out/lib<name>.a and link it once:
   c++ -dynamiclib -o libfoo.dylib -Wl,-force_load,libfoo.a \
       -Wl,-install_name,/abs/path/libfoo.dylib -Wl,-dead_strip      # macOS
   c++ -shared -o libfoo.so -Wl,--whole-archive libfoo.a -Wl,--no-whole-archive \
       -Wl,-soname,libfoo.so                                         # Linux
   ```

   Details that matter:
   - Pin the version to the workspace `Cargo.lock` so the C ABI matches the crate's pre-generated
     Rust bindings; the sys crate ships the exact sources, so compile **those** (its tarball)
     rather than a system copy.
   - `-fPIC` for the objects on Linux (`CXXFLAGS=-fPIC` when bootstrapping) or the shared link
     fails; macOS arm64 objects are PIC by default.
   - Bake an **absolute** `install_name`/`soname`: then no `DYLD_LIBRARY_PATH`/`LD_LIBRARY_PATH`
     is needed at test time and every binary in `target/` finds it.
   - `-dead_strip`/`--gc-sections` cut the library roughly in half in practice.
   - Delete the bootstrap target tree afterwards; keep only the shared library.
3. **Wire it up** with a tiny `build.rs` in the crate that depends on the sys crate:
   ```rust
   println!("cargo:rustc-link-search=native={}", lib_dir.display());
   println!("cargo:rerun-if-changed={}", lib_path.display());
   ```
   and `panic!` with the exact bootstrap command when the file is missing — a clear build error
   beats 29 undefined-symbol link failures.
4. **Keep the artefact out of `target/`** (so `cargo clean` does not delete it), out of git, and
   under a version stamp so a `duckdb` bump rebuilds it instead of silently linking stale code.

Measured outcome of the whole recipe: 7.1 GB → **1.3 GB** and 1m51s → **27 s** per clean build,
because the C++ compile disappears too (a full `cargo test` plus `clippy --all-targets` settles
at ~1.5 GB). Test binaries fell from 165–197 MB to 30–41 MB each: they still link the Rust
crates statically, just not DuckDB.

Caveats to state honestly:

- Binaries are no longer self-contained: a shipped/release artefact must bundle the shared
  library (or keep a static release build behind a feature).
- One extra bootstrap step per checkout, and again after a sys-crate version bump.
- Version/feature drift between the prebuilt library and `Cargo.lock` is a silent ABI hazard;
  stamp it and rebuild on mismatch.
- Check whether a **wrapper-crate convenience feature silently re-enables bundling**: in
  `duckdb-rs`, `features = ["json"]` is defined as `["libduckdb-sys/json", "bundled"]`, so asking
  for JSON also selects the static build. Compile the extension into the shared library instead
  (`DUCKDB_EXTENSION_JSON_LINKED` in the bundled build) and drop the wrapper feature.
- macOS deployment-target "was built for newer macOS" warnings are harmless.

## Step 4 — keep it small

- **`cargo clean` before switching toolchain, profile settings, `RUSTFLAGS`, or a sys-crate's
  features.** That replaces the unit instead of stacking a second one; it is the only thing that
  makes the directory grow back.
- Set a budget (about 1.5–2× one clean build) and check it in the same command you already run:
  `du -sh target`. Above the budget it is stale units, not real artefacts.
- Build only what you need: `cargo test -p <crate>` while iterating, `--workspace` before
  committing; avoid `--all-targets` if only the lib changed.
- `sccache`/`ccache` save *time*, not disk — the cache itself grows by GB. Do not enable them as
  a disk fix.
- CI caches (`Swatinem/rust-cache`, Actions cache) also accumulate; keep the key on `Cargo.lock`
  and let old keys expire. Prefer a fresh runner over a 30 GB cache.
- `.rustup` can hold duplicate toolchains: `rustup toolchain list -v`; byte-identical versions
  can be uninstalled. Keep `~/.cargo/registry` (hundreds of MB) so builds work offline.
- Never delete `target/` under a running build (cargo holds locks); `cargo clean` is otherwise
  always safe and needs no network.

## Verification checklist

```bash
cargo clean && cargo build --workspace --all-targets   # one unit, measured time
du -sh target                                          # budget
cargo test --no-run && du -sh target                    # must not grow (dev == test profiles)
cargo test --workspace                                  # behaviour unchanged
touch crates/<app>/src/lib.rs && time cargo build --workspace --all-targets   # edit loop
nm -a target/debug/deps/*.rlib 2>/dev/null | grep -c debug_info                # 0 for deps
otool -L /path/to/test-binary | grep <libname>          # shared, not embedded
du -sh target/debug/deps/* | sort -h | tail -5          # no giant executables left
```

Numbers from the measured case, useful as calibration: one clean all-targets build 8.5 → 7.1 →
1.3 GB (incremental → 27 s); `cargo clean` of the 68 GB tree took 45 s; a shared libduckdb
155 MB exported 1,182 C symbols;
`cargo clean --dry-run` / `cargo clean` report GiB, `du` reports GB.
