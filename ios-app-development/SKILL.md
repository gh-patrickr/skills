---
name: ios-app-development
description: Use when creating, changing, building, testing, or shipping an iOS app in any workspace — "make an iPhone app", add a screen, fix a red build or failing test, add tests, or set up CI. Ships a deterministic XcodeGen pipeline (no Xcode GUI, no signing, no pbxproj merge conflicts), a Swift-package test layer that runs without Xcode, XCTest/XCUITest suites with page objects and accessibility audits, a coverage-gated evidence run, and an error→fix playbook.
---

# iOS app development

**Applies to:** any greenfield or existing iOS app. If the workspace already has an
`.xcodeproj`/`.xcworkspace`, read `references/project-generation.md` § *Adopt an existing
project* before generating anything — never regenerate over a project you did not create.

## The contract

A change is done only when all of these are true:

1. `scripts/verify.sh` exits `0` on this checkout (preflight → core tests → generate →
   build → unit tests → UI tests → coverage gate).
2. `artifacts/<run-id>/summary.md` exists and lists the counts, the coverage number and
   the artifacts (`.xcresult`, logs, screenshots).
3. No warning was introduced that you silenced with `@available`/`try!`/`-warnings-as-errors`
   exceptions; if you had to, say why in the summary.

A green compile is **not** evidence. A passing unit test is **not** evidence the app works.
Only the evidence run is.

Never: open Xcode, hand-edit `.xcodeproj`, ask the human to "press Run", provision a device,
or invent an `xcodebuild -destination`. The scripts resolve every destination by UDID.

## 0. Decide the shape (30 seconds, no questions)

| Situation | Do this |
| --- | --- |
| No project yet | `bash "$SCRIPTS/scaffold.sh" --name "MyApp" --bundle-id com.example.myapp --dest .` then follow §2. |
| `project.yml` exists | Edit it, never the generated project; go to §2. |
| Xcode project exists, no `project.yml` | Add `project.yml` that mirrors it, generate into a **separate** name, diff schemes, then retire the old project. See the reference. |
| Single screen or fix | Skip scaffolding; keep the existing layout and only add files the target already compiles (`sources` globs pick them up). |

Default every product question the human did not answer and record the assumption in
`docs/assumptions.md`: app name, bundle id, min iOS 18.0, Swift 6 language mode, SwiftUI +
Observation, in-memory persistence until told otherwise, English only. **Do not block on
questions you can default.**

## 1. Preflight — refuse to guess

`SCRIPTS` is this skill's `scripts/` directory (the sibling of this SKILL.md); a scaffolded
project also carries a copy in `scripts/apple/` so CI can run it.

```bash
bash "$SCRIPTS/preflight.sh" --platform ios
```

Exit `0` means ready. Exit `2` means a required piece is missing; the script prints the
exact command that fixes it. Typical on a fresh Mac: Xcode is not installed, only the
Command Line Tools (`~/…/CommandLineTools`). That cannot build an iOS app — say so, give
the user the one-line fix, and meanwhile run §3's core layer, which works without Xcode.

Never work around a missing Xcode with `swift build`, a hand-made `.app`, or a tutorial
project. Stop and report.

## 2. Generate, build, test

```bash
bash "$SCRIPTS/gen.sh"                    # xcodegen generate + verify schemes exist
bash "$SCRIPTS/build.sh" --scheme MyApp   # simulator build, unsigned, deterministic
bash "$SCRIPTS/test.sh" --scheme MyApp --only unit
bash "$SCRIPTS/test.sh" --scheme MyApp --only ui
bash "$SCRIPTS/verify.sh"                 # everything above + coverage gate + summary
```

All scripts accept `--root <dir>` (defaults to the nearest ancestor holding `project.yml`),
`--json` where noted, and `--help`. They write to `artifacts/<run-id>/`; never hand-roll an
`xcodebuild` command when a script covers it — the flags matter.

## 3. Test layers — write all of them, in this order

