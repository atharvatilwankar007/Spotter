// Stores Ghost Set recordings (body points only, never video) in IndexedDB on the phone.
import type { Recording } from './pose';

const DB = 'spotter-ghosts';
const STORE = 'recs';
const KEEP_PER_EXERCISE = 4;

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('exId', 'exId');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function listGhosts(exId: string): Promise<Recording[]> {
  try {
    const d = await db();
    const all = await req(d.transaction(STORE).objectStore(STORE).index('exId').getAll(exId));
    return (all as Recording[]).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** the ghost to race: your most recent tracked set of this exercise from an earlier workout */
export async function latestGhost(exId: string, notSessionId?: string): Promise<Recording | null> {
  const list = await listGhosts(exId);
  return list.find((r) => r.sessionId !== notSessionId && r.reps.length >= 2) ?? null;
}

export async function saveGhost(rec: Recording) {
  try {
    const d = await db();
    const list = await listGhosts(rec.exId);
    const tx = d.transaction(STORE, 'readwrite');
    const s = tx.objectStore(STORE);
    s.put(rec);
    list.slice(KEEP_PER_EXERCISE - 1).forEach((r) => s.delete(r.id));
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* storage unavailable */
  }
}
