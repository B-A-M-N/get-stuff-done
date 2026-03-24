#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const PORT = 3011;
const SERVER = path.resolve(__dirname, '../../get-stuff-done/bin/lib/planning-server.cjs');
const TOKEN = 'test-token-123';

let server = null;
let passed = 0, failed = 0;

function start(overrides = {}) {
  const env = { ...process.env, GSD_PLANNING_PORT: PORT, GSD_PLANNING_HOST: '127.0.0.1', PLANNING_SERVER_TOKEN: TOKEN, ...overrides };
  server = spawn('node', [SERVER], { env, stdio: 'ignore' });
}
function stop() {
  if (server && !server.exitCode) {
    server.kill('SIGTERM');
    let waited = 0;
    while (!server.exitCode && waited < 5000) { waited += 100; }
    if (!server.exitCode) server.kill('SIGKILL');
  }
}
function waitReady() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:${PORT}/health`).toString().trim();
      if (code === '200') return;
    } catch (e) {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  }
  throw new Error('timeout waiting for server');
}
function assert(condition, msg) {
  if (condition) { passed++; console.log(`✓ ${msg}`); }
  else { failed++; console.log(`✗ ${msg}`); }
}

console.log('\n=== Planning Server Integration Tests ===\n');

// Start server
start({});
waitReady();

// 1. Network binding
try {
  const out = execSync('ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null').toString();
  assert(out.includes(`127.0.0.1:${PORT}`) || out.includes(`localhost:${PORT}`), 'Network binding to localhost');
} catch (e) { assert(false, 'Network binding: ' + e.message); }

// 2. Auth - missing token
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/health`).toString().trim();
  assert(code === '401' || code === '403', 'Auth: missing token rejected ('+code+')');
} catch (e) { assert(false, 'Auth missing: '+e.message); }

// 3. Auth - valid token
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:${PORT}/health`).toString().trim();
  assert(code === '200', 'Auth: valid token accepted ('+code+')');
} catch (e) { assert(false, 'Auth valid: '+e.message); }

// 4. Auth - invalid token
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer wrong" http://127.0.0.1:${PORT}/health`).toString().trim();
  assert(code === '401' || code === '403', 'Auth: invalid token rejected ('+code+')');
} catch (e) { assert(false, 'Auth invalid: '+e.message); }

// 5. Insecure mode (restart)
stop();
start({ PLANNING_SERVER_INSECURE_LOCAL: '1' });
waitReady();
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${PORT}/health`).toString().trim();
  assert(code === '200', 'Insecure mode: no token required ('+code+')');
} catch (e) { assert(false, 'Insecure mode: '+e.message); }

// 6. Back to secure mode
stop();
start({});
waitReady();

// 7. Metrics endpoint
try {
  const body = execSync(`curl -s -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:${PORT}/metrics`).toString();
  assert(body.includes('planning_server_in_flight_requests') && body.includes('planning_server_requests_total'), 'Metrics endpoint');
} catch (e) { assert(false, 'Metrics: '+e.message); }

// 8. .planning directory blocking (absolute path)
try {
  const cwd = process.cwd();
  const statePath = path.resolve(cwd, '.planning/STATE.md');
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/v1/read?path=${encodeURIComponent(statePath)}"`).toString().trim();
  assert(code === '403', `.planning blocking: 403 denied (got ${code})`);
} catch (e) { assert(false, '.planning blocking: '+e.message); }

// 9. Security headers
try {
  const headers = execSync(`curl -s -I -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:${PORT}/health`).toString();
  assert(headers.includes('X-Content-Type-Options: nosniff') && headers.includes('X-Frame-Options: DENY') && headers.includes('Cache-Control: no-store'), 'Security headers present');
} catch (e) { assert(false, 'Security headers: '+e.message); }

// 10. Health endpoint JSON
try {
  const body = execSync(`curl -s -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:${PORT}/health`).toString();
  const json = JSON.parse(body);
  assert(json.status === 'ok' && 'ast_parser' in json, 'Health endpoint: JSON with ast_parser');
} catch (e) { assert(false, 'Health endpoint: '+ (e.message || 'parse error')); }

// 11. Request validation: null byte
try {
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/v1/read?path=${encodeURIComponent('file\0.js')}"`).toString().trim();
  assert(code === '400', `Validation null byte: 400 (got ${code})`);
} catch (e) { assert(false, 'Validation null byte: '+e.message); }

// 12. Request validation: path length > 4096
try {
  const long = 'A'.repeat(5000);
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/v1/read?path=${encodeURIComponent(long)}"`).toString().trim();
  assert(code === '400', `Validation long path: 400 (got ${code})`);
} catch (e) { assert(false, 'Validation long path: '+e.message); }

// 13. Request validation: file size > 5MB (create file in project root)
const largeFile = path.join(process.cwd(), `TEST_LARGE_${Date.now()}.js`);
try {
  const fd = fs.openSync(largeFile, 'w');
  const buf = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < 6; i++) fs.writeSync(fd, buf);
  fs.closeSync(fd);
  const abs = path.resolve(largeFile);
  const code = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/v1/read?path=${encodeURIComponent(abs)}"`).toString().trim();
  assert(code === '413', `Validation large file: 413 (got ${code})`);
} catch (e) { assert(false, 'Validation large file: '+e.message); }
finally { try { fs.unlinkSync(largeFile); } catch (e) {} }

// 14. Rate limiting (last) - restart server for fresh bucket
stop();
start({});
waitReady();
try {
  const count429 = parseInt(execSync(`for i in \`seq 1 350\`; do curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" http://127.0.0.1:${PORT}/health; done | grep -c 429`).toString().trim() || '0');
  assert(count429 > 0, `Rate limiting: ${count429} requests rate-limited`);
} catch (e) {
  assert(false, 'Rate limiting: no 429 observed');
}

stop();

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