| Layer | Where | Tool | Runs without Xcode | Target |
| --- | --- | --- | --- | --- |
| Domain + view models | `Core/` Swift package | swift-testing | **yes** (`scripts/swift_test.sh`) | ~95 % of `Core` |
| App glue, persistence, networking | `AppTests/` | XCTest | no | ~80 % of `App` |
| Critical user journeys | `UITests/` | XCUITest + page objects | no | every journey, zero `sleep` |
| Rendering | snapshot tests (optional) | swift-snapshot-testing | no | design-system views only |
| Accessibility | `UITests/` | `performAccessibilityAudit()` | no | every top-level screen |

Rules that keep the suite green in CI:

- **Fakes over mocks.** Protocol + in-memory implementation, passed through an initializer.
  No singletons, no `Date()`, no `UUID()` inside logic — inject `Clock`/`now` and a seeded
  `RandomNumberGenerator`.
- **Every interactive element has an accessibility identifier** `screen.element.role`
  (e.g. `items.addButton`); UI tests query identifiers, never labels, except when asserting
  copy.
- **No `sleep`** — only `waitForExistence(timeout:)` / predicates. A test that needs a
  sleep is a bug in the app's testability.
- **UI tests launch a deterministic app**: `-ui-testing` argument + environment switch to
  in-memory store, seeded data, animations disabled, fixed locale `en_US`, `TZ=UTC`.

Details and copy-paste patterns: `references/testing.md` and `references/ui-testing.md`.

## 4. Architecture defaults (only deviate with a reason)

`App` (SwiftUI, `@MainActor`) → `Core` (view models with Observation, services behind
protocols) → adapters. One folder per feature, one type per file, no UI framework imports
inside `Core`. Full rules, including concurrency and navigation: `references/architecture.md`.

## 5. When something fails

Read `references/troubleshooting.md` and match the **first** error line, not the last.
Most failures are one of: wrong destination, missing simulator runtime, macro validation
prompt, package resolution drift, stale DerivedData, signing leaking into a simulator build.
Every one has a scripted fix. Do not delete `.build`/`DerivedData` as a first move — it
hides the cause and costs minutes.

## 6. Evidence and hand-off

`verify.sh` writes `artifacts/<run-id>/summary.md` plus `test.xcresult`, `junit.xml`,
`raw/*.log` and failure screenshots. Quote the summary's counts and coverage in your final
message; link the summary file. If UI tests were skipped, say so explicitly — never imply
coverage you did not run.

## Files

| Need | File |
| --- | --- |
| project.yml, targets, packages, plists, privacy manifest | `references/project-generation.md` |
| layering, DI, Observation, concurrency, accessibility, localization | `references/architecture.md` |
| swift-testing, fakes, clock, coverage | `references/testing.md` |
| XCUITest harness, page objects, audits, screenshots | `references/ui-testing.md` |
| artifacts, JUnit, CI workflow, caching | `references/evidence-and-ci.md` |
| error → cause → fix | `references/troubleshooting.md` |
| DSH plugins, MCP tools, external toolchain to install | `references/plugins.md` |

| Action | Script |
| --- | --- |
| check the machine, get exact fixes | `scripts/preflight.sh` |
| create a new project from templates | `scripts/scaffold.sh` |
| regenerate + validate the project | `scripts/gen.sh` |
| resolve a simulator UDID | `scripts/destinations.sh` |
| boot/erase/screenshot/privacy a simulator | `scripts/sim.sh` |
| build for simulator | `scripts/build.sh` |
| run unit or UI tests | `scripts/test.sh` |
| run the whole gate and write evidence | `scripts/verify.sh` |
| run the Core package tests without Xcode | `scripts/swift_test.sh` |
| typecheck Swift without Xcode (proxy gate) | `scripts/typecheck.sh` |
| summarise `.xcresult` → markdown + JUnit | `scripts/xcresult.py` |
| publish this skill to `~/.dsh/skills` | `scripts/publish.sh` |

Publishing: `bash "$SCRIPTS/publish.sh" --dry-run` shows the plan; without the flag it copies
this skill to `~/.dsh/skills/<name>`, backing up a changed copy under `~/.dsh/skill-backups/`
(never inside the scanned skills root). Use it after editing a skill here so every workspace
gets the change.

Templates under `templates/` are a complete compiling skeleton (list/detail feature, one
view model, fakes, unit tests, UI tests, CI). Copy with `scaffold.sh`; do not copy files by
hand one at a time — the script also substitutes names and bundle ids.
