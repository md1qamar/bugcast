import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectWorkspaceContext } from '../server/gitContext.js';

test('collectWorkspaceContext extracts package metadata and env key names without exposing secret values', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugcast-ctx-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo-app',
        version: '1.2.3',
        dependencies: { react: '^18.3.0' },
        devDependencies: { vite: '^6.0.0' },
      })
    );
    fs.writeFileSync(
      path.join(dir, '.env'),
      'API_KEY=super_secret_should_never_appear\nPORT=3000\n'
    );

    const ctx = await collectWorkspaceContext(dir);
    assert.equal(ctx.projectName, 'demo-app');
    assert.equal(ctx.projectVersion, '1.2.3');
    assert.ok(ctx.frameworks.includes('react@^18.3.0'));
    assert.ok(ctx.frameworks.includes('vite@^6.0.0'));
    assert.ok(ctx.envKeys.includes('API_KEY'));
    assert.ok(ctx.envKeys.includes('PORT'));
    assert.equal(ctx.runtime.nodeVersion, process.version);
    assert.equal(JSON.stringify(ctx).includes('super_secret_should_never_appear'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
