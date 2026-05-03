---
name: create-t3-app
description: Scaffold a fresh T3 stack project (Next.js App Router + TypeScript + Tailwind + tRPC + Drizzle + better-auth) with a self-contained local Postgres dev DB (PGlite running as a daemon) and an `npm run app` command that starts the DB, pushes the schema, and runs the dev server. Takes no arguments — fully ready to go. Trigger this whenever the user asks to set up, scaffold, bootstrap, or initialize a new T3 app, T3 stack, or create-t3-app project — including phrasings like "start a new t3 project", "spin up a t3 stack", or "/create-t3-app".
---

# create-t3-app

Scaffolds a T3 app in the current directory, applies a curated set of fixes, and wires up a local PGlite daemon so the dev environment runs end-to-end with no external services. Production database and credentials are deferred to deployment time.

## No arguments

The skill takes no arguments. The dev `DATABASE_URL` is hardcoded to point at the local PGlite daemon with `changethistemporarypassword` as a placeholder credential. The password is decorative — pglite-server does not enforce auth — but its name makes it obvious this is a dev-only placeholder that must be replaced when deploying to a real Postgres.

## Output style

During execution, the only chat output is **one short success line per component** as it lands. Use exactly these phrasings, in this order, and only print a line *after* the corresponding step has actually succeeded:

- `Node and Git verified` (skip entirely if both were already installed before the skill ran — only print if Step 1 actually had to install something)
- `Project scaffolded`
- `Dependencies installed`
- `Post-scaffold fixes applied`
- `PGlite installed`
- `.env configured`
- `Database initialized`
- `Dev server verified`
- `Changes staged`

Then print the "## How to use" block from Step 8. Nothing else.

**Do not** narrate intermediate progress, echo tool results, paste scaffold/install logs, comment on ERESOLVE iterations, list each post-scaffold edit, or summarize the stack. Internal recovery (dotfile stash, ERESOLVE peer bumps, port-detection fallback, daemon idempotency, marker-file recovery) is invisible — these are expected paths, not events to report. The user does not need to see `npm install` output, `git status`, `find` output, or any "Now running…" preamble.

**Unexpected errors are the exception** — and the only exception. If something fails outside the documented expected paths (a third ERESOLVE iteration involving an unrelated package, scaffold artifacts missing after Step 3, daemon refusing to start, HTTP probe returning non-200, etc.), stop and surface the actual error verbatim. Do not continue past the failure and do not claim success. "Expected" means a path explicitly described in the relevant step; everything else is unexpected.

## Procedure

Execute the steps below in order. If any step fails outside its documented expected paths, surface the actual error and stop — do not claim success.

### 1. Ensure Node and Git are installed

Both are required. Node provides `npx` for the scaffold and `npm` for dependency install; Git is needed because the scaffold runs `git init && git add .` as part of setup (see Step 3 — the user agreed to "initialize a Git repository and stage the changes").

Check both:

```bash
command -v node >/dev/null 2>&1 && echo "node ok" || echo "node MISSING"
command -v git  >/dev/null 2>&1 && echo "git ok"  || echo "git MISSING"
```

If both are present, skip ahead. Otherwise install whichever is missing using the first available option below. Prefer Homebrew when available because it puts both on a stable PATH (`/opt/homebrew/bin` on Apple Silicon, `/usr/local/bin` on Intel/Linux) that subsequent shell invocations inherit automatically — important because the Bash tool spawns a fresh shell per command.

In the snippets below, `MISSING` is the space-separated list of formulae to install — e.g. `node`, `git`, or `node git`. Build it from the checks above:

```bash
MISSING=""
command -v node >/dev/null 2>&1 || MISSING="$MISSING node"
command -v git  >/dev/null 2>&1 || MISSING="$MISSING git"
MISSING=$(echo "$MISSING" | xargs)  # trim
```

**a. Homebrew on PATH**

```bash
brew install $MISSING
```

**b. nvm available (`~/.nvm/nvm.sh` exists), Homebrew not** — Node-only path

nvm only handles Node, not Git. Use this path **only if Git is already installed and only Node is missing**. If Git is also missing, skip to option c (Homebrew bootstrap) so a single tool installs both.

```bash
. "$HOME/.nvm/nvm.sh"
nvm install node
nvm use node
```

