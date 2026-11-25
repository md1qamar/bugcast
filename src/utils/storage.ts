import { BugReport } from '../types';

const DB_NAME = 'BugCastDB';
const DB_VERSION = 1;
const STORE_NAME = 'bug_reports';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveReport(report: BugReport, videoBlob?: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      ...report,
      videoBlob: videoBlob || null,
    };

    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllReports(): Promise<BugReport[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const results = req.result.map((item: any) => {
        let videoBlobUrl = item.videoBlobUrl;
        if (item.videoBlob instanceof Blob) {
          videoBlobUrl = URL.createObjectURL(item.videoBlob);
        }
        return {
          ...item,
          screenshots: item.screenshots || [],
          terminalLogs: item.terminalLogs || [],
          browserEvents: item.browserEvents || [],
          transcript: item.transcript || [],
          studioTheme: item.studioTheme || 'cyber',
          videoBlobUrl,
          videoBlob: undefined,
        } as BugReport;
      });
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteReport(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
