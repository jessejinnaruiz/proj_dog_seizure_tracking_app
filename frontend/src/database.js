// Pure IndexedDB implementation for maximum PWA reliability (especially iOS)

import { openDB } from 'idb';

const IDB_NAME = 'DogSeizureTrackerDB';
const IDB_STORE = 'seizures';
const IDB_VERSION = 2; // Incremented to trigger fresh schema

let idbInstance = null;
let nextId = 1;

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
 * Initialize IndexedDB for storing seizure records
 */
const getDB = async () => {
    if (idbInstance) return idbInstance;
    
    idbInstance = await openDB(IDB_NAME, IDB_VERSION, {
        upgrade(db) {
            // Delete old stores if they exist
            if (db.objectStoreNames.contains('duckdb_storage')) {
                db.deleteObjectStore('duckdb_storage');
            }
            
            // Create new seizures store with auto-incrementing keys
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                const store = db.createObjectStore(IDB_STORE, { 
                    keyPath: 'id',
                    autoIncrement: true 
                });
                
                // Create index for sorting by dateTime
                store.createIndex('dateTime', 'dateTime');
            }
        },
    });
    
    return idbInstance;
};

/**
 * Initializes the database
 * Simplified - just opens IndexedDB and requests persistent storage
 */
export const initDB = async () => {
    console.log('Initializing IndexedDB for seizure tracking...');
    
    try {
        // Request persistent storage for better iOS reliability
        await requestPersistentStorage();
        
        // Initialize IndexedDB
        const db = await getDB();
        
        // Get the highest ID to continue incrementing
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const allKeys = await store.getAllKeys();
        
        if (allKeys.length > 0) {
            nextId = Math.max(...allKeys) + 1;
            console.log(`IndexedDB loaded. Found ${allKeys.length} seizure records.`);
        } else {
            console.log('IndexedDB initialized. No existing records.');
        }
        
        console.log('Database ready!');
        return db;
    } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
        throw new Error(`Database initialization failed: ${error.message}`);
    }
};

/**
 * Fetches all seizures from IndexedDB
 * @returns {Promise<Array>} - Array of seizure objects sorted by dateTime DESC
 */
export const getSeizures = async () => {
    try {
        const db = await getDB();
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const seizures = await store.getAll();
        
        // Sort by dateTime descending (newest first)
        seizures.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
        
        return seizures;
    } catch (error) {
        console.error('Failed to fetch seizures:', error);
        throw error;
    }
};

/**
 * Adds a new seizure record to IndexedDB
 * @param {Object} seizure - Seizure data with dateTime, duration, description, trigger
 */
export const addSeizure = async (seizure) => {
    try {
        const db = await getDB();
        
        // Create seizure object
        const seizureRecord = {
            id: nextId++,
            dateTime: seizure.dateTime, // ISO format: 2025-11-07T20:43
            duration_minutes: seizure.duration.minutes || 0,
            duration_seconds: seizure.duration.seconds || 0,
            description: seizure.description || '',
            trigger: seizure.trigger || ''
        };
        
        // Save to IndexedDB
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        await store.put(seizureRecord);
        await tx.done;
        
        console.log('Seizure saved to IndexedDB:', seizureRecord);
    } catch (error) {
        console.error('Failed to add seizure:', error);
        throw error;
    }
};

/**
 * Placeholder for compatibility - IndexedDB auto-saves on every write
 */
export const saveDB = async () => {
    // IndexedDB automatically persists data on every write
    // This function exists for API compatibility but does nothing
    return Promise.resolve();
};

/**
 * Updates an existing seizure record in IndexedDB
 * @param {Number} id - The ID of the seizure to update
 * @param {Object} updatedData - Updated seizure data
 */
export const updateSeizure = async (id, updatedData) => {
    try {
        const db = await getDB();
        
        // Get existing seizure
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const existingSeizure = await store.get(id);
        
        if (!existingSeizure) {
            throw new Error(`Seizure with id ${id} not found`);
        }
        
        // Update with new data
        const updatedSeizure = {
            ...existingSeizure,
            dateTime: updatedData.dateTime,
            duration_minutes: updatedData.duration.minutes || 0,
            duration_seconds: updatedData.duration.seconds || 0,
            description: updatedData.description || '',
            trigger: updatedData.trigger || ''
        };
        
        // Save updated record
        await store.put(updatedSeizure);
        await tx.done;
        
        console.log('Seizure updated in IndexedDB:', updatedSeizure);
    } catch (error) {
        console.error('Failed to update seizure:', error);
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