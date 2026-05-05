---
name: setup-claude-md-index
description: Scaffold CLAUDE.md in the current folder as a strict index pointing to per-topic detail files in .claude/topics/. Use when the user says "set up CLAUDE.md", "create a CLAUDE.md", "initialize CLAUDE.md", "scaffold CLAUDE.md as an index", "make CLAUDE.md an index", "convert CLAUDE.md to an index", or asks to organize project context as an indexed CLAUDE.md. Migrates existing CLAUDE.md content into topic files when present.
---

# Setup CLAUDE.md Index

Scaffold a strict-index `CLAUDE.md` in the current folder. `CLAUDE.md` becomes a pure index pointing to per-topic detail files in `.claude/topics/`. Topic content never goes in `CLAUDE.md` itself.

## What this skill produces

- `CLAUDE.md` at the project root — the index file. Contains the rules forbidding inline content, the index entry format spec, filename conventions for topic files, maintenance rules, and the index list itself.
- `.claude/topics/` — the directory holding per-topic detail files.
- (Migration only) one or more `.claude/topics/*.md` files extracted from the existing `CLAUDE.md`.

## Procedure

### Step 1 — Determine setup mode

Identify the project root (the current working directory unless the user names a different folder). Then:

1. If `CLAUDE.md` does not exist, or exists but is empty / whitespace-only → **fresh setup** (Step 3).
2. Otherwise → **migration setup** (Step 4).

Do not ask the user to confirm the mode. The contents of `CLAUDE.md` decide it.

### Step 2 — Create `.claude/topics/`

Create `.claude/topics/` at the project root if it does not already exist. Do not modify or delete any files already present in that directory.

### Step 3 — Fresh setup

The goal is to populate `CLAUDE.md` with real, codebase-derived content via the built-in `/init` command, then convert that content into the indexed structure. Do **not** stamp an empty index — `/init` does the analysis, and migration converts its output.

1. Invoke the built-in `init` skill via the Skill tool (`{"skill": "init"}`). This runs the same logic as the user typing `/init` — Claude analyzes the repository and writes a populated `CLAUDE.md` at the project root.
2. Wait for the `init` skill to finish and verify `CLAUDE.md` now exists with non-empty content.
3. If `init` produced no `CLAUDE.md` (rare — e.g. user aborted), fall back to writing the empty-index template: read `references/claude-md-template.md`, replace `<!-- INDEX_ENTRIES -->` with a single empty line, write to `CLAUDE.md`, then skip to Step 5.
4. Otherwise, proceed to Step 4 (migration setup) with the `init`-generated `CLAUDE.md` as input. Migration will extract its `##` sections into topic files and rewrite `CLAUDE.md` as a strict index. The template's rules, format spec, filename conventions, and maintenance rules are added by the migration's rewrite step (4f).

### Step 4 — Migration setup

Run when `CLAUDE.md` exists with content. The goal is to move topic-shaped content into `.claude/topics/*.md` files and rewrite `CLAUDE.md` as an index pointing to them.

#### 4a. Parse sections

Treat each `##` heading as a candidate topic. Allocate content as follows:

- Content above the first `##` heading is **preamble**.
- Content under any `##` heading, including any deeper `###`+ subheadings beneath it, belongs to that topic until the next `##` heading.

Do not split on `###` or deeper headings — those stay nested inside their `##` parent.

#### 4b. Classify each candidate

For each `##` block, count non-blank, non-heading lines in the body:

- **Substantive** — roughly 5+ lines. Becomes its own topic file.
- **Stub** — fewer than ~5 lines. Collected into a single `misc.md`.

For the preamble:

- If it reads as rules or instructions for Claude (e.g., conventions, do/don't statements, persona instructions), preserve it. Put it in `misc.md` under a `### Preamble (preserved)` subheading.
- Otherwise treat it as a stub (also goes in `misc.md`).

#### 4c. Generate slugs

For each substantive topic, derive a slug from the heading text:

1. Lowercase the text.
2. Replace any whitespace or punctuation run with a single `-`.
3. Trim leading and trailing `-`.
4. If the result is empty, use `topic-<n>` where `<n>` is the 1-indexed position of this topic.
5. If the slug collides with one already chosen for this run, append `-2`, `-3`, etc.

Slugs must be kebab-case: lowercase letters, digits, and hyphens only.

#### 4d. Write topic files

For each substantive topic, write `.claude/topics/<slug>.md`. The file body is:

- Line 1: a one-line hook describing the topic. This is the same hook that will go in the index entry.
- Line 2: blank.
- Lines 3+: the original section body. Drop the `##` heading line itself (the file's purpose is captured in the hook). Keep all `###` and deeper subheadings as-is.

For the stubs (and the preamble, if it was treated as a stub or as preserved instructions), write a single `.claude/topics/misc.md`. Each stub appears under its original heading **demoted from `##` to `###`** so it nests cleanly under the file's structure. The preserved-preamble subheading stays at `###`.

#### 4e. Generate index entries

For each topic file, write a one-line hook:

- Pull the keywords a future reader (human or LLM) would search for. Be specific to the file's scope.
- Cap the hook at ~150 characters.
- Format: `- [<slug>](.claude/topics/<slug>.md) — <hook>`

Sort entries alphabetically by slug.

#### 4f. Rewrite CLAUDE.md

1. Read the template file `references/claude-md-template.md` from this skill's directory.
2. Replace the marker line `<!-- INDEX_ENTRIES -->` with the generated entries, joined by newlines (no extra blank lines between entries).
3. Write the result to `CLAUDE.md` at the project root, replacing the existing file.

### Step 5 — Confirmation

Always end with a summary to the user. Never run silently. Include:

- Path to the new `CLAUDE.md`.
- Path to `.claude/topics/`.
- (Fresh setup) note that `/init` was run first to populate the source content, then migration converted it.
- (Migration only) the number of substantive topics extracted, whether `misc.md` was created, and the full list of topic file paths written.
- A one-line reminder that future project context should go in topic files, not in `CLAUDE.md` itself.

The confirmation is what lets the user catch a bad migration before relying on it.

## Slug conventions (reference)

- Kebab-case: lowercase letters, digits, and hyphens only.
- Describe the *scope*, not the format. Prefer `build-pipeline` over `build-notes`.
- Unique within `.claude/topics/`. Resolve collisions with a numeric suffix.

## Topic file conventions (reference)

- One topic per file at `.claude/topics/<slug>.md`.
- Line 1 is the one-line hook (matches the index entry).
- Body uses whatever structure the topic needs. No frontmatter required.
- No inline cross-links between topic files — cross-references go through `CLAUDE.md`.

## Index entry format (reference)

`- [<slug>](.claude/topics/<slug>.md) — <one-line hook with keywords>`

- ~150 character cap on the hook.
- The hook is the only place outside the topic file that hints at its contents — make it findable.

## What not to do

- Do not put topic details in `CLAUDE.md` itself, even temporarily.
- Do not delete the user's existing `CLAUDE.md` content without first preserving it in topic files (substantive content as its own file, stubs in `misc.md`).
- Do not pre-populate topic files for content that does not exist yet — the index starts empty in fresh setup. Future LLM sessions add topics as they come up.
- Do not skip Step 5. The user needs the confirmation summary to validate the result.
