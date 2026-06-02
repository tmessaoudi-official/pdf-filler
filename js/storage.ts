import type { DocumentPage, WatermarkSettings } from './documentModel';
import type { ElementJSON } from './pdfElement';

export interface SavedState {
  elements: ElementJSON[];
  pages: DocumentPage[];
  watermark: WatermarkSettings;
  currentPageIndex: number;
  // Source PDF bytes keyed by sourcePdfId
  sourcePdfs: Array<{ id: string; name: string; bytes: Uint8Array }>;
}

const DB_NAME = 'pdf-editor';
const DB_VERSION = 2;
const STORE = 'state';
const KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(state: SavedState): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IDB unavailable (private browsing, storage full) — silently skip
  }
}

export async function loadState(): Promise<SavedState | null> {
  try {
    const db = await openDB();
    return await new Promise<SavedState | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as SavedState | null ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearState(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