The source call doesn't persist across separate Bash tool invocations. Either re-source nvm at the top of every subsequent shell command in this skill, or install Homebrew (option c) so PATH handles it.

**c. Neither — install Homebrew, then Node**

Tell the user explicitly what's about to happen before running the installer, e.g.:

> Homebrew isn't installed. Installing it now via the official script from brew.sh in non-interactive mode. This requires your sudo password to be already cached or passwordless — if it errors with a sudo prompt, run `sudo -v` first and re-invoke this skill.

Then run with `NONINTERACTIVE=1`:

```bash
NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

The URL is the official command from https://brew.sh — use it verbatim, don't substitute a different source. Pipe-curl-to-bash is a real risk vector, so the skill is explicit about which URL it's running.

`NONINTERACTIVE=1` is required because Claude's Bash tool (and `docker exec`, CI, SSH-without-tty) doesn't have a TTY for the installer's "Press RETURN" prompt — without this var the install hangs forever. The trade-off: NONINTERACTIVE mode requires sudo to be cached or passwordless. On a fresh Mac account where neither is true, the install fails with a sudo error; the user fixes it by running `sudo -v` once and re-invoking the skill.

After the installer finishes, two things need to happen: PATH must work for the *current* shell (so the immediate `brew install node` call works), and PATH must work for *subsequent* shell invocations within this skill run (each Bash tool call is a fresh non-login non-interactive shell that doesn't source `.bashrc`).

For the current shell — find brew at the right path and source it:

```bash
for p in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
  [ -x "$p" ] && eval "$($p shellenv)" && BREW_BIN="$p" && break
done
```

For subsequent shells — write the eval into shell init files. The macOS installer auto-writes to `~/.zprofile` or `~/.bash_profile`, but the Linux installer only prints next-steps and doesn't write anything. Just write to all four common files yourself; appending an `eval` line is idempotent enough (or guard with grep if extra paranoid):

```bash
SHELLENV_LINE="eval \"\$($BREW_BIN shellenv)\""
for f in ~/.profile ~/.bashrc ~/.zprofile ~/.zshrc ~/.bash_profile; do
  touch "$f"
  grep -qF "$SHELLENV_LINE" "$f" || echo "$SHELLENV_LINE" >> "$f"
