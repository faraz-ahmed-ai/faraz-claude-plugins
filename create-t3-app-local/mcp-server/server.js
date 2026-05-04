#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REGISTRY_PATH = path.join(os.homedir(), ".t3-local-pg", "registry.json");

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return {};
  const raw = fs.readFileSync(REGISTRY_PATH, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function getProject(name) {
  const reg = loadRegistry();
  if (!reg[name]) {
    const known = Object.keys(reg);
    throw new Error(
      `Unknown project '${name}'. Known projects: ${known.length ? known.join(", ") : "(none registered yet)"}`,
    );
  }
  return reg[name];
}

async function runQuery(connStr, sql, params = []) {
  const client = new pg.Client({
    connectionString: connStr,
    statement_timeout: 30_000,
  });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return {
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  } finally {
    await client.end();
  }
}

const server = new Server(
  { name: "t3-local-pg", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description:
        "List all T3 projects registered with the local Postgres setup. Returns each project's name, database, filesystem path, and the date it was registered.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "query",
      description:
        "Run a read-only SQL query against a project's database. Connects with the project's read-only role — INSERT/UPDATE/DELETE/DDL will fail with a permission error. Use for SELECT, EXPLAIN, and introspection.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project name from list_projects" },
          sql: { type: "string", description: "SQL to execute" },
          params: {
            type: "array",
            description: "Optional positional parameters ($1, $2, ...)",
            items: {},
          },
        },
        required: ["project", "sql"],
      },
    },
    {
      name: "query_write",
      description:
        "Run a SQL query that may modify data (INSERT/UPDATE/DELETE/DDL). Connects with the project's app role. Use only when the user has clearly asked for a mutation; otherwise prefer `query`.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string" },
          sql: { type: "string" },
          params: { type: "array", items: {} },
        },
        required: ["project", "sql"],
      },
    },
    {
      name: "describe",
      description:
        "Describe a project's schema. With no `table`, returns the list of public-schema tables. With a `table`, returns its columns (name, type, nullable, default).",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string" },
          table: { type: "string", description: "Optional. Table to describe." },
        },
        required: ["project"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    if (name === "list_projects") {
      const reg = loadRegistry();
      const projects = Object.entries(reg).map(([k, v]) => ({
        name: k,
        db: v.db,
        path: v.path,
        registered_at: v.registered_at,
      }));
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    }

    if (name === "query") {
      const proj = getProject(args.project);
      const result = await runQuery(proj.ro_url, args.sql, args.params || []);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "query_write") {
      const proj = getProject(args.project);
      const result = await runQuery(proj.url, args.sql, args.params || []);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "describe") {
      const proj = getProject(args.project);
      if (args.table) {
        const sql = `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `;
        const result = await runQuery(proj.ro_url, sql, [args.table]);
        return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
      }
      const sql = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
      const result = await runQuery(proj.ro_url, sql, []);
      return {
        content: [
          { type: "text", text: JSON.stringify(result.rows.map((r) => r.table_name), null, 2) },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
