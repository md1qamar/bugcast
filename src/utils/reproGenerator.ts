import { BrowserEventEntry, BugReport } from '../types';
import { redactText } from './secretRedactor';

function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Generate a ready-to-run redacted cURL command from a captured failed browser HTTP event.
 */
export function generateCurlCommand(event: BrowserEventEntry): string | null {
  const url = event.requestUrl || (event.message.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  if (!url) return null;

  const method = (event.method || event.message.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b/i)?.[1] || 'GET').toUpperCase();
  const safeUrl = redactText(url, { redactSecrets: true }).text;

  const parts: string[] = [`curl -i -X ${method} ${shellEscapeSingle(safeUrl)}`];

  if (event.requestHeaders) {
    for (const [key, val] of Object.entries(event.requestHeaders)) {
      if (/^(host|content-length|connection|user-agent)$/i.test(key)) continue;
      if (/^(authorization|cookie|x-api-key|x-auth-token)$/i.test(key)) {
        parts.push(`  -H ${shellEscapeSingle(`${key}: [REDACTED]`)}`);
      } else {
        const cleanVal = redactText(val, { redactSecrets: true }).text;
        parts.push(`  -H ${shellEscapeSingle(`${key}: ${cleanVal}`)}`);
      }
    }
  }

  if (event.requestBody && method !== 'GET' && method !== 'HEAD') {
    const cleanBody = redactText(event.requestBody, { redactSecrets: true }).text;
    parts.push(`  -d ${shellEscapeSingle(cleanBody)}`);
  }

  return parts.join(' \\\n');
}

/**
 * Generate a clean Playwright reproduction test snippet from the session.
 */
export function generatePlaywrightSnippet(
  report: BugReport,
  failedEvent?: BrowserEventEntry
): string {
  const targetUrl =
    failedEvent?.url ||
    failedEvent?.requestUrl ||
    'http://localhost:3000';
  const apiUrl = failedEvent?.requestUrl || '';
  const apiMethod = failedEvent?.method || 'GET';

  const stepComments = (report.stepsToReproduce || [])
    .map((s, i) => `  // Step ${i + 1}: ${s}`)
    .join('\n');

  if (apiUrl) {
    return `import { test, expect } from '@playwright/test';

test(${JSON.stringify(report.title || 'reproduce captured bug')}, async ({ page, request }) => {
${stepComments || '  // Reproduce captured failing request'}
  await page.goto(${JSON.stringify(targetUrl)});

  const response = await request.fetch(${JSON.stringify(apiUrl)}, {
    method: ${JSON.stringify(apiMethod)},${
      failedEvent?.requestBody
        ? `\n    data: ${JSON.stringify(redactText(failedEvent.requestBody).text)},`
        : ''
    }
  });
  expect(response.status()).toBeLessThan(400);
});`;
  }

  return `import { test, expect } from '@playwright/test';

test(${JSON.stringify(report.title || 'reproduce captured bug')}, async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto(${JSON.stringify(targetUrl)});
${stepComments || '  // Perform recorded UI actions here'}

  expect(consoleErrors).toEqual([]);
});`;
}
