// DuckDB-WASM implementation with IndexedDB for persistent storage

import * as duckdb from '@duckdb/duckdb-wasm';
import { openDB } from 'idb';

const DB_STORAGE_KEY = 'dog_seizure_app_db_v2';
const IDB_NAME = 'DogSeizureTrackerDB';
const IDB_STORE = 'duckdb_storage';
const IDB_VERSION = 1;

let db = null;
let idbInstance = null;

/**
 * Initialize IndexedDB for storing DuckDB database file
 */
const initIndexedDB = async () => {
    if (idbInstance) return idbInstance;
    
    idbInstance = await openDB(IDB_NAME, IDB_VERSION, {
        upgrade(db) {
            // Create object store if it doesn't exist
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        },
    });
    
    return idbInstance;
};

/**
 * Save data to IndexedDB
 */
const saveToIndexedDB = async (key, value) => {
    const idb = await initIndexedDB();
    await idb.put(IDB_STORE, value, key);
};

/**
 * Load data from IndexedDB
 */
const loadFromIndexedDB = async (key) => {
    const idb = await initIndexedDB();
    return await idb.get(IDB_STORE, key);
};

/**
 * Request persistent storage permission (helps prevent iOS from clearing data)
 */
const requestPersistentStorage = async () => {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`Persistent storage granted: ${isPersisted}`);
        return isPersisted;
    }
    return false;
};

/**
 * Initializes the DuckDB-WASM database.
 * It loads data from IndexedDB if available (better iOS PWA persistence than localStorage).
 */
export const initDB = async () => {
    if (db) return db;

    console.log('1. Starting DuckDB-WASM initialization with CDN bundles...');
    
    try {
        // Request persistent storage for better iOS reliability
        await requestPersistentStorage();
        
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        
        console.log('2. Selected bundle:', bundle);
        
        const worker = await duckdb.createWorker(bundle.mainWorker);
        console.log('3. Worker created successfully.');
        
        const logger = new duckdb.ConsoleLogger();
        db = new duckdb.AsyncDuckDB(logger, worker);
        console.log('4. AsyncDuckDB instance created.');
        
        await db.instantiate(bundle.mainModule);
        console.log('5. Database instantiated successfully.');
        
        // Try to load from IndexedDB first (new method)
        let savedDbBuffer = await loadFromIndexedDB(DB_STORAGE_KEY);
        
        // Fallback: migrate from old localStorage if IndexedDB is empty
        if (!savedDbBuffer) {
            console.log('6. Checking for legacy localStorage data...');
            const savedDbBase64 = localStorage.getItem(DB_STORAGE_KEY);
            if (savedDbBase64) {
                console.log('6a. Migrating data from localStorage to IndexedDB...');
                try {
                    // Convert base64 string to buffer
                    const binary_string = window.atob(savedDbBase64);
                    const len = binary_string.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binary_string.charCodeAt(i);
                    }
                    savedDbBuffer = bytes.buffer;
                    
                    // Save to IndexedDB
                    await saveToIndexedDB(DB_STORAGE_KEY, savedDbBuffer);
                    
                    // Remove from localStorage (migration complete)
                    localStorage.removeItem(DB_STORAGE_KEY);
                    console.log('6b. Migration complete. Data now in IndexedDB.');
                } catch (migrationError) {
                    console.warn('Failed to migrate localStorage data:', migrationError);
                    savedDbBuffer = null;
                }
            }
        }
        
        if (savedDbBuffer) {
            console.log('7. Loading existing database from IndexedDB...');
            try {
                await db.registerFileBuffer('seizures.db', new Uint8Array(savedDbBuffer));
                const c = await db.connect();
                await c.query("ATTACH 'seizures.db'");
                await c.close();
                console.log('8. Existing database loaded.');
            } catch (loadError) {
                console.warn('Failed to load existing database (corrupted or incompatible format). Creating new one...', loadError);
                // Clear corrupted data from IndexedDB
                await saveToIndexedDB(DB_STORAGE_KEY, null);
                const c = await db.connect();
                await c.query(`
                    CREATE TABLE IF NOT EXISTS seizures (
                        id INTEGER PRIMARY KEY,
                        dateTime TIMESTAMP,
                        duration_minutes INTEGER,
                        duration_seconds INTEGER,
                        description VARCHAR,
                        trigger VARCHAR
                    );
                `);
                await c.close();
                console.log('8. New database created after clearing corrupted data.');
            }
        } else {
            console.log('7. No saved database found. Creating new one...');
            const c = await db.connect();
            await c.query(`
                CREATE TABLE IF NOT EXISTS seizures (
                    id INTEGER PRIMARY KEY,
                    dateTime TIMESTAMP,
                    duration_minutes INTEGER,
                    duration_seconds INTEGER,
                    description VARCHAR,
                    trigger VARCHAR
                );
            `);
            await c.close();
            console.log('8. New database created.');
        }
        
        console.log('9. DuckDB-WASM initialization complete!');
        return db;
        
    } catch (error) {
        console.error('Failed to initialize DuckDB-WASM:', error);
        throw new Error(`Database initialization failed: ${error.message}`);
    }
};

