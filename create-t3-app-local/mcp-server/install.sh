#!/usr/bin/env bash
# Lazily install / refresh the MCP server's runtime files into ${CLAUDE_PLUGIN_DATA}.
#
# We copy server.js + package.json into CLAUDE_PLUGIN_DATA and run `npm install`
# there so its node_modules sits adjacent to server.js. This is required because
# Node's ESM module resolver ignores NODE_PATH — it only walks up from the
# importing file looking for `node_modules`. Putting node_modules in the plugin
# data dir without server.js next to it (the previous design) would fail with
# `ERR_MODULE_NOT_FOUND` for every dependency.
#
# Both copies are diff-gated so re-running this on a current install is a no-op.

set -e

mkdir -p "${CLAUDE_PLUGIN_DATA}"

if ! diff -q "${CLAUDE_PLUGIN_ROOT}/mcp-server/server.js" "${CLAUDE_PLUGIN_DATA}/server.js" >/dev/null 2>&1; then
  cp "${CLAUDE_PLUGIN_ROOT}/mcp-server/server.js" "${CLAUDE_PLUGIN_DATA}/server.js"
fi

if ! diff -q "${CLAUDE_PLUGIN_ROOT}/mcp-server/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" >/dev/null 2>&1; then
  cp "${CLAUDE_PLUGIN_ROOT}/mcp-server/package.json" "${CLAUDE_PLUGIN_DATA}/package.json"
  (cd "${CLAUDE_PLUGIN_DATA}" && npm install --silent)
fi
