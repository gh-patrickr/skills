# Agent Skills Library

Workspace-independent library of agent skills for [DeepSeek Harness][dsh] and compatible
coding agents (`~/.dsh/skills`, `~/.agents/skills`, `~/.gemini/config/skills`). Installing
once into the user skills directory makes every skill available across **every** workspace
without per-project duplication.

The point of this repository is one canonical copy. Workspace-local copies are how skills
rot: they shadow the global file, drift silently, and edits to this repo stop mattering.
Do not vendor skills into projects; symlink only if a project truly must pin one.

## Skill catalog

### Engineering & delivery workflows

| Skill | Purpose |
| --- | --- |
| [`clean-checkout-delivery`](clean-checkout-delivery/SKILL.md) | Discover projects, bootstrap git safely, baseline dirty trees, work on feature branches, scan for privacy/secrets, pass gates, and push. |
| [`github-actions-ci`](github-actions-ci/SKILL.md) | Check GitHub Actions runs at start/end of work, inspect failing logs, fix locally, push, and wait for green CI. |
| [`okf-architecture-maintenance`](okf-architecture-maintenance/SKILL.md) | Keep `ARCHITECTURE.md` and `index.md` synced in repositories using Open Knowledge Format (OKF v0.1). |
| [`runtime-health-verification`](runtime-health-verification/SKILL.md) | Probe live services/dev servers after changes, restart when stale, and verify runtime health instead of trusting unit tests alone. |
| [`systematic-change-impact`](systematic-change-impact/SKILL.md) | Measure blast radius on snapshots and reprocess affected populations systematically when changing stored/derived state. |

### Migrations & toolchain optimization

| Skill | Purpose |
| --- | --- |
| [`python-to-go-reimplementation`](python-to-go-reimplementation/SKILL.md) | Behavior-first parity matrix, frozen-oracle testing, vertical slices, and cutover checklist for Python-to-Go ports. |
| [`python-to-rust-reimplementation`](python-to-rust-reimplementation/SKILL.md) | Parity-matrix, frozen-oracle, seam-first, and vertical-slice workflow for Python-to-Rust ports. |
| [`rust-workspace-disk-hygiene`](rust-workspace-disk-hygiene/SKILL.md) | Diagnose and shrink bloated Cargo `target/` trees (including statically bundled C/C++ `*-sys` crates). |

### App, device & game development

| Skill | Purpose |
| --- | --- |
| [`ios-app-development`](ios-app-development/SKILL.md) | Deterministic XcodeGen, Swift Package core tests, XCTest/XCUITest, accessibility audits, and coverage gates for iOS. |
| [`apple-watch-app-development`](apple-watch-app-development/SKILL.md) | Independent and companion watchOS apps, complications, Digital Crown, haptics, and watch simulator verification. |
| [`adb-wifi-debugging`](adb-wifi-debugging/SKILL.md) | Connect, pin ports, install APKs, capture screenshots, inject input, and profile frame-time/memory over Wi-Fi ADB. |
| [`webgame-development`](webgame-development/SKILL.md) | Deterministic TypeScript + Vite + Canvas 2D starter, seeded test bridge, Playwright E2E/visual/a11y, headless bots, and FPS budgets. |
| [`game-requirement`](game-requirement/SKILL.md) | Turn German-language game ideas from kids into testable English specs, kid-readable German mirrors, and open-question lists. |

### Data pipelines, scraping & presentations

| Skill | Purpose |
| --- | --- |
| [`polish-property-scraping`](polish-property-scraping/SKILL.md) | Two-stage decoupled scraping, stealth browser patterns, and anonymized fixture testing for Polish real estate portals. |
| [`real-estate-data-pipeline`](real-estate-data-pipeline/SKILL.md) | Hybrid raw-lake + SQL/JSONB lineage, cross-portal deduplication, multi-anchor commute geo-filtering, and pipeline testing. |
| [`consulting-deck`](consulting-deck/SKILL.md) | Build board-grade `.pptx` decks from compact YAML specs with measured text fitting, native charts/tables, and visual QA. |

## How discovery works

The filesystem provider merges skill roots in this order, first match wins per name:

| Rank | Source | Path |
| --- | --- | --- |
| 100 | project | `<project>/.dsh/skills` |
| 200 | project | `<project>/.agents/skills` |
| 300 | custom | `customSkillDirs` in the profile |
| 400 | **user** | `~/.dsh/skills` ← canonical user clone |
| 500 | cross-tool | `~/.agents/skills` |
| 600 | bundled | skills shipped with a plugin |

Consequences:

