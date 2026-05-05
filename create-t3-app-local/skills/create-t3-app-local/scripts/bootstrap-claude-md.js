#!/usr/bin/env node
// bootstrap-claude-md.js
// Append the MCP `## Local database` section to CLAUDE.md and convert the file
// into a strict-index structure, with each `##` section extracted into its own
// `.claude/topics/<slug>.md` file.
//
// Usage: node bootstrap-claude-md.js <project-slug>
//
// Idempotent: if `.claude/topics/local-database.md` already exists, the script
// is a no-op and exits 0 with a "skipped" message.
//
// No external dependencies — uses Node built-ins only.

const fs = require('node:fs');
const path = require('node:path');

// ---- Args ----------------------------------------------------------------

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: bootstrap-claude-md.js <project-slug>');
  process.exit(1);
}

const cwd = process.cwd();
const claudeMdPath = path.join(cwd, 'CLAUDE.md');
const topicsDir = path.join(cwd, '.claude', 'topics');
const localDbTopicPath = path.join(topicsDir, 'local-database.md');
const templatePath = path.resolve(
  __dirname,
  '..',
  'references',
  'claude-md-template.md',
);

// ---- Idempotency --------------------------------------------------------
//
// Two signals — either one means "already done, don't re-run":
//   1. `.claude/topics/local-database.md` already exists (this script ran).
//   2. CLAUDE.md is already in indexed form (someone migrated by another path
//      — appending an MCP section to an index file would corrupt it).

const alreadyIndexed =
  fs.existsSync(claudeMdPath) &&
  fs
    .readFileSync(claudeMdPath, 'utf8')
    .trim()
    .startsWith('# CLAUDE.md — Project Index');

if (fs.existsSync(localDbTopicPath) || alreadyIndexed) {
  console.log('CLAUDE.md already bootstrapped — skipping');
  process.exit(0);
}

// ---- 1. Ensure CLAUDE.md exists -----------------------------------------

if (!fs.existsSync(claudeMdPath)) {
  fs.writeFileSync(claudeMdPath, '');
}

// ---- 2. Append the MCP `## Local database` section ----------------------

const mcpSection = `## Local database

This project is registered with the \`t3-local-pg\` MCP server as **\`${slug}\`**. Pass this name as the \`project\` argument when calling \`query\`, \`query_write\`, \`describe\`, or \`list_projects\`.

**When to use the MCP server.** Any natural-language question about the project's *data* — what's in a table, what value a row has, how many records match a condition, what the schema looks like — must be answered by calling a \`t3-local-pg\` MCP tool, not by reading source code, guessing from \`schema.ts\`, or asking the user to run SQL themselves. Concretely:

- "What's the value of X?" / "What rows match Y?" / "How many Zs are there?" → \`query\` (read-only).
- "What tables exist?" / "What columns does table X have?" → \`describe\`.
- "What projects are registered?" → \`list_projects\`.
- "Insert / update / delete this record" — only when the user has clearly asked for a mutation → \`query_write\`.

The Postgres server runs on \`127.0.0.1:5432\` on the host machine and is **not reachable from any sandboxed bash environment** (Cowork's bash, Claude Code's sandbox, etc.). The MCP server is the only path. Do not try to work around it with \`psql\` shell calls, network requests, or by inferring values from the codebase — call the tool.

**Retry once if the MCP tools aren't visible at session start.** The \`mcp__plugin_create-t3-app-local_t3-local-pg__*\` tools sometimes aren't in the initial deferred-tool snapshot — they register a beat after the session prompt is composed and a follow-up system message surfaces them. If the tools aren't visible when a data question comes in, do **not** immediately declare the MCP server unavailable or walk the user through a misconfiguration diagnostic ("restart Cowork", "check \`brew services\`", "reinstall the plugin", etc.). Wait briefly and retry \`ToolSearch\` once. Only if the tools are *still* missing after a retry, frame it as a timing/registration issue and offer to retry again — don't lead with a misconfiguration diagnostic.
`;

let claudeMd = fs.readFileSync(claudeMdPath, 'utf8');
// Normalize trailing whitespace, then ensure a blank-line separator before appending.
claudeMd = claudeMd.replace(/\s+$/, '');
if (claudeMd.length > 0) {
  claudeMd += '\n\n';
}
claudeMd += mcpSection;
fs.writeFileSync(claudeMdPath, claudeMd);

// ---- 3. Parse into sections ---------------------------------------------
//
// Each `##` heading at column 0 (and outside a fenced code block) starts a new
// section. Content above the first `##` is the preamble.

const lines = claudeMd.split('\n');
const sections = [];
let current = { heading: null, body: [] };
let inFence = false;

