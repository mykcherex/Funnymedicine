import { ChatMessage } from '../types';

const DB_NAME = 'docugemini_db';
const DB_VERSION = 1;
const STORE_NAME = 'chat_messages';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB not supported'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  return dbPromise;
}

/**
 * Persist chat messages to IndexedDB (asynchronous, high capacity)
 */
export async function saveMessagesToIdb(messages: ChatMessage[]): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Clear existing records in store and rewrite current list
      store.clear();

      for (const msg of messages) {
        store.put(msg);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('IndexedDB transaction failed to save messages:', tx.error);
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Could not save messages to IndexedDB:', err);
  }
}

/**
 * Retrieve chat messages from IndexedDB
 */
export async function loadMessagesFromIdb(): Promise<ChatMessage[] | null> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = request.result as ChatMessage[];
        if (Array.isArray(result) && result.length > 0) {
          // Sort by timestamp
          result.sort((a, b) => a.timestamp - b.timestamp);
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Clear chat messages from IndexedDB
 */
export async function clearMessagesFromIdb(): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore errors on clear
  }
}