- A same-named project skill silently hides the global one. Keep projects clean.
- The project root is the nearest ancestor with `.git`; without one, the session cwd.
- Only `<root>/<name>/SKILL.md` and `<root>/<name>.md` at depth 1 are discovered.
- Bodies are re-read on every load and roots are watched, so edits need no restart.

## Layout

```
skills/
├── README.md                      # this file
├── .githooks/pre-commit           # runs privacy/secret scan + skill validation on staged files
├── scripts/
│   ├── check_privacy.py           # secret, PII, and private-data scanner (also runs in CI)
│   ├── install_hooks.sh           # sets core.hooksPath=.githooks
│   ├── test_check_privacy.py      # unit tests for check_privacy.py
│   └── validate_skills.py         # frontmatter/link gate (also runs in CI)
├── .github/workflows/validate.yml
├── clean-checkout-delivery/       # always-on: project discovery, git bootstrap, delivery
├── okf-architecture-maintenance/  # always-on where an OKF bundle exists
│   └── references/example-project.md
├── runtime-health-verification/   # always-on where a service runs
│   ├── references/example-project.md
│   └── references/probe-template.py
├── systematic-change-impact/      # always-on for stored/derived state
│   └── references/example-project.md
└── <skill-name>/SKILL.md + optional references/, scripts/, templates/
```

## Authoring a skill

```
<skill-name>/
├── SKILL.md          # required, with YAML frontmatter
├── references/       # optional deep-dive docs loaded on demand
├── scripts/          # optional executables the skill tells the agent to run
└── templates/        # optional project scaffolds
```

`SKILL.md` frontmatter:

```yaml
---
name: kebab-case-matching-the-directory
description: One line, single line, written as a trigger condition — what the task looks like, not just what the skill contains.
---
```

Rules:

- `name` must be kebab-case and equal the directory name.
- `description` is the **trigger**. Start with when to use it, then what it does. Keep it a
  single line; a newline breaks the catalog entry.
- Optional keys: `whenToUse`, `metadata`, `disable-model-invocation`, `user-invocable`.
  `disable-model-invocation: true` removes the skill from the model catalog — rarely wanted.
- Put project-specific paths, ports, tables and commands in `references/<project>.md` (or in
  project-local files), not in the skill body. Keep shared skills free of private info.

## Validate & Pre-commit Privacy Hook

Enable the repository's pre-commit hook once per clone:

```bash
bash scripts/install_hooks.sh
```

This configures `git config core.hooksPath .githooks`, so every `git commit` runs:

```bash
python3 scripts/check_privacy.py --staged
python3 scripts/validate_skills.py
```

Manual / CI full-tree checks:

```bash
python3 scripts/validate_skills.py
python3 scripts/check_privacy.py --all
python3 -m unittest scripts/test_check_privacy.py
```

`validate_skills.py` checks every top-level skill directory: frontmatter parses, `name`
matches the directory, `description` is present and single-line, and relative links in
`SKILL.md` resolve.

`check_privacy.py` blocks private keys, API tokens, credentials, sensitive files (`.env`,
`device.properties`, databases), RFC 1918 LAN IPs, MAC addresses, non-example emails,
local `/Users/<name>` paths, phone numbers, and high-precision GPS coordinates. Fix any
findings before committing.

To block household- or organization-specific terms (names, streets, workplaces, internal
codenames) without storing those terms inside the shared repository, list them one per
line in `~/.config/dsh-skills/privacy-blocklist.txt` (or set `PRIVACY_BLOCKLIST_FILE`).

## Git workflow

```bash
git status                       # keep the tree clean between sessions
git diff                         # review before staging
git add <paths>                  # stage by path, not -A
git commit -m "..."              # one concern per commit
```

Edits here are live for the next agent step — no reinstall, no restart. Commit when the
change is coherent so the next workspace (and the next machine) gets the same version.

## Installation & Publishing

Clone into your global skills directory and enable the pre-commit hook:

```bash
git clone https://github.com/<owner>/skills.git ~/.dsh/skills
cd ~/.dsh/skills && bash scripts/install_hooks.sh
```

For other tools that read `~/.agents/skills` or `~/.gemini/config/skills`, symlink them to
the same clone so there is only one canonical copy:

```bash
ln -s ~/.dsh/skills ~/.agents/skills
```

## Related

- Harness documentation for the packaging: `@deepseek-ai/dsh-skill-filesystem` and
  `@deepseek-ai/dsh-skill` package references.
- OKF v0.1: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>

[dsh]: https://github.com/deepseek-ai/deepseek-harness
