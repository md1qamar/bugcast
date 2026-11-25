import { SystemDiagnostics, WorkspaceContext } from '../types';

export function getSystemDiagnostics(): SystemDiagnostics {
  const ua = navigator.userAgent;

  // OS Detection
  let os = 'Unknown OS';
  if (ua.indexOf('Win') !== -1) os = 'Windows';
  else if (ua.indexOf('Mac') !== -1) os = 'macOS';
  else if (ua.indexOf('Linux') !== -1) os = 'Linux';
  else if (ua.indexOf('Android') !== -1) os = 'Android';
  else if (ua.indexOf('like Mac') !== -1) os = 'iOS';

  // Browser Detection
  let browser = 'Unknown Browser';
  let browserVersion = 'Unknown';

  if (ua.indexOf('Firefox') > -1) {
    browser = 'Firefox';
    browserVersion = ua.match(/Firefox\/([0-9.]+)/)?.[1] || '';
  } else if (ua.indexOf('Edg') > -1) {
    browser = 'Microsoft Edge';
    browserVersion = ua.match(/Edg\/([0-9.]+)/)?.[1] || '';
  } else if (ua.indexOf('Chrome') > -1) {
    browser = 'Chrome';
    browserVersion = ua.match(/Chrome\/([0-9.]+)/)?.[1] || '';
  } else if (ua.indexOf('Safari') > -1) {
    browser = 'Safari';
    browserVersion = ua.match(/Version\/([0-9.]+)/)?.[1] || '';
  }

  const urlParams = new URLSearchParams(window.location.search);
  const gitBranch = urlParams.get('branch') || undefined;
  const gitCommit = urlParams.get('commit') || undefined;
  const repoUrl = urlParams.get('repo') || undefined;
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;

  return {
    os,
    browser,
    browserVersion,
    userAgent: ua,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemory: deviceMemory || undefined,
    language: navigator.language || 'en-US',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    gitBranch,
    gitCommit,
    repoUrl,
  };
}

export async function fetchWorkspaceContext(): Promise<WorkspaceContext | null> {
  try {
    const res = await fetch('/api/context');
    if (!res.ok) return null;
    return (await res.json()) as WorkspaceContext;
  } catch {
    return null;
  }
}
