# Evidence, determinism and CI

## Artifacts

Every run writes one directory, never reuses an old one:

```
artifacts/2026-10-31T13-54-26Z/
  summary.md            # what a human reads: counts, coverage, pass/fail per step
  junit.xml             # what CI reads
  test.xcresult         # unit + UI results, attachments
  core.xcresult         # swift test results (coverage)
  attachments/          # failure screenshots, exported from the xcresult
  raw/
    preflight.log
    generate.log
    build.log
    unit.log
    ui.log
```

`verify.sh` prints the summary path as its last line. Your final message quotes it — not
your memory of the log.

## Summary format

```markdown
# Verify — MyApp — 2026-10-31T13:54:26Z

| Step | Result | Detail |
| --- | --- | --- |
| preflight | pass | Xcode 26.0, iOS 26.0 runtime, xcodegen 2.44.1 |
| generate | pass | 3 targets, 1 scheme |
| core tests | pass | 42 tests, 0 failures, coverage 94.1% |
| build | pass | Debug, iphonesimulator26.0, unsigned |
| unit tests | pass | 18 tests, 0 failures |
| ui tests | pass | 7 tests, 0 failures |
| coverage | pass | app 81.3% (min 75%) |

Artifacts: `test.xcresult`, `junit.xml`, `raw/*.log`
```

Failures name the test and the first assertion line, plus the screenshot path.

## Determinism flags

The scripts pass these; do not remove them to "make it work":

| Flag | Why |
| --- | --- |
| `-destination platform=iOS Simulator,id=<UDID>` | Names change between Xcode releases; UDIDs do not. |
| `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""` | Simulator builds must never touch a signing identity. |
| `-derivedDataPath <root>/DerivedData` | One cache per checkout, no global drift. |
| `-resultBundlePath <unique>` | `xcodebuild` refuses to overwrite a bundle. |
| `-skipMacroValidation` | Otherwise macros fail in non-interactive runs. |
| `-skipPackagePluginValidation` | Same for build plugins. |
| `-onlyUsePackageVersionsFromResolvedFile` | Fails loudly on resolution drift instead of silently updating. |
| `-test-timeouts-enabled YES -default-test-execution-time-allowance 120` | A hung test fails instead of blocking CI. |
| `-parallel-testing-enabled NO` (UI) / `YES` (unit) | UI parallelism is the top flake source. |
| `TZ=UTC LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` | Date/format assertions stay stable. |

## CI

`.github/workflows/ios.yml` (template) does: checkout → install `xcodegen xcbeautify` →
`preflight.sh --ci` → `verify.sh --ci`. Keep the gate identical to local. A CI that runs a
different subset than `verify.sh` is a false sense of safety.

```yaml
- uses: actions/checkout@v4
- run: brew install xcodegen xcbeautify swiftlint
- run: bash scripts/verify.sh --ci --coverage-min 0.75
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: evidence, path: artifacts/ }
```

- Pin the runner image (`macos-15`, `macos-26`) rather than `macos-latest` once the project
  is real; simulator runtimes differ.
- Pin the Xcode version with `xcodes`/`setup-xcode` and record it in `.xcode-version`.
- Cache `DerivedData` only for the same Xcode version and lockfile hash; otherwise it costs
  more than it saves.
- Upload `artifacts/` with `if: always()`. A failed run without evidence is a wasted run.

## Version pinning

```
.xcode-version       # 26.0
mise.toml            # xcodegen = "2.44.1", swiftlint = "0.57.1"
```

`preflight.sh` warns when the installed versions differ from these files. That warning is
how "works on my machine" becomes visible before CI does.

## Reporting to the human

- Pass: one paragraph, the table, the coverage numbers, the summary link.
- Fail: the first failing step, the exact error line, the fix you applied or why you stopped.
- Never claim a step ran because a script exists. Quote its exit status and the summary line.
- If UI tests were skipped (`--skip-ui`), say "UI tests not run" in the first sentence, not
  in a footnote.
