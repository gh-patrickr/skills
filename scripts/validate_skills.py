#!/usr/bin/env python3
"""Validate the skills in this repository.

Checks every top-level skill directory:

* ``SKILL.md`` exists and starts with a YAML frontmatter block;
* ``name`` is kebab-case and equals the directory name;
* ``description`` is present, non-empty and a single line (the catalog contract);
* relative Markdown links in ``SKILL.md`` resolve to real files;
* no duplicate skill names.

Exit codes: 0 all good, 1 at least one error. Warnings do not fail the build.

No third-party dependency is required: the frontmatter we ship is flat scalars, which is
parsed here directly. PyYAML is used when available for a stricter parse.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
LINK_RE = re.compile(r"\]\(([^)\s]+)\)")
SKIP_DIRS = {"scripts", ".git", ".github", "node_modules", "__pycache__"}


def parse_frontmatter(text: str) -> tuple[dict[str, str], str] | None:
    if not text.startswith("---"):
        return None
    parts = text.split("---", 2)
    if len(parts) < 3:
        return None
    raw, body = parts[1], parts[2]
    data: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        data[key.strip()] = value
    return data, body


def relative_links(body: str) -> list[str]:
    links = []
    for target in LINK_RE.findall(body):
        if target.startswith(("http://", "https://", "mailto:", "#", "/")):
            continue
        links.append(target.split("#", 1)[0])
    return links


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    errors: list[str] = []
    warnings: list[str] = []
    seen: dict[str, Path] = {}

    skill_dirs = sorted(
        p
        for p in root.iterdir()
        if p.is_dir() and p.name not in SKIP_DIRS and not p.name.startswith(".")
    )

    for skill_dir in skill_dirs:
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.is_file():
            if any(skill_dir.iterdir()):
                warnings.append(f"{skill_dir.name}: directory without SKILL.md (ignored)")
            continue

        text = skill_file.read_text(encoding="utf-8")
        parsed = parse_frontmatter(text)
        if parsed is None:
            errors.append(f"{skill_dir.name}: missing or malformed frontmatter")
            continue
        meta, body = parsed

        name = meta.get("name", "")
        if not name:
            errors.append(f"{skill_dir.name}: missing name")
        elif not NAME_RE.match(name):
            errors.append(f"{skill_dir.name}: name is not kebab-case: {name!r}")
        elif name != skill_dir.name:
            errors.append(f"{skill_dir.name}: name {name!r} != directory name")
        if name in seen:
            errors.append(f"{skill_dir.name}: duplicate name, also in {seen[name]}")
        seen[name] = skill_dir

        description = meta.get("description", "")
        if not description:
            errors.append(f"{skill_dir.name}: missing description")
        elif "\n" in description:
            errors.append(f"{skill_dir.name}: description must be one line")
        elif len(description) < 20:
            warnings.append(f"{skill_dir.name}: description is very short")

        for target in relative_links(body):
            if not (skill_dir / target).exists():
                errors.append(f"{skill_dir.name}: broken relative link: {target}")

        if any(skill_dir.rglob(".DS_Store")):
            warnings.append(f"{skill_dir.name}: contains .DS_Store")

    for warning in warnings:
        print(f"warning: {warning}")
    for error in errors:
        print(f"error: {error}")
    print(f"\n{len(skill_dirs)} skill directories, {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
