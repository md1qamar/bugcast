import { BrowserEventEntry, BugReport } from '../types';

export interface RedactOptions {
  redactSecrets?: boolean;
  redactEmails?: boolean;
}

export interface RedactTextResult {
  text: string;
  count: number;
  categories: string[];
}

interface Rule {
  name: string;
  pattern: RegExp;
  replace: (...args: string[]) => string;
}

const SECRET_RULES: Rule[] = [
  {
    name: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: () => '[REDACTED_JWT]',
  },
  {
    name: 'API Key',
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}\b/g,
    replace: () => '[REDACTED_API_KEY]',
  },
  {
    name: 'GitHub Token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replace: () => '[REDACTED_GH_TOKEN]',
  },
  {
    name: 'AWS Key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replace: () => '[REDACTED_AWS_KEY]',
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => '[REDACTED_PRIVATE_KEY]',
  },
  {
    name: 'Auth Header',
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]{12,}=*/gi,
    replace: (_m, scheme) => `${scheme} [REDACTED_TOKEN]`,
  },
  {
    name: 'Database URI',
    pattern: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([^:\s/@]+):([^@\s/]+)@/gi,
    replace: (_m, proto) => `${proto}://[REDACTED_CREDENTIALS]@`,
  },
  {
    name: 'Secret Assignment',
    pattern: /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY|AUTH_KEY|CLIENT_SECRET|WEBHOOK_SECRET)[A-Z0-9_]*)\s*([:=])\s*(['"]?)([^\s'",}\]]{4,})(['"]?)/gi,
    replace: (_m, key, sep, q1, _val, q2) => `${key}${sep}${q1}[REDACTED]${q2}`,
  },
];

const EMAIL_RULE: Rule = {
  name: 'Email',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  replace: () => '[REDACTED_EMAIL]',
};

/**
 * Redact tokens, credentials, API keys, DB URIs, and optionally emails from raw text.
 */
export function redactText(input: string, options: RedactOptions = {}): RedactTextResult {
  const { redactSecrets = true, redactEmails = false } = options;
  if (!input || (!redactSecrets && !redactEmails)) {
    return { text: input, count: 0, categories: [] };
  }

  let output = input;
  let total = 0;
  const categories = new Set<string>();

  const activeRules = [
    ...(redactSecrets ? SECRET_RULES : []),
    ...(redactEmails ? [EMAIL_RULE] : []),
  ];

  for (const rule of activeRules) {
    output = output.replace(rule.pattern, (...args) => {
      total += 1;
      categories.add(rule.name);
      return rule.replace(...(args as string[]));
    });
  }

  return {
    text: output,
    count: total,
    categories: Array.from(categories),
  };
}

/**
 * Produce a safe redacted copy of a BugReport along with total redactions made.
 */
export function redactBugReport(
  report: BugReport,
  options: RedactOptions = { redactSecrets: true, redactEmails: false }
): { report: BugReport; totalRedactions: number; categories: string[] } {
  let totalRedactions = 0;
  const allCats = new Set<string>();

  const scrub = (val?: string): string => {
    if (!val) return val || '';
    const r = redactText(val, options);
    totalRedactions += r.count;
    r.categories.forEach((c) => allCats.add(c));
    return r.text;
  };

  const scrubHeaders = (headers?: Record<string, string>): Record<string, string> | undefined => {
    if (!headers) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (/^(authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i.test(k)) {
        out[k] = '[REDACTED_HEADER]';
        totalRedactions += 1;
        allCats.add('Auth Header');
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  };

  const safeBrowserEvents: BrowserEventEntry[] = (report.browserEvents || []).map((b) => ({
    ...b,
    message: scrub(b.message),
    url: b.url ? scrub(b.url) : undefined,
    requestUrl: b.requestUrl ? scrub(b.requestUrl) : undefined,
    requestHeaders: scrubHeaders(b.requestHeaders),
    requestBody: b.requestBody ? scrub(b.requestBody) : undefined,
    responsePreview: b.responsePreview ? scrub(b.responsePreview) : undefined,
  }));

  const safeReport: BugReport = {
    ...report,
    title: scrub(report.title),
    description: scrub(report.description),
    expectedBehavior: scrub(report.expectedBehavior),
    actualBehavior: scrub(report.actualBehavior),
    rootCauseHint: report.rootCauseHint ? scrub(report.rootCauseHint) : undefined,
    stepsToReproduce: (report.stepsToReproduce || []).map((s) => scrub(s)),
    consoleLogs: scrub(report.consoleLogs),
    gitDiff: report.gitDiff ? scrub(report.gitDiff) : undefined,
    events: (report.events || []).map((e) => ({
      ...e,
      title: scrub(e.title),
      description: e.description ? scrub(e.description) : undefined,
    })),
    terminalLogs: (report.terminalLogs || []).map((l) => ({
      ...l,
      text: scrub(l.text),
    })),
    browserEvents: safeBrowserEvents,
    transcript: (report.transcript || []).map((t) => ({
      ...t,
      text: scrub(t.text),
    })),
  };

  return {
    report: safeReport,
    totalRedactions,
    categories: Array.from(allCats),
  };
}