done
```

Then install whatever's missing:

```bash
brew install $MISSING
```

**Critical: subsequent skill steps must re-source brew.** Steps 3–9 each run via Claude's Bash tool, which spawns a fresh non-login non-interactive shell — `.bashrc`/`.profile` are NOT sourced by default. Either prepend the `for p in ...; eval "$($p shellenv)"` snippet above to every subsequent Bash command, or invoke them as `bash -lc 'cmd...'` (login shell) so `.profile` is sourced. The first option is more reliable across environments.

**Verify**

After whichever path was taken, confirm all three binaries are on PATH and surface the versions:

```bash
node --version
npm --version
git --version
```

If any verification fails, stop and surface the actual error rather than continuing into a scaffold that won't work.

**Why this exists:** create-t3-app uses `npx` (requires Node) and runs `git init && git add .` as part of the scaffold (requires Git). A fresh dev machine missing either would fail later with a confusing "command not found". Detecting and installing — or bootstrapping the package manager that installs them — gives a clear, recoverable failure mode.

**Note on macOS Git:** macOS may ship a Git stub at `/usr/bin/git` that triggers an Xcode Command Line Tools installer dialog when first invoked. `command -v git` returns true for the stub even before CLT is installed. If you want to be defensive, check with `git --version` instead — but the Homebrew-installed Git takes precedence on PATH and avoids the CLT dialog entirely, so most users will be fine either way.

### 2. Determine project name

Use the current working directory's basename, lowercased, with non-alphanumeric characters replaced by hyphens. Example: `MyApp Project` → `myapp-project`. This name is used both as the create-t3-app project name and as the table prefix in the Drizzle schema.

If the current directory contains any non-hidden files, stop and tell the user to run this in an empty directory. Hidden dotfiles (`.git`, `.claude`, `.env.local`, etc.) are tolerated — Step 3 stashes them before scaffolding and restores them afterward.

### 3. Scaffold (depends on Steps 1–2)

create-t3-app treats any dotfile in the target directory as a "conflicting file" and shows an interactive **"Continue installation and overwrite conflicting files?"** prompt. The `--CI` flag does **not** suppress this prompt. On Node 25+ the prompt fails to render at all and surfaces as `SystemError [ERR_TTY_INIT_FAILED]: TTY initialization failed: uv_tty_init returned EINVAL`; on older Node it just hangs forever waiting for input that won't come.

The fix is to move all dotfiles aside, run the scaffold against a truly empty directory, then restore. **All three phases (stash → scaffold → restore) must run inside a single Bash tool invocation.** Two reasons:

1. **The agent harness rewrites dotfiles between tool calls.** Claude Code regenerates `.claude/settings.local.json` to persist session state, and similar harnesses do equivalent things. If you stash in one Bash call and scaffold in the next, the harness can recreate `.claude/` in the gap; the scaffold then sees a "conflicting" dotfile and aborts with the TTY error. Keeping the stash + scaffold + restore in one shell session closes that window.
2. **No marker file is needed.** With everything in one bash script, the stash path lives in a shell variable. **Do not write a marker file like `.t3-stash-path` inside the project root** — it's itself a dotfile and triggers the exact TTY error this whole dance is meant to avoid.

The flag mapping for create-t3-app's prompts (do not deviate — these are the project's chosen settings):

| Prompt | Answer | Flag |
| --- | --- | --- |
| TypeScript | Yes | (always on, no flag) |
| Tailwind CSS | Yes | `--tailwind` |
| tRPC | Yes | `--trpc` |
| Auth provider | BetterAuth | `--betterAuth` |
| ORM | Drizzle | `--drizzle` |
| Next.js App Router | Yes | `--appRouter` |
| Database provider | PostgreSQL | `--dbProvider postgres` |
| Linting/formatting | ESLint + Prettier | `--eslint` |
| Initialize Git | Yes | (no flag — `git init && git add .` is the default; passing `--noGit` would skip it) |
| Run `npm install` | Yes | `--noInstall` (skill runs install itself in Step 4 — see note) |
| Import alias | default `~/` | (no flag — `~/` is the default; passing `--import-alias "~/"` triggers a `TypeError: i.replace is not a function` post-scaffold bug in current create-t3-app versions) |

`--dbProvider` defaults to `sqlite`, so the postgres flag is mandatory — easy to overlook. Several feature flags (`--tailwind`, `--betterAuth`, etc.) are documented as "experimental" in the create-t3-app help and **must** be paired with `--CI`.

Run the entire stash → scaffold → restore as one Bash tool call:

```bash
set -e
STASH=$(mktemp -d "${TMPDIR:-/tmp}/t3-stash.XXXXXX")
echo "Stashing dotfiles to $STASH"
find . -mindepth 1 -maxdepth 1 -name '.*' -print0 | xargs -0 -I{} mv {} "$STASH/"

