---
name: prompt-to-specification-ledger
description: ALWAYS use on every user prompt in any workspace — rewrites and distills the user's raw prompt into a clean, easy-to-read requirement entry while preserving 100% of its meaning, concrete numbers, constraints, and rationales, and appends it to the end of specification.md so any edit session or subagent can restart with a shared knowledge base.
---
# Prompt Distillation & Specification Ledger (Always-On)

**Applies to:** every user prompt in every project workspace.

User prompts are often written rapidly, cover several topics at once, or contain crucial complaints, rationales, and numerical targets that can be lost when conversations compact or when new sessions and subagents start. This skill ensures that:
1. Every user prompt is rewritten into **clear, effortless-to-read prose and bullet points** without losing a single piece of meaning, data, constraint, or user sentiment.
2. The distilled prompt and its resolution are **appended to the end of `specification.md`** as a living **Shared Knowledge Base & Prompt Ledger** so future edit sessions and parallel agents can immediately resume from everything already discussed.

---

## 1. Workflow on Every Turn

### Step A — Read the Ledger at Turn Start
1. Locate `specification.md` at the project root (if missing in a project, create `specification.md` with a project overview and the ledger section).
2. Read the `# Shared Knowledge Base & Prompt Ledger` section at the end of `specification.md` before planning or editing so you never regress a standing user preference or previously agreed constraint.
3. When spawning subagents (`invoke_subagent`), instruct them to read the ledger at the end of `specification.md` so all agents share the same context.

### Step B — Distill the Current User Prompt (Readable, Never Lossy)
Rewrite the user's raw prompt into a clean, structured entry following these rules:
- **Improve readability, grammar, and structure:** Group stream-of-consciousness or multi-topic requests into scannable, bold-labelled bullet points.
- **Preserve 100% of the meaning, data, and priorities:**
  - **Numbers & thresholds:** Never drop quantities, percentages, distances, speeds, ratios, or counts (e.g., `"spawn 2× distance back"`, `"10% visibly hit → 10% die"`, `"ratio of power-ups to enemies"`).
  - **Named references & inspirations:** Keep every game, tool, or codename mentioned (e.g., `"Last War"`, `"Argon"`).
  - **Negative constraints & strong dislikes:** Explicitly preserve `"do not..."`, `"remove..."`, `"never..."`, and strong preferences (e.g., `"No running webserver after testing"`, `"Remove fixed tank / movable turret levels"`, `"Graphics quality must never affect gameplay width"`).
  - **Design rationale (" the why"):** Keep the user's reasoning for why something feels good or bad (e.g., *"Lower speed with more monsters/objects feels more tactical; high speed makes it random and less thinking"*).

### Step C — Append to the End of `specification.md`
Before finishing the turn (and before committing in git):
1. Update the **Standing Invariants & User Preferences (Quick-Restart Summary)** subsection if the prompt introduces or refines a standing rule.
2. Append a new `### Prompt <NN> — <YYYY-MM-DD> — <Short Title>` entry at the very end of `specification.md` under `## Chronological Prompt & Decision Log`.
3. Include:
   - **Distilled Prompt:** Clean, readable bullet points preserving all meaning, data, and rationale.
   - **Key Data & Constraints:** Quick-scan list of hard numbers, banned patterns, or invariants from the prompt.
   - **Resolution & Code Anchors:** Summary of what was changed and which files/symbols implement it.

---

## 2. Template for the End of `specification.md`

Always keep this section at the **very end** of `specification.md`:

```markdown
---

# Shared Knowledge Base & Prompt Ledger

> Maintained on every turn by the `prompt-to-specification-ledger` skill.
> Distills each user prompt into easy-to-read requirements while preserving 100% of its meaning, concrete data, constraints, and design rationale so any session or agent can restart seamlessly.

## Standing Invariants & User Preferences (Quick-Restart Summary)

- **<Domain / Topic>:** <Clear statement of the standing rule, including exact numbers and what must never happen.>

## Chronological Prompt & Decision Log

### Prompt <NN> — <YYYY-MM-DD> — <Concise Topic Title>
- **Distilled Prompt (Readable, Full Meaning & Data):**
  - **<Requirement / Feedback 1>:** <Clean, well-structured restatement keeping every detail, number, example, and rationale.>
  - **<Requirement / Feedback 2>:** ...
- **Key Data & Constraints Preserved:** <Exact numbers, ratios, named inspirations, or hard prohibitions.>
- **Resolution & Code Anchors:** <Concise summary of the implementation and links/paths to the key files.>
```

---

## 3. Anti-Patterns to Avoid

- **Lossy summarization:** Never compress a detailed 6-point user prompt into a vague one-liner like `"User asked for balance and UI improvements"`. Every point and its reason must remain readable and specific.
- **Verbatim dumping without clarity:** Do not paste hard-to-parse typos or fragmented sentences without organizing them into clear, grammatical, scannable bullets.
- **Overwriting prior history:** Always *append* new prompt entries to the chronological log (and refine the Standing Invariants summary) rather than deleting earlier decisions.
- **Forgetting to commit `specification.md`:** Always include the updated `specification.md` in the turn's feature commit so the shared knowledge base is versioned in git.
