// DuckDB-WASM implementation using jsdelivr CDN bundles

import * as duckdb from '@duckdb/duckdb-wasm';

const DB_STORAGE_KEY = 'dog_seizure_app_db_v2';
let db = null;

const bufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

const base64ToBuffer = (base64) => {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
};

/**
 * Initializes the DuckDB-WASM database.
 * It loads data from localStorage if available.
 */
export const initDB = async () => {
    if (db) return db;

    console.log('1. Starting DuckDB-WASM initialization with CDN bundles...');
    
    try {
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
        
        const savedDbBase64 = localStorage.getItem(DB_STORAGE_KEY);
        
        if (savedDbBase64) {
            console.log('6. Loading existing database from localStorage...');
            try {
                const savedDbBuffer = base64ToBuffer(savedDbBase64);
                await db.registerFileBuffer('seizures.db', new Uint8Array(savedDbBuffer));
                const c = await db.connect();
                await c.query("ATTACH 'seizures.db'");
                await c.close();
                console.log('7. Existing database loaded.');
            } catch (loadError) {
                console.warn('Failed to load existing database (corrupted or incompatible format). Creating new one...', loadError);
                localStorage.removeItem(DB_STORAGE_KEY);
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
                console.log('7. New database created after clearing corrupted data.');
            }
        } else {
            console.log('6. No saved database found. Creating new one...');
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
            console.log('7. New database created.');
        }
        
        console.log('8. DuckDB-WASM initialization complete!');
        return db;
        
    } catch (error) {
        console.error('Failed to initialize DuckDB-WASM:', error);
        throw new Error(`Database initialization failed: ${error.message}`);
    }
};

/**
 * Saves the current state of the database to localStorage.
 */
export const saveDB = async () => {
    if (!db) throw new Error('Database not initialized!');
    
    try {
        const buffer = await db.copyFileToBuffer(':memory:');
        localStorage.setItem(DB_STORAGE_KEY, bufferToBase64(buffer));
        console.log('Database saved to localStorage.');
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