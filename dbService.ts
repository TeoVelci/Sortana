const DB_NAME = 'sortana_db';
const STORE_NAME = 'files';
const DB_VERSION = 1;

/**
 * Opens the IndexedDB database.
 */
export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Create object store with 'id' as the key
        db.createObjectStore(STORE_NAME); 
      }
    };
  });
};

/**
 * Saves a file Blob to the database.
 */
export const saveFileToDB = async (id: string, file: Blob): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(file, id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(`Failed to save file ${id} to DB`, e);
    throw e;
  }
};

/**
 * Retrieves a file Blob from the database.
 */
export const getFileFromDB = async (id: string): Promise<Blob | undefined> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(`Failed to get file ${id} from DB`, e);
    return undefined;
  }
};

/**
 * Deletes a file from the database.
 */
export const deleteFileFromDB = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(`Failed to delete file ${id} from DB`, e);
    throw e;
  }
};
