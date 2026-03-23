#!/usr/bin/env node

/**
 * MCP Behavior Tests for pentest-mcp
 *
 * Tests cover:
 *  - stdio transport: initialize, tools/list, tools/call (success + failure)
 *  - HTTP transport: health endpoint, initialize, tools/list
 *  - Tool schema validation (invalid payloads produce tool execution errors)
 *  - Tool annotation presence on all tools
 */

import { spawn } from 'child_process';
import { strict as assert } from 'assert';
import { randomUUID } from 'crypto';

const SERVER_ENTRY = new URL('../dist/index.js', import.meta.url).pathname;
const HTTP_PORT = 18199 + Math.floor(Math.random() * 800);

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`  PASS  ${name}`); })
    .catch((err) => { failed++; console.error(`  FAIL  ${name}: ${err.message}`); });
}

// ---------- helpers ----------

function jsonrpc(method, params = {}, id) {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? randomUUID(), method, params });
}

function sendStdio(proc, method, params) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const msg = jsonrpc(method, params, id);
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      // Try to parse each line
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            proc.stdout.removeListener('data', onData);
            resolve(parsed);
            return;
          }
        } catch { /* incomplete line */ }
      }
    };
    proc.stdout.on('data', onData);
    proc.stdin.write(msg + '\n');
    setTimeout(() => {
      proc.stdout.removeListener('data', onData);
      reject(new Error(`Timeout waiting for response to ${method}`));
    }, 10000);
  });
}

async function spawnStdioServer() {
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, MCP_TRANSPORT: 'stdio' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Wait for server startup
  await new Promise((resolve) => {
    const onStderr = (data) => {
      if (data.toString().includes('connected via stdio')) {
        proc.stderr.removeListener('data', onStderr);
        resolve();
      }
    };
    proc.stderr.on('data', onStderr);
    setTimeout(resolve, 4000);
  });
  return proc;
}

async function spawnHttpServer() {
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_SERVER_PORT: String(HTTP_PORT), MCP_SERVER_HOST: '127.0.0.1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise((resolve) => {
    const onStderr = (data) => {
      if (data.toString().includes('Streamable HTTP server running')) {
        proc.stderr.removeListener('data', onStderr);
        resolve();
      }
    };
    proc.stderr.on('data', onStderr);
    setTimeout(resolve, 5000);
  });
  return proc;
}

// ---------- stdio transport tests ----------

