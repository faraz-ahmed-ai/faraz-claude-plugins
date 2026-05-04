# CLAUDE.md — Project Index

> **This file is an INDEX, not a knowledge base.**
> Topic details live in `.claude/topics/*.md`. This file only points to them.

## Rules for Claude

When working with this file:

1. **Never inline topic content here.** If you have details to record about a topic, write them in `.claude/topics/<slug>.md` and add or update the index entry below. Treat any inline expansion of a topic in this file as a bug to fix.
2. **Always open the linked topic file before answering on that topic.** The index hook describes what is in a file but is not a substitute for the content. Do not answer from the hook alone.
3. **Add new topics rather than expanding old ones.** If new content does not cleanly fit an existing entry's hook, create a new topic file and a new index entry. Do not bend a tangentially related entry to absorb it.
4. **Keep the index terse.** One entry per line. Each hook is at most ~150 characters — enough to disambiguate and surface keywords, not enough to replace the file.

## Index entry format

Each entry is exactly one line:

```
- [<slug>](.claude/topics/<slug>.md) — <one-line hook with keywords>
```

- `<slug>` is kebab-case, describes the topic's scope, and is unique within `.claude/topics/`.
- The hook contains the keywords a future reader (human or LLM) would use to find this topic.
- The hook is the only place outside the topic file that hints at its contents — make it findable.

## Filename conventions for topic files

- One topic per file, located at `.claude/topics/<slug>.md`.
- `<slug>` is kebab-case (`build-pipeline.md`, not `BuildPipeline.md` or `build_pipeline.md`).
- Slugs name the *scope*, not the format. Prefer `testing-strategy.md` over `testing-notes.md`.
- Each topic file begins with a one-line description that matches its index hook, then the body.
- Topic files do not link to each other inline — cross-references go through this index.

## Maintenance rules

- **Add a topic** when a new subject comes up that does not fit any existing entry's hook. Create a new file and a new index entry — do not expand a tangentially related entry.
- **Split a topic** when a topic file has grown to cover two distinct concerns that would each merit their own hook. Create two files, retire the old slug, add two new entries.
- **Merge topics** when two entries' hooks describe overlapping scope and the files repeat each other. Merge into one file, delete one of the entries, update the survivor's hook.
- **Update a hook** after editing a topic file if the hook no longer accurately describes the file's contents.
- **Look up first.** Before answering a project-context question, scan the index hooks, pick the closest match, and open that file. If no entry matches, the topic does not exist yet — add it.

## Index

<!-- INDEX_ENTRIES -->
