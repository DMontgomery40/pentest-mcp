#!/usr/bin/env node

// Test Multi-Transport Implementation

import { spawn } from 'child_process';

console.log('=== Testing Pentest MCP Multi-Transport ===\n');

async function testTransport(transport, port) {
  console.log(`Testing ${transport} transport...`);
  
  const env = { ...process.env, MCP_TRANSPORT: transport };
  if (port) {
    env.MCP_SERVER_PORT = port.toString();
  }
  
  const child = spawn('node', ['dist/index.js'], {
    env,
    stdio: 'pipe'
  });
  
  let output = '';
  child.stderr.on('data', (data) => {
    output += data.toString();
  });
  
  // Give it 2 seconds to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check if it started correctly
  if (output.includes(`with ${transport} transport`)) {
    console.log(`✓ ${transport} transport started successfully`);
    
    // For HTTP/SSE, try to fetch health endpoint
    if (transport !== 'stdio') {
      try {
        const response = await fetch(`http://localhost:${port || 8000}/health`);
        const data = await response.json();
        console.log(`✓ Health check passed:`, data);
      } catch (e) {
        console.log(`✗ Health check failed:`, e.message);
      }
    }
  } else {
    console.log(`✗ ${transport} transport failed to start`);
    console.log('Output:', output);
  }
  
  // Kill the process
  child.kill();
  console.log('');
}

async function main() {
  // Test each transport
  await testTransport('stdio');
  await testTransport('http', 8000);
  await testTransport('sse', 8001);
  
  console.log('=== Test Complete ===');
}

main().catch(console.error);