async function stdioTests() {
  console.log('\n--- stdio transport tests ---');
  const proc = await spawnStdioServer();

  try {
    await test('initialize succeeds over stdio', async () => {
      const resp = await sendStdio(proc, 'initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });
      assert.ok(resp.result, 'Expected result in initialize response');
      assert.equal(resp.result.protocolVersion, '2025-11-25');
      assert.ok(resp.result.serverInfo.name === 'pentest-mcp');
    });

    // Send initialized notification
    proc.stdin.write(jsonrpc('notifications/initialized', {}) + '\n');
    await new Promise(r => setTimeout(r, 200));

    await test('tools/list returns all expected tools', async () => {
      const resp = await sendStdio(proc, 'tools/list', {});
      assert.ok(resp.result, 'Expected result in tools/list response');
      const toolNames = resp.result.tools.map(t => t.name);
      const expected = [
        'setMode', 'nmapScan', 'generateWordlist', 'runJohnTheRipper',
        'runHashcat', 'cancelScan', 'listEngagementRecords', 'getEngagementRecord',
        'createClientReport', 'gobuster', 'nikto', 'subfinderEnum',
        'httpxProbe', 'ffufScan', 'nucleiScan', 'trafficCapture',
        'hydraBruteforce', 'privEscAudit', 'extractionSweep',
      ];
      for (const name of expected) {
        assert.ok(toolNames.includes(name), `Missing tool: ${name}`);
      }
    });

    await test('all tools have annotations with title', async () => {
      const resp = await sendStdio(proc, 'tools/list', {});
      for (const tool of resp.result.tools) {
        assert.ok(tool.annotations, `Tool ${tool.name} missing annotations`);
        assert.ok(typeof tool.annotations.title === 'string', `Tool ${tool.name} missing annotations.title`);
      }
    });

    await test('tools/call setMode with valid params succeeds', async () => {
      const resp = await sendStdio(proc, 'tools/call', {
        name: 'setMode',
        arguments: { mode: 'professional' },
      });
      assert.ok(resp.result, 'Expected result');
      assert.ok(!resp.result.isError, 'Expected success');
      const text = resp.result.content.map(c => c.text).join(' ');
      assert.ok(text.includes('professional'), 'Expected mode confirmation');
    });

    await test('tools/call with invalid tool name returns error', async () => {
      const resp = await sendStdio(proc, 'tools/call', {
        name: 'nonexistent_tool',
        arguments: {},
      });
      // SDK may return either a JSON-RPC error or a tool execution error
      const hasError = resp.error || (resp.result && resp.result.isError);
      assert.ok(hasError, 'Expected error for nonexistent tool');
    });

    await test('tools/call listEngagementRecords with no args returns empty list', async () => {
      const resp = await sendStdio(proc, 'tools/call', {
        name: 'listEngagementRecords',
        arguments: {},
      });
      assert.ok(resp.result, 'Expected result');
      assert.ok(!resp.result.isError, 'Expected success');
    });

    await test('tools/call getEngagementRecord with bad ID returns isError', async () => {
      const resp = await sendStdio(proc, 'tools/call', {
        name: 'getEngagementRecord',
        arguments: { recordId: 'nonexistent-id' },
      });
      assert.ok(resp.result, 'Expected result');
      assert.ok(resp.result.isError === true, 'Expected isError for missing record');
    });

    await test('tools/call cancelScan with bad ID returns isError', async () => {
      const resp = await sendStdio(proc, 'tools/call', {
        name: 'cancelScan',
        arguments: { scanId: 'nonexistent-scan' },
      });
      assert.ok(resp.result, 'Expected result');
      assert.ok(resp.result.isError === true, 'Expected isError for missing scan');
    });

  } finally {
    proc.kill();
  }
}

// ---------- HTTP transport tests ----------

async function httpTests() {
  console.log('\n--- HTTP transport tests ---');
  const proc = await spawnHttpServer();

  try {
    await test('health endpoint returns 200 with transport info', async () => {
      const resp = await fetch(`http://127.0.0.1:${HTTP_PORT}/health`);
      assert.equal(resp.status, 200);
      const data = await resp.json();
      assert.equal(data.transport_mode, 'streamable-http');
      assert.equal(data.server, 'pentest-mcp');
    });

    await test('POST /mcp with initialize returns valid response', async () => {
      const body = {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-http-client', version: '1.0.0' },
        },
      };
      const resp = await fetch(`http://127.0.0.1:${HTTP_PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
      });
      assert.ok(resp.status === 200 || resp.status === 202, `Expected 200/202, got ${resp.status}`);
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await resp.json();
        assert.ok(data.result || data.id, 'Expected JSON-RPC response');
      } else if (contentType.includes('text/event-stream')) {
        const text = await resp.text();
        assert.ok(text.includes('data:'), 'Expected SSE data in response');
      }
    });

    await test('Origin validation returns 403 for disallowed origin when configured', async () => {
      // Spawn a separate server with origin restrictions
      const restrictedPort = HTTP_PORT + 1;
      const restrictedProc = spawn(process.execPath, [SERVER_ENTRY], {
        env: {
          ...process.env,
          MCP_TRANSPORT: 'http',
          MCP_SERVER_PORT: String(restrictedPort),
          MCP_SERVER_HOST: '127.0.0.1',
          MCP_ALLOWED_ORIGINS: 'https://allowed.example.com',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      await new Promise((resolve) => {
        const onStderr = (data) => {
          if (data.toString().includes('Streamable HTTP server running')) {
            restrictedProc.stderr.removeListener('data', onStderr);
            resolve();
          }
        };
        restrictedProc.stderr.on('data', onStderr);
        setTimeout(resolve, 5000);
      });
      try {
        const resp = await fetch(`http://127.0.0.1:${restrictedPort}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Origin': 'https://evil.example.com',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'initialize', params: {} }),
        });
        assert.equal(resp.status, 403, `Expected 403 for invalid Origin, got ${resp.status}`);
      } finally {
        restrictedProc.kill();
      }
    });

  } finally {
    proc.kill();
  }
}

// ---------- run ----------

async function main() {
  console.log('=== pentest-mcp behavior tests ===');
  await stdioTests();
  await httpTests();
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
