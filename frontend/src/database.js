// Simple localStorage-based database implementation
// This avoids SQL.js webpack compatibility issues entirely

// This key is used to save the database file in the browser's localStorage.
const DB_STORAGE_KEY = 'dog_seizure_app_db';

// We use a simple array to store seizures in memory
let seizures = [];
let nextId = 1;

/**
 * Initializes the simple database.
 * It loads data from localStorage if available.
 */
export const initDB = async () => {
    console.log('1. Starting simple database initialization...');
    
    // Load existing data from localStorage
    const savedData = localStorage.getItem(DB_STORAGE_KEY);
    
    if (savedData) {
        console.log('2. Loading existing data from localStorage...');
        try {
            const parsed = JSON.parse(savedData);
            seizures = parsed.seizures || [];
            nextId = parsed.nextId || 1;
            console.log(`3. Loaded ${seizures.length} seizures.`);
        } catch (error) {
            console.log('3. Old data format detected. Clearing and starting fresh...');
            // Clear old DuckDB data and start fresh
            localStorage.removeItem(DB_STORAGE_KEY);
            seizures = [];
            nextId = 1;
        }
    } else {
        console.log('2. No existing data found. Starting with empty database.');
        seizures = [];
        nextId = 1;
    }
    
    console.log('3. Database ready!');
    return true;
};

/**
 * Saves the current state of the database to localStorage.
 */
export const saveDB = async () => {
    const data = {
        seizures,
        nextId
    };
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(data));
    console.log('Database saved to localStorage.');
};

/**
 * Fetches all seizures from the database.
 */
export const getSeizures = async () => {
    // Return seizures sorted by dateTime descending (newest first)
    return [...seizures].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
};

/**
 * Adds a new seizure record to the database and saves it.
 */
export const addSeizure = async (seizure) => {
    // Create new seizure record with auto-incrementing ID
    const newSeizure = {
        id: nextId++,
        dateTime: seizure.dateTime,
        duration_minutes: seizure.duration.minutes,
        duration_seconds: seizure.duration.seconds,
        description: seizure.description,
        trigger: seizure.trigger
    };
    
    // Add to in-memory array
    seizures.push(newSeizure);
    
    // Save to localStorage
    await saveDB();
};