for (const line of lines) {
  if (/^```/.test(line)) {
    inFence = !inFence;
    current.body.push(line);
    continue;
  }
  if (!inFence) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      sections.push(current);
      current = { heading: m[1].trim(), body: [] };
      continue;
    }
  }
  current.body.push(line);
}
sections.push(current);

const preamble = sections[0].heading === null ? sections.shift() : null;

// ---- 4. Classify substantive vs stub ------------------------------------

const SUBSTANTIVE_THRESHOLD = 5;

function countNonBlankNonHeading(body) {
  return body.filter((l) => l.trim() && !/^#{1,6}\s/.test(l)).length;
}

const substantive = [];
const stubs = [];
for (const section of sections) {
  if (countNonBlankNonHeading(section.body) >= SUBSTANTIVE_THRESHOLD) {
    substantive.push(section);
  } else {
    stubs.push(section);
  }
}

// ---- 5. Slugify ----------------------------------------------------------

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const usedSlugs = new Set();
function uniqueSlug(base, fallbackIdx) {
  let baseSlug = base || `topic-${fallbackIdx}`;
  let attempt = baseSlug;
  let n = 2;
  while (usedSlugs.has(attempt)) {
    attempt = `${baseSlug}-${n++}`;
  }
  usedSlugs.add(attempt);
  return attempt;
}

// ---- 6. Hook generator ---------------------------------------------------
//
// Take the first non-blank line of the body, strip basic markdown formatting,
// cap at 150 chars on a word boundary. Imperfect but deterministic — Claude
// can refine later. The MCP `Local database` section gets a hand-crafted hook
// since this script controls its content and we want strong keyword coverage
// for routing future data questions.

const HARDCODED_HOOKS = {
  'Local database':
    "t3-local-pg MCP server slug for this project — call query, query_write, describe, list_projects with this project name. Don't read schema.ts to answer data questions.",
};

function truncateAtWord(s, maxLen) {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen - 3);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > maxLen / 2 ? cut.slice(0, lastSpace) : cut;
  return trimmed.replace(/[.,;:—–-]+$/, '') + '...';
}

function generateHook(section) {
  if (HARDCODED_HOOKS[section.heading]) {
    return HARDCODED_HOOKS[section.heading];
  }
  let firstLine = '';
  for (const line of section.body) {
    if (line.trim()) {
      firstLine = line.trim();
      break;
    }
  }
  const stripped = firstLine
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
    .trim();
  return truncateAtWord(stripped, 150);
}

// ---- 7. Write substantive topic files -----------------------------------

fs.mkdirSync(topicsDir, { recursive: true });

const indexEntries = [];

substantive.forEach((section, idx) => {
  const fileSlug = uniqueSlug(slugify(section.heading), idx + 1);
  const hook = generateHook(section);

  // Trim leading and trailing blank lines from the body.
  let body = [...section.body];
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();

  const content = `${hook}\n\n${body.join('\n')}\n`;
  fs.writeFileSync(path.join(topicsDir, `${fileSlug}.md`), content);
  indexEntries.push({ slug: fileSlug, hook });
});

// ---- 8. Write misc.md (stubs + preserved preamble) ----------------------

const miscParts = [];
const preambleText = preamble ? preamble.body.join('\n').trim() : '';
if (preambleText) {
  // If the preamble looks like instructions for Claude, preserve under a
  // dedicated subheading. Otherwise treat as a plain stub.
  const looksLikeInstructions =
    /\b(should|must|never|always|do not|don't|prefer)\b/i.test(preambleText);
  if (looksLikeInstructions) {
    miscParts.push(`### Preamble (preserved)\n\n${preambleText}`);
  } else {
    miscParts.push(preambleText);
  }
}
for (const stub of stubs) {
  if (!stub.heading) continue;
  const stubBody = stub.body.join('\n').trim();
  miscParts.push(`### ${stub.heading}\n\n${stubBody}`.trim());
}

if (miscParts.length > 0) {
  const hook =
    "Miscellaneous short topics that don't merit standalone files (preamble, stubs).";
  const content = `${hook}\n\n${miscParts.join('\n\n')}\n`;
  fs.writeFileSync(path.join(topicsDir, 'misc.md'), content);
  indexEntries.push({ slug: 'misc', hook });
}

// ---- 9. Sort index entries alphabetically -------------------------------

indexEntries.sort((a, b) => a.slug.localeCompare(b.slug));
const indexBlock = indexEntries
  .map((e) => `- [${e.slug}](.claude/topics/${e.slug}.md) — ${e.hook}`)
  .join('\n');

// ---- 10. Rewrite CLAUDE.md from template --------------------------------

if (!fs.existsSync(templatePath)) {
  console.error(`Template not found at ${templatePath}`);
  process.exit(1);
}
const template = fs.readFileSync(templatePath, 'utf8');
let out = template.replace(/<!-- INDEX_ENTRIES -->/, indexBlock);
if (!out.endsWith('\n')) out += '\n';
fs.writeFileSync(claudeMdPath, out);

console.log(
  `CLAUDE.md indexed: ${indexEntries.length} topic file(s) written to .claude/topics/`,
);
