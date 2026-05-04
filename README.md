# faraz-claude-plugins

A personal [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace — opinionated plugins for spinning up dev environments, scaffolding stacks, and automating local-first workflows on macOS and Linux.

## Installing the marketplace

In Claude Code:

```
/plugin marketplace add faraz-ahmed-ai/faraz-claude-plugins
```

Then install any plugin from the catalog below:

```
/plugin install create-t3-app-local@faraz-claude-plugins
```

## Plugins

### create-t3-app-local

Zero-input local install of an opinionated [T3 stack](https://create.t3.gg/) — **Next.js App Router, TypeScript, Tailwind CSS, tRPC, Drizzle ORM, and better-auth** — wired to a self-contained [PGlite](https://pglite.dev/) Postgres daemon for development. No external services, no Docker, no database to provision: `npm run app` starts the local DB and the dev server in one shot.

The skill installs Node and Git via Homebrew if they are missing, scaffolds the project, applies a curated set of post-scaffold fixes (peer dependency bumps, env schema relaxations, table prefix alignment, drizzle-kit filter corrections), drops in a PGlite daemon plus launch scripts, generates a fresh `BETTER_AUTH_SECRET`, pushes the schema, and verifies the dev server returns HTTP 200 — all without prompting the user.

Trigger phrasings: *"set up a new t3 app"*, *"scaffold a t3 stack"*, *"bootstrap create-t3-app"*, *"/create-t3-app"*.

See [`create-t3-app-local/README.md`](./create-t3-app-local/README.md) for details.

## Repository layout

```
.
├── .claude-plugin/
│   └── marketplace.json          # marketplace manifest
├── README.md                     # this file
└── create-t3-app-local/          # plugin
    ├── .claude-plugin/
    │   └── plugin.json           # plugin manifest
    ├── README.md                 # plugin docs
    └── skills/
        └── create-t3-app-local/
            └── SKILL.md          # skill definition + procedure
```

## Adding a new plugin

1. Create a new top-level folder named after the plugin.
2. Add `.claude-plugin/plugin.json` with the plugin metadata.
3. Place skills under `skills/<skill-name>/SKILL.md`.
4. Add a `README.md` inside the plugin folder.
5. Append an entry to `plugins[]` in `.claude-plugin/marketplace.json`.
6. Add a section for the new plugin under "Plugins" in this README.

## License

Personal use.
