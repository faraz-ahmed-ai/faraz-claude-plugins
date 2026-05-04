# setup-claude-md-index

A Cowork plugin with a single skill that scaffolds a `CLAUDE.md` file in the current folder as a strict index pointing to per-topic detail files in `.claude/topics/`.

## What it does

When you run the `setup-claude-md-index` skill in a project folder, Claude will:

1. Create `.claude/topics/` if it does not exist.
2. Write `CLAUDE.md` at the root with:
   - Rules forbidding inline topic content
   - The index entry format spec
   - Filename conventions for topic files
   - Maintenance rules (when to add, split, merge, update)
   - The index itself (initially empty)
3. If `CLAUDE.md` already exists with content, migrate each `##` section into its own topic file (small stubs are collected into `misc.md`), then rewrite `CLAUDE.md` as an index pointing to them.

## Why

`CLAUDE.md` files tend to grow unbounded as projects accumulate context. Once they pass a certain size, they are expensive to load and noisy to read. This plugin enforces a discipline: `CLAUDE.md` is just an index, and details live in scoped, named topic files that get loaded only when relevant.

## Install

Install the `.plugin` file through Cowork's plugin manager.

## Usage

In a project folder, ask Claude to "set up CLAUDE.md" or "scaffold a CLAUDE.md index." The skill triggers automatically. End-of-run confirmation will list what was created so you can verify before relying on it.
