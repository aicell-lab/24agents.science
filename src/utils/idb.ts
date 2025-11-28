export const get = async (key: string) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keyval');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keyval', 'readonly');
      const store = tx.objectStore('keyval');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
    request.onerror = () => reject(request.error);
  });
};

export const set = async (key: string, value: any) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keyval');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const req = store.put(value, key);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    };
    request.onerror = () => reject(request.error);
  });
};

export const del = async (key: string) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keyval');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const req = store.delete(key);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    };
    request.onerror = () => reject(request.error);
  });
};
