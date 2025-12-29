// Simple in-memory cache with IndexedDB fallback for persistence
class DataCache {
  constructor() {
    this.memoryCache = new Map();
    this.dbName = 'MovieSiteCache';
    this.dbVersion = 1;
    this.db = null;
  }

  async initDB() {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'key' });
        }
      };
    });
  }

  async get(key) {
    const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    // Check memory cache first
    if (this.memoryCache.has(key)) {
      const cached = this.memoryCache.get(key);
      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRATION_MS) {
        console.log(`Cache hit (memory) for ${key}`);
        return cached.value;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // Check IndexedDB
    try {
      await this.initDB();
      const transaction = this.db.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      const request = store.get(key);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result && result.timestamp) {
            const age = Date.now() - result.timestamp;
            if (age < CACHE_EXPIRATION_MS) {
              // Store in memory cache for faster access
              this.memoryCache.set(key, { value: result.value, timestamp: result.timestamp });
              console.log(`Cache hit (IndexedDB) for ${key}`);
              resolve(result.value);
            } else {
              console.log(`Cache expired for ${key} (age: ${Math.round(age / 1000 / 60)} minutes)`);
              // Delete expired cache
              const deleteTransaction = this.db.transaction(['data'], 'readwrite');
              deleteTransaction.objectStore('data').delete(key);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null); // Fallback gracefully
      });
    } catch (error) {
      console.warn('Cache get error:', error);
      return null;
    }
  }

  async set(key, value) {
    const timestamp = Date.now();
    // Store in memory cache
    this.memoryCache.set(key, { value, timestamp });

    // Store in IndexedDB for persistence
    try {
      await this.initDB();
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      await store.put({ key, value, timestamp });
      console.log(`Cache set for ${key}`);
    } catch (error) {
      console.warn('Cache set error:', error);
    }
  }

  clear() {
    this.memoryCache.clear();
    if (this.db) {
      const transaction = this.db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');
      store.clear();
    }
  }
}

export const cache = new DataCache();