# Sanity check: directory must be empty before scaffold (including dotfiles).
# Use `find` rather than a bash glob — handles "no dotfiles" cleanly and excludes `.`/`..`.
if [ -n "$(find . -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "ERROR: project dir not empty after stash — aborting"
  ls -la
  exit 1
fi

npx -y create-t3-app@latest . \
  --CI \
  --tailwind \
  --trpc \
  --betterAuth \
  --drizzle \
  --appRouter \
  --dbProvider postgres \
  --eslint \
  --noInstall

# Verify scaffold by artifacts, not exit code (see note below).
for f in package.json src drizzle.config.ts; do
  if [ ! -e "$f" ]; then
    echo "ERROR: scaffold did not produce $f"
    exit 1
  fi
done

# Restore stashed dotfiles. User dotfiles take precedence over any same-name
# dotfile the scaffold generated (intentional — the user's state matters more
# than boilerplate; Steps 5g and 6 add the skill's needs back regardless).
find "$STASH" -mindepth 1 -maxdepth 1 -print0 | while IFS= read -r -d '' src; do
  base=$(basename "$src")
  [ -e "./$base" ] && rm -rf "./$base"
  mv "$src" .
done
rmdir "$STASH"
echo "Scaffold complete"
```

**Note on `--noInstall`:** the user-facing setting #10 is "Yes, run npm install." That's about intent — the user wants dependencies installed by the time the skill finishes. We satisfy that intent in Step 4 by running install ourselves, with `--noInstall` here so we control when install happens.

This matters because the better-auth + drizzle peer conflict (see Step 4) is currently deterministic on fresh scaffolds. Letting create-t3-app's bundled install run would mean a guaranteed `ERESOLVE` failure, partial node_modules state, and a slower path to the same end. Patching `package.json` first and then installing once cleanly is faster, produces a clean lockfile on first try, and gives us a single error-handling surface. The end state is identical: working `node_modules` with consistent peers.

**Note on `--import-alias`:** intentionally omitted. `~/` is already the default, AND passing `--import-alias "~/"` (verbatim default) triggers `TypeError: i.replace is not a function` after the boilerplating phase in current create-t3-app versions. The bug is in the import-alias rewrite step. Skipping the flag avoids it without changing the result — the resulting `tsconfig.json` still has `"~/*": ["./src/*"]`.

**Verify scaffold by artifacts, not exit code.** create-t3-app may exit non-zero for cosmetic post-scaffold errors (the import-alias bug above is one example). Don't trust the exit code — the script above checks for `package.json`, `src/`, and `drizzle.config.ts` instead. If those exist, the scaffold succeeded and you can proceed. If they're missing, the scaffold genuinely failed and you should stop.

If a future create-t3-app version renames or removes any of these flags, run `npx -y create-t3-app@latest --help` and update the mapping above. The settings are the source of truth, not the flags.

**Special case — preexisting `.git`:** if the user already had a `.git` directory, the stash preserves their git history but **overwrites** the fresh `.git` that create-t3-app produced. Their existing index and refs are untouched, which means the scaffold's `git add .` doesn't propagate to the user's repo — the new files will appear as untracked in `git status` after restore. Step 7d's `git add .` handles this case (and the empty-directory case) uniformly so the staged tree always reflects the actual end state.

If the bash script aborts mid-flight (process killed, system crash, etc.), the user's stashed dotfiles are still in `$TMPDIR/t3-stash.*` (or `/tmp/t3-stash.*`). Find the leftover with `ls -d ${TMPDIR:-/tmp}/t3-stash.*` and move its contents back into the project root manually before re-running this skill.

### 4. Install — patch first if needed

Run `npm install`. If it succeeds on the first try, move to Step 5.

If it fails with `ERESOLVE`, read the error carefully and bump **only the packages the error explicitly names** in its "Could not resolve dependency" / "Conflicting peer dependency" lines. Do not preemptively bump packages the error doesn't mention — the template's pin may still satisfy them, and unnecessary bumps invite unrelated breakage.

**ERESOLVE iterates.** npm reports one conflict at a time, and a second peer mismatch can be hidden behind the first — fixing the named package and re-running may surface a *new* `ERESOLVE` for a *different* package. That's not a failure; that's npm finally getting far enough to see the next conflict. Apply the same rule (bump only what's named), re-run install, repeat. Verified empirically on 2026-05-03 with a fresh scaffold:

1. First install fails: error names only `drizzle-kit` (better-auth peer wants `>=0.31.4`, template pins `^0.30.5`). Bump `drizzle-kit` to `^0.31.4`.
2. Second install fails: error now names `drizzle-orm` (the better-auth-drizzle-adapter peer wants `^0.45.2`, template pins `^0.41.0`). Bump `drizzle-orm` to `^0.45.2`.
3. Third install succeeds.

So expect **up to two bump iterations** for the current better-auth/drizzle peer landscape. If you see a fourth iteration, or an `ERESOLVE` involving packages outside this drizzle/better-auth family, stop and report it — don't reach for `--legacy-peer-deps`. Clean peer resolution is the point; papering over conflicts produces a lockfile npm doesn't believe in.

**Why this exists:** create-t3-app pins `drizzle-kit` and `drizzle-orm` with caret ranges, but `better-auth ^1.3` resolves to newer minors over time and those minors raise their peer requirements (both for the core package and for `@better-auth/drizzle-adapter`). The template's pins drift behind both peers, on different schedules. Don't pre-emptively bump on every run — let ERESOLVE name the conflict each time, and bump only that.

### 5. Apply post-scaffold fixes

These three edits make the generated project usable without further manual steps. Apply all three.

**a. Make GitHub OAuth env vars optional** — `src/env.js`

Change:
```js
BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),
```
To:
```js
BETTER_AUTH_GITHUB_CLIENT_ID: z.string().optional(),
BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
```

Why: the env schema validates on import, including from `drizzle.config.ts`. Without this, `npm run db:push` fails before touching the database because the user hasn't set up a GitHub OAuth app yet. Users who do want GitHub auth can tighten these back to required when they add credentials.

**b. Fix the table prefix** — `src/server/db/schema.ts`

The default scaffold ships with a stale prefix (e.g. `pg-drizzle_`) inside `pgTableCreator` that doesn't match the project name and doesn't match the `tablesFilter` in `drizzle.config.ts`. Replace the prefix with the project name from Step 2:

```js
export const createTable = pgTableCreator((name) => `<project-name>_${name}`);
```

Why: the pgTableCreator prefix and the drizzle-kit `tablesFilter` must agree, otherwise drizzle-kit can't see the tables it owns and tries to recreate them on every push. Aligning both to the project name is the convention.

**c. Filter introspection — `drizzle.config.ts`

Add `schemaFilter` and broaden `tablesFilter` to include better-auth's bare table names:

```ts
export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: env.DATABASE_URL },
  schemaFilter: ["public"],
  tablesFilter: [
    "<project-name>_*",
    "user",
    "session",
    "account",
    "verification",
  ],
} satisfies Config;
```

Why: better-auth's tables (`user`, `session`, `account`, `verification`) are defined in `schema.ts` *without* the project prefix because better-auth expects those exact names. If `tablesFilter` only matches the prefix, drizzle-kit's introspection skips the auth tables, "doesn't see" them in the DB, and tries to `CREATE TABLE` them again — which fails with "relation already exists" on the second push. Including the four bare names in the filter makes drizzle-kit aware they exist and managed.

`schemaFilter: ["public"]` is the default but pinning it explicitly is harmless and matches the philosophy of being explicit about what drizzle-kit manages. (PGlite has only `public`, but a real prod Postgres might have `auth`, `storage`, `realtime`, etc.)

**d. Install PGlite packages**

```bash
npm install @electric-sql/pglite @electric-sql/pglite-socket
```

`@electric-sql/pglite` is the embedded WASM Postgres. `@electric-sql/pglite-socket` exposes it over the Postgres wire protocol on a TCP socket — its CLI binary is `pglite-server` (note: bin name differs from package name). Together they let drizzle-kit and the Next.js app talk to PGlite as if it were a regular Postgres on `localhost:5432`. The existing `postgres` (postgres-js) driver is retained — it talks to the daemon the same way it'd talk to a real Postgres.

**e. Add launch scripts**

Create `scripts/db-start.sh`, `scripts/db-stop.sh`, and `scripts/launch.sh` and make them executable.

`scripts/db-start.sh`:
```bash
#!/bin/bash
set -e
mkdir -p .pglite
if (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "DB daemon already running on :5432"
  exit 0
fi
nohup npx pglite-server -d ./.pglite/data -p 5432 -h 127.0.0.1 > .pglite/daemon.log 2>&1 &
disown
for i in $(seq 1 30); do
  if (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null; then
    echo "DB daemon started"
    exit 0
  fi
  sleep 0.5
done
echo "DB daemon failed to start within 15s — see .pglite/daemon.log"
exit 1
```

`scripts/db-stop.sh`:
```bash
#!/bin/bash
if pkill -f 'pglite-server.*\.pglite/data' 2>/dev/null; then
  echo "DB daemon stopped"
else
  echo "DB daemon not running"
fi
```

`scripts/launch.sh`:
```bash
#!/bin/bash
set -e
bash scripts/db-start.sh
npm run dev
```

Then `chmod +x scripts/*.sh`.

**Why launch doesn't include `db:push`:** schema sync is a deliberate dev action triggered by editing `src/server/db/schema.ts`, not something to auto-run on every dev session start. Auto-pushing would (a) add ~2s of introspection tax on every launch when nothing changed, and (b) interrupt launch with interactive prompts when drizzle-kit detects destructive changes (renames, type changes). Users run `npm run db:push` themselves after schema edits — same intent, separate step.

Why these specific shapes:
- **Port-check via `/dev/tcp`** (a bash builtin) avoids depending on `nc`/`lsof`/`fuser` which aren't always installed.
- **Pattern-based pkill** (`pglite-server.*\.pglite/data`) is more robust than tracking a PID file. The PID we'd capture is `npx`'s wrapper, and signaling that doesn't reliably kill the actual node child. The full command line of the daemon contains the data path, which uniquely identifies our process.
- **`disown`** prevents the daemon from receiving SIGHUP if the parent shell exits, so the daemon outlives `npm run app`.
- **Daemon outlives launch** is intentional: a user can Ctrl-C dev, run `npm run db:studio` separately (PGlite's single-connection limit means dev must be stopped first), and resume with `npm run app` later. Cleanup happens via `npm run db:stop`.

**f. Add npm scripts**

Add to `package.json`:
```json
{
  "scripts": {
    "db:start": "bash scripts/db-start.sh",
    "db:stop": "bash scripts/db-stop.sh",
    "app": "bash scripts/launch.sh"
  }
}
```

Use `node` to merge into the existing scripts block rather than rewriting the file:
```bash
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.scripts["db:start"] = "bash scripts/db-start.sh";
  pkg.scripts["db:stop"] = "bash scripts/db-stop.sh";
  pkg.scripts["app"] = "bash scripts/launch.sh";
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
```

**g. Update `.gitignore`**

Append `.pglite/` so the local DB data isn't committed. The scaffold's `.gitignore` ends without a trailing newline, so a naive `echo ... >> .gitignore` concatenates onto the previous line (e.g. produces `.idea.pglite/`). Ensure a trailing newline first, then append, and use `grep -xF` to match the whole line exactly so we don't false-match a `.pglite` substring elsewhere:

```bash
if ! grep -qxF ".pglite/" .gitignore 2>/dev/null; then
  [ -s .gitignore ] && [ -n "$(tail -c 1 .gitignore)" ] && printf '\n' >> .gitignore
  printf '.pglite/\n' >> .gitignore
fi
```

Why `[ -n "$(tail -c 1 .gitignore)" ]`: command substitution strips trailing newlines, so if the file ends with `\n` the captured value is empty (no newline needed); if it ends with any non-newline byte, the value is non-empty (newline needed before append).

### 6. Write `.env`

Generate a fresh better-auth secret and write `.env` with the hardcoded local-DB URL:

```bash
SECRET=$(openssl rand -base64 32)
cat > .env <<EOF
BETTER_AUTH_SECRET="$SECRET"
BETTER_AUTH_GITHUB_CLIENT_ID=""
BETTER_AUTH_GITHUB_CLIENT_SECRET=""
DATABASE_URL="postgresql://postgres:changethistemporarypassword@localhost:5432/postgres"
EOF
```

The hardcoded URL points at the local PGlite daemon (Step 5e). The user/database parts (`postgres`/`postgres`) are pglite-server's defaults; the password is decorative. The literal `changethistemporarypassword` is intentional — it's a strong, obvious flag in code review and in any leaked log saying "this credential is fake, the dev DB has no real auth, change me before deploying."

Do not log the URL or the better-auth secret to chat output.

### 7. Verify the stack

Three things to verify, in order. The first scaffold needs an explicit one-time `db:push` to seed the schema (since launch doesn't run push); after that, the user runs push themselves whenever they edit the schema.

**a. Start daemon and push schema.**

```bash
npm run db:start && npm run db:push
```

Expect:
- `DB daemon started` from db:start
- `[✓] Changes applied` from db:push (the new schema gets created)

If db:push hangs at "Pulling schema from database", a stale connection is holding the daemon's single connection slot. Run `npm run db:stop && npm run db:start` to recycle, then retry.

**b. Run launch and probe HTTP.**

Launch starts the dev server (and reuses the already-running daemon). Run it as a background process so its output is captured to a file you can read.

```bash
npm run app
```

Expect in the log:
- `DB daemon already running on :5432` (since (a) just started it)
- `✓ Ready in <ms>` from Next.js

After Next reports ready, **parse the actual port from the launch output** rather than assuming `3000`. If something else (a stale dev server, a real Postgres misconfigured to that port, etc.) is on `:3000`, Next falls back to `:3001`/`:3002`/etc. and prints a warning. Probing a hardcoded `:3000` in that case gives a confusing failure that has nothing to do with the scaffold.

```bash
# LAUNCH_LOG is the file capturing the background launch's stdout+stderr.
PORT=$(grep -oE 'http://localhost:[0-9]+' "$LAUNCH_LOG" | head -1 | grep -oE '[0-9]+$')
[ -z "$PORT" ] && { echo "Could not detect dev server port — see $LAUNCH_LOG"; exit 1; }
curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 30 "http://localhost:$PORT/"
```

Expect HTTP 200. Use a generous timeout (~30s) — Next's first request triggers route compilation, which can take 5–10s on a cold start.

If the detected port is **not** 3000, surface that to the user in the final report so they know what's listening (and can free `:3000` if they want the conventional port for future runs). Do **not** treat the fallback as a skill failure — it's a working dev server, just on a different port.

**c. Clean up.**

Terminate the launch process. Then stop the daemon — the daemon **outlives** launch by design (started with `nohup ... &; disown`), so explicit cleanup is needed:

```bash
npm run db:stop
```

Do not leave a dev server or daemon running.

**d. Stage all post-scaffold changes.**

create-t3-app's `git init && git add .` runs early in Step 3, *before* any of the Steps 4–6 fixes (peer bumps, env edits, schema prefix, drizzle config, scripts/, `.env`, `.gitignore`). All those modifications therefore sit as unstaged changes on top of the staged scaffold. Run a final `git add .` so the staged tree reflects the actual end state — otherwise a naive `git commit` would commit only the unmodified scaffold and silently leave the skill's fixes out:

```bash
git add .
```

This also handles the preexisting-`.git` case (Step 3 special case): the scaffolded files that ended up untracked after the `.git` overwrite get staged here too. Either way, after this step `git status` shows a single staged tree ready to commit.

**Common failure modes:**
- Daemon won't start → check `.pglite/daemon.log`. Most common: another process is on `:5432` (real Postgres, prior PGlite, etc.). The script short-circuits with "DB daemon already running on :5432" — which is a *false positive* if the prior thing is unrelated. Have the user kill it or change the port.
- HTTP probe fails despite "Ready in" → Next is mid-compile; retry the curl after another few seconds before declaring failure.
- Scaffold step (Step 3) failed with `ERR_TTY_INIT_FAILED` or hung → the dotfile stash didn't catch something. The Step 3 script's own sanity check (`find . -mindepth 1 -maxdepth 1` post-stash) catches this and aborts before scaffolding; the error message lists what's still in the directory. If the directory is genuinely empty and the error still fires, it's an unrelated Node TTY bug — try a different Node version (Node 22 LTS is known-good).
- Step 3 script aborted partway through (process killed, system crash) → the user's dotfiles are still in `$TMPDIR/t3-stash.*` (or `/tmp/t3-stash.*`). Find the leftover with `ls -d ${TMPDIR:-/tmp}/t3-stash.*` and move its contents back into the project root manually before re-running.

### 8. Report

After every preceding step succeeded, print exactly the block below — verbatim, nothing before it (other than the per-component success lines defined in "Output style"), nothing after it. No commentary on stack contents, file changes, git status, deployment, or "what was set up".

```
## How to use

- `npm run app` — start the DB daemon and dev server
- `npm run db:push` — apply schema changes after editing `src/server/db/schema.ts`
- `npm run db:stop` — shut down the DB daemon
```

If `npm run app` bound to a non-3000 port during Step 7b, append exactly one line: `Dev server is on port <N> (something else was on :3000).` Otherwise omit.

Do not commit on the user's behalf. Do not push. The user does the `git commit` themselves — Step 7d already staged everything, so `git commit -m "initial commit"` works whenever they're ready. Do not mention this in chat output unless asked; it is implicit.

## Failure surface

A success line is a load-bearing claim. Only print `<component> installed/configured/verified` after the corresponding step actually succeeded by its own check (artifact existence, exit code where reliable, HTTP probe, etc.). If a step partially worked — daemon started but `db:push` failed, or `db:push` succeeded but the HTTP probe didn't return 200 — do **not** print the next success line. Stop, surface the actual error, and do not print the "How to use" block. The user must be able to trust that seeing the full success sequence means the project actually works end-to-end via `npm run app`.
