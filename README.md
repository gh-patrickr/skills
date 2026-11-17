# DSH skills

Personal, workspace-independent skill library for [DeepSeek Harness][dsh]. Skills live in
`$DSH_HOME/skills` (normally `~/.dsh/skills`) and are discovered automatically in **every**
workspace — there is no per-project installation step.

The point of this repository is one canonical copy. Workspace-local copies are how skills
rot: they shadow the global file, drift silently, and edits to this repo stop mattering.
Do not vendor skills into projects; symlink only if a project truly must pin one.

## How discovery works

The filesystem provider merges skill roots in this order, first match wins per name:

| Rank | Source | Path |
| --- | --- | --- |
| 100 | project | `<project>/.dsh/skills` |
| 200 | project | `<project>/.agents/skills` |
| 300 | custom | `customSkillDirs` in the profile |
| 400 | **user** | `~/.dsh/skills` ← this repository |
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
- Put project-specific paths, ports, tables and commands in `references/<project>.md`, not
  in the skill body. The body stays generic so it applies everywhere.

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

## Publishing to GitHub

```bash
gh repo create <owner>/dsh-skills --private --source=. --remote=origin --push
# or, with an existing empty repository:
git remote add origin git@github.com:<owner>/dsh-skills.git
git push -u origin main
```

On another machine:

```bash
git clone git@github.com:<owner>/dsh-skills.git ~/.dsh/skills
```

If `~/.dsh/skills` already exists, clone elsewhere and move its contents aside first — or
keep the clone at `~/src/dsh-skills` and symlink `~/.dsh/skills` to it.

## Related

- Harness documentation for the packaging: `@deepseek-ai/dsh-skill-filesystem` and
  `@deepseek-ai/dsh-skill` package references.
- OKF v0.1: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>

[dsh]: https://github.com/deepseek-ai/deepseek-harness
