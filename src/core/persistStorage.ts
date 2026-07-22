import { createJSONStorage, type PersistStorage } from "zustand/middleware";

const databaseName = "diorna-web-state";
const storeName = "state";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName))
        request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open web state database"));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const request = operation(database.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to access web state"));
  }).finally(() => database.close());
}

const indexedDbPersistStorage: PersistStorage<unknown> = {
  async getItem(name) {
    const legacy = localStorage.getItem(name);
    if (legacy !== null) {
      const parsed = JSON.parse(legacy) as unknown;
      await transaction("readwrite", (store) => store.put(parsed, name));
      localStorage.removeItem(name);
      return parsed as never;
    }
    const stored = await transaction<unknown>("readonly", (store) => store.get(name));
    return (typeof stored === "string" ? JSON.parse(stored) : (stored ?? null)) as never;
  },
  async setItem(name, value) {
    await transaction("readwrite", (store) => store.put(value, name));
  },
  async removeItem(name) {
    localStorage.removeItem(name);
    await transaction("readwrite", (store) => store.delete(name));
  },
};

export function persistStorage(): PersistStorage<unknown> {
  if ("__TAURI_INTERNALS__" in window || !("indexedDB" in window))
    return createJSONStorage(() => localStorage) as PersistStorage<unknown>;
  return indexedDbPersistStorage;
}
