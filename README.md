# faraz-claude-plugins

A personal [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace — opinionated plugins for spinning up dev environments, scaffolding stacks, and automating local-first workflows on macOS and Linux.

## Installing the marketplace

### Claude Code (CLI)

```
/plugin marketplace add faraz-ahmed-ai/faraz-claude-plugins
```

Then install any plugin from the catalog below:

```
/plugin install create-t3-app-local@faraz-claude-plugins
```

```
/plugin install setup-claude-md-index@faraz-claude-plugins
```

### Claude Desktop (Cowork)

The `/plugin` slash command is Claude Code only. In Claude Desktop, add the marketplace through the UI:

1. Open Claude Desktop and switch to the **Cowork** tab.
2. Click **Customize** in the left sidebar.
3. Click **Add plugin** (or the **+** button) and choose **GitHub** as the source.
4. Enter `faraz-ahmed-ai/faraz-claude-plugins` (in `owner/repo` format) and confirm.
5. Once the marketplace syncs, install individual plugins (e.g. `create-t3-app-local`) from the same Customize menu.

If your organization manages plugins centrally, an admin may need to add the marketplace under **Organization Settings → Plugins** instead.

## Plugins

### create-t3-app-local

Zero-input local install of an opinionated [T3 stack](https://create.t3.gg/) — **Next.js App Router, TypeScript, Tailwind CSS, tRPC, Drizzle ORM, and better-auth** — wired to a shared local Postgres (Homebrew `postgresql@16`, auto-started by your OS) with a per-project isolated database and least-privilege roles. No Docker, no manual DB setup, no external services: `npm run dev` is all you need.

The skill installs Node, Git, Homebrew, and `postgresql@16` if any are missing; scaffolds the project; applies a curated set of post-scaffold fixes (peer dependency bumps, env schema relaxations, table prefix alignment, drizzle-kit filter corrections); provisions an isolated database with random per-project role passwords; registers a `t3-local-pg` MCP server with Claude Desktop / Cowork so any session can query each project's database; pins the project name in `CLAUDE.md` for automatic disambiguation; pushes the schema; and verifies the dev server returns HTTP 200 — all without prompting the user.

Trigger phrasings: *"set up a new t3 app"*, *"scaffold a t3 stack"*, *"bootstrap create-t3-app"*, *"/create-t3-app"*.

See [`create-t3-app-local/README.md`](./create-t3-app-local/README.md) for details.

### setup-claude-md-index

Scaffold a `CLAUDE.md` file in the current folder as a **strict index** pointing to per-topic detail files in `.claude/topics/`. The generated `CLAUDE.md` carries rules forbidding inline topic content, the index entry format, kebab-case filename conventions, and maintenance guidance for when to add, split, merge, or update topics. If a `CLAUDE.md` already exists with content, the skill migrates each `##` section into its own `.claude/topics/<slug>.md` file (small stubs are collected into `misc.md`) and rewrites `CLAUDE.md` as an index pointing to them.

The goal is to keep `CLAUDE.md` small and discoverable: an index Claude can scan quickly to find the right topic file to load, instead of an unbounded knowledge dump that grows expensive to load and noisy to read.

Trigger phrasings: *"set up CLAUDE.md"*, *"create a CLAUDE.md"*, *"initialize CLAUDE.md"*, *"scaffold a CLAUDE.md index"*, *"convert CLAUDE.md to an index"*.

See [`setup-claude-md-index/README.md`](./setup-claude-md-index/README.md) for details.

## Repository layout

```
.
├── .claude-plugin/
│   └── marketplace.json              # marketplace manifest
├── README.md                         # this file
├── create-t3-app-local/              # plugin
│   ├── .claude-plugin/
│   │   └── plugin.json               # plugin manifest
│   ├── README.md                     # plugin docs
│   ├── mcp-server/                   # source for the project-aware MCP server
│   │   ├── package.json
│   │   └── server.js
│   └── skills/
│       └── create-t3-app-local/
│           └── SKILL.md              # skill definition + procedure
└── setup-claude-md-index/            # plugin
    ├── .claude-plugin/
    │   └── plugin.json               # plugin manifest
    ├── README.md                     # plugin docs
    └── skills/
        └── setup-claude-md-index/
            ├── SKILL.md              # skill definition + procedure
            └── references/
                └── claude-md-template.md  # CLAUDE.md template body
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