/**
 * Saves the current state of the database to IndexedDB.
 * IndexedDB provides better persistence on iOS PWAs compared to localStorage.
 */
export const saveDB = async () => {
    if (!db) throw new Error('Database not initialized!');
    
    try {
        const buffer = await db.copyFileToBuffer(':memory:');
        await saveToIndexedDB(DB_STORAGE_KEY, buffer);
        console.log('Database saved to IndexedDB.');
    } catch (error) {
        console.error('Failed to save database:', error);
        throw error;
    }
};

/**
 * Fetches all seizures from the database.
 */
export const getSeizures = async () => {
    if (!db) throw new Error('Database not initialized!');
    
    try {
        const c = await db.connect();
        const result = await c.query('SELECT * FROM seizures ORDER BY dateTime DESC;');
        await c.close();
        
        return result.toArray().map(row => ({
            id: row.id,
            dateTime: row.dateTime,
            duration_minutes: row.duration_minutes,
            duration_seconds: row.duration_seconds,
            description: row.description,
            trigger: row.trigger
        }));
    } catch (error) {
        console.error('Failed to fetch seizures:', error);
        throw error;
    }
};

let nextId = 1;

/**
 * Adds a new seizure record to the database and saves it.
 */
export const addSeizure = async (seizure) => {
    if (!db) throw new Error('Database not initialized!');
    
    try {
        const c = await db.connect();
        
        // Convert datetime-local format (2022-06-16T20:57) to DuckDB format (2022-06-16 20:57:00)
        const formattedDateTime = seizure.dateTime.replace('T', ' ') + ':00';
        
        const stmt = await c.prepare(
            'INSERT INTO seizures (id, dateTime, duration_minutes, duration_seconds, description, trigger) VALUES (?, ?, ?, ?, ?, ?)'
        );
        
        await stmt.query(
            nextId++,
            formattedDateTime,
            seizure.duration.minutes,
            seizure.duration.seconds,
            seizure.description,
            seizure.trigger
        );
        
        await stmt.close();
        await c.close();
        await saveDB();
        console.log('Seizure added successfully.');
    } catch (error) {
        console.error('Failed to add seizure:', error);
        throw error;
    }
};

/**
 * Exports all seizure data as CSV
 * @returns {Promise<string>} - CSV string of all seizures
 */
export const exportDataAsCSV = async () => {
    const seizures = await getSeizures();
    
    // CSV header
    const header = "Date,Time,Duration (min),Duration (sec),Trigger,Description\n";
    
    // CSV rows
    const rows = seizures.map(s => {
        const date = new Date(s.dateTime);
        const dateStr = date.toLocaleDateString('en-US'); // e.g., "10/5/2024"
        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        }); // e.g., "8:06 PM"
        
        // Escape commas and quotes in text fields
        const escapeCsv = (str) => {
            if (!str) return '';
            const cleaned = str.replace(/"/g, '""'); // Escape quotes
            return cleaned.includes(',') ? `"${cleaned}"` : cleaned;
        };
        
        const trigger = escapeCsv(s.trigger || '');
        const desc = escapeCsv(s.description || '');
        
        return `${dateStr},${timeStr},${s.duration_minutes},${s.duration_seconds},${trigger},${desc}`;
    }).join('\n');
    
    return header + rows;
};