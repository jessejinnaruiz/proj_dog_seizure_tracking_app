// --- Imports ---
const express = require('express');
const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs'); // <-- 1. IMPORT THE FILE SYSTEM MODULE

// --- Initialization ---
const app = express();
const PORT = 3001; // Port for our backend server

// --- Database Setup ---
const dataDir = path.resolve(__dirname, 'data');
const dbFile = path.resolve(dataDir, 'tracker.duckdb');

// --- ADD THIS BLOCK ---
// 2. CHECK FOR AND CREATE THE 'data' DIRECTORY IF IT DOESN'T EXIST
if (!fs.existsSync(dataDir)) {
    console.log(`Creating database directory at: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
}
// --------------------

const db = new duckdb.Database(dbFile, (err) => {
    if (err) {
        console.error("Failed to open database:", err);
    }
});

// --- Middleware ---
// This allows our server to understand JSON data sent from the React app
app.use(express.json());

// --- Database Table Initialization ---
// This function runs once when the server starts to ensure the table exists.
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS seizures (
                id UUID PRIMARY KEY,
                dateTime TIMESTAMP NOT NULL,
                duration_minutes INTEGER,
                duration_seconds INTEGER,
                trigger VARCHAR,
                description TEXT
            );
        `;
        db.run(createTableQuery, (err) => {
            if (err) {
                console.error("Error creating table:", err);
                return reject(err);
            }
            console.log("Database initialized. 'seizures' table is ready.");
            resolve();
        });
    });
}


// --- API Endpoints ---

// GET /api/seizures - Fetch all seizure records
app.get('/api/seizures', (req, res) => {
    db.all('SELECT * FROM seizures ORDER BY dateTime DESC', (err, rows) => {
        if (err) {
            console.error("Error querying seizures:", err);
            return res.status(500).json({ error: 'Failed to retrieve data.' });
        }
        res.json(rows);
    });
});

// POST /api/seizures - Save a new seizure record
app.post('/api/seizures', (req, res) => {
    const { dateTime, duration, description, trigger } = req.body;

    if (!dateTime) {
        return res.status(400).json({ error: 'Date and time are required.' });
    }

    const insertQuery = `
        INSERT INTO seizures (id, dateTime, duration_minutes, duration_seconds, trigger, description)
        VALUES (UUID(), ?, ?, ?, ?, ?);
    `;

    const params = [
        dateTime,
        duration.minutes || 0,
        duration.seconds || 0,
        trigger || 'Unknown',
        description || ''
    ];

    db.run(insertQuery, ...params, (err) => {
        if (err) {
            console.error("Error inserting seizure:", err);
            return res.status(500).json({ error: 'Failed to save seizure.' });
        }
        res.status(201).json({ message: 'Seizure logged successfully.' });
    });
});


// --- Server Start ---
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Backend server is running on http://localhost:${PORT}`);
    });
}).catch(error => {
    console.error("Failed to start server due to database initialization error.", error);
    process.exit(1);
});

