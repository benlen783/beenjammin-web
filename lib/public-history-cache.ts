import type { PublicLastFmHistory } from "@/lib/public-dashboard";

const DATABASE_NAME = "beenjammin-public-lastfm";
const STORE_NAME = "histories";
const VERSION = 1;

function openCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, { keyPath: "usernameKey" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function usernameKey(username: string) {
  return username.trim().toLocaleLowerCase();
}

export async function getCachedPublicHistory(username: string) {
  const database = await openCache();
  return new Promise<PublicLastFmHistory | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction
      .objectStore(STORE_NAME)
      .get(usernameKey(username));
    request.onsuccess = () => {
      const result = request.result as
        (PublicLastFmHistory & { usernameKey: string }) | undefined;
      if (!result) resolve(null);
      else {
        const { usernameKey: _key, ...history } = result;
        void _key;
        resolve(history);
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function cachePublicHistory(history: PublicLastFmHistory) {
  const database = await openCache();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      ...history,
      usernameKey: usernameKey(history.username),
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteCachedPublicHistory(username: string) {
  const database = await openCache();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(usernameKey(username));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
