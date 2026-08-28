#!/usr/bin/env node
/**
 * Launcher for the shadcn MCP server.
 *
 * Claude Code spawns MCP servers from the repo root, but this repo is a
 * client/ + server/ pair and the React app owns components.json. The shadcn
 * server resolves that file from process.cwd() and ignores its own --cwd flag,
 * so pointing it at the root yields an empty registry list. Equally, the deps
 * `shadcn add` installs (radix-ui, lucide-react) belong to client/package.json,
 * not the root. Hop into client/ and hand over.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(here, '..', 'client');

const child = spawn('npx', ['-y', 'shadcn@latest', 'mcp'], {
  cwd,
  stdio: 'inherit',            // stdin/stdout are the MCP transport
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
child.on('error', (err) => {
  console.error(`[shadcn-mcp] failed to start: ${err.message}`);
  process.exit(1);
});
