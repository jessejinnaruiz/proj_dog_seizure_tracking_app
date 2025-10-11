import React, { useState, useEffect, useMemo } from 'react';
import { initDB, getSeizures, addSeizure } from './database';

// --- Helper Function for Data Analysis ---
/**
 * Analyzes seizure data to find patterns.
 * @param {Array} seizures - The array of seizure objects.
 * @returns {Object|null} - An object with calculated insights, or null if not enough data.
 */
const analyzeSeizureData = (seizures) => {
    if (!seizures || seizures.length < 2) {
        return null; // Need at least 2 seizures for frequency analysis
    }

    // --- Data Preparation ---
    const sortedSeizures = [...seizures].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    // Helper to format milliseconds into a readable string
    const formatTimeDiff = (ms) => {
        if (ms <= 0) return 'N/A';
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h`;
    };

    // --- 1. Basic Insights ---
    const triggerCounts = seizures.reduce((acc, seizure) => {
        const trigger = seizure.trigger?.trim().toLowerCase();
        if (trigger && trigger !== 'n/a' && trigger !== '') {
            acc[trigger] = (acc[trigger] || 0) + 1;
        }
        return acc;
    }, {});
    const commonTriggers = Object.entries(triggerCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([trigger]) => trigger);

    // --- 2. Duration Analysis ---
    let totalSeconds = 0, countWithDuration = 0, minDuration = Infinity, maxDuration = 0;
    sortedSeizures.forEach(s => {
        const durationInSeconds = (s.duration_minutes || 0) * 60 + (s.duration_seconds || 0);
        if (durationInSeconds > 0) {
            totalSeconds += durationInSeconds;
            countWithDuration++;
            if (durationInSeconds < minDuration) minDuration = durationInSeconds;
            if (durationInSeconds > maxDuration) maxDuration = durationInSeconds;
        }
    });
    const avgSeconds = countWithDuration > 0 ? Math.round(totalSeconds / countWithDuration) : 0;
    const averageDuration = { minutes: Math.floor(avgSeconds / 60), seconds: avgSeconds % 60 };
    const shortestDuration = minDuration === Infinity ? null : { minutes: Math.floor(minDuration / 60), seconds: minDuration % 60 };
    const longestDuration = maxDuration === 0 ? null : { minutes: Math.floor(maxDuration / 60), seconds: maxDuration % 60 };

    // --- 3. Frequency Analysis ---
    const timeDiffs = [];
    for (let i = 1; i < sortedSeizures.length; i++) {
        const diff = new Date(sortedSeizures[i].dateTime) - new Date(sortedSeizures[i - 1].dateTime);
        timeDiffs.push(diff);
    }
    const avgTimeBetween = timeDiffs.length > 0 ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length : 0;
    const longestSeizureFreePeriod = timeDiffs.length > 0 ? Math.max(...timeDiffs) : 0;
    const lastSeizureDate = sortedSeizures[sortedSeizures.length - 1].dateTime;

    // --- 4. Time-of-Day & Cluster Analysis ---
    const timeOfDayCounts = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    let hasClusterSeizures = false;
    sortedSeizures.forEach((s, index) => {
        const hour = new Date(s.dateTime).getHours();
        if (hour >= 5 && hour < 12) timeOfDayCounts.Morning++;
        else if (hour >= 12 && hour < 17) timeOfDayCounts.Afternoon++;
        else if (hour >= 17 && hour < 21) timeOfDayCounts.Evening++;
        else timeOfDayCounts.Night++;

        if (index > 0) {
            const diff = new Date(s.dateTime) - new Date(sortedSeizures[index - 1].dateTime);
            if (diff < 24 * 60 * 60 * 1000) {
                hasClusterSeizures = true;
            }
        }
    });
    const mostCommonTime = Object.keys(timeOfDayCounts).reduce((a, b) => timeOfDayCounts[a] > timeOfDayCounts[b] ? a : b);

    return {
        totalCount: sortedSeizures.length,
        commonTriggers,
        averageDuration,
        shortestDuration,
        longestDuration,
        lastSeizureDate,
        averageTimeBetween: formatTimeDiff(avgTimeBetween),
        longestSeizureFreePeriod: formatTimeDiff(longestSeizureFreePeriod),
        mostCommonTime,
        hasClusterSeizures,
    };
};


// --- Main App Component ---
function App() {
  // --- State Variables ---
  const [seizures, setSeizures] = useState([]);
  const [view, setView] = useState('log'); // 'log', 'history', 'insights', 'emergency'
  const [isLoading, setIsLoading] = useState(true); // Now represents DB loading
  const [error, setError] = useState(null);

  // Form state
  const [dateTime, setDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('');


  // --- Data Fetching ---
  // This function now loads seizures directly from the in-browser database.
  const loadSeizuresFromDB = async () => {
    try {
      setIsLoading(true);
      const data = await getSeizures();
      setSeizures(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load seizure history from the local database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initialize the database and then load the data.
    const initialize = async () => {
      try {
        await initDB();
        await loadSeizuresFromDB();
      } catch (err) {
        console.error(err);
        setError('Failed to initialize the local database.');
        setIsLoading(false);
      }
    };
    initialize();
  }, []);

  // --- Derived State for Insights ---
  const insights = useMemo(() => analyzeSeizureData(seizures), [seizures]);

  // --- Event Handlers ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    const newSeizure = {
      dateTime,
      duration: {
        minutes: parseInt(durationMinutes, 10) || 0,
        seconds: parseInt(durationSeconds, 10) || 0
      },
      description,
      trigger
    };

    try {
      await addSeizure(newSeizure);
      
      // Reset form and refresh data
      setDateTime('');
      setDurationMinutes('');
      setDurationSeconds('');
      setDescription('');
      setTrigger('');
      await loadSeizuresFromDB(); // Reload data from the local DB
      setView('history'); // Switch to history view after logging

    } catch (err) {
      console.error(err);
      setError('Failed to save seizure to the local database.');
    }
  };

  // --- Rendering ---
  const renderContent = () => {
    if (isLoading) {
      return <p>Loading seizure history...</p>;
    }

    if (error) {
        return <p className="error-message">{error}</p>;
    }

    switch (view) {
      case 'log':
        return (
          <form onSubmit={handleSubmit}>
            <h2>Log a New Seizure</h2>
            <div>
              <label>Date and Time:</label>
              <input type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} required />
            </div>
            <div>
              <label>Duration:</label>
              <span className="duration-inputs">
                <input type="number" placeholder="Minutes" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min="0" />
                <input type="number" placeholder="Seconds" value={durationSeconds} onChange={e => setDurationSeconds(e.target.value)} min="0" max="59" />
              </span>
            </div>
            <div>
                <label>Possible Trigger:</label>
                <input type="text" value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="e.g., Woke up suddenly" />
            </div>
            <div>
              <label>Description:</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}></textarea>
            </div>
            <button type="submit">Save Seizure</button>
          </form>
        );
      case 'history':
        return (
          <div>
            <h2>Seizure History</h2>
            {seizures.length === 0 ? <p>No seizures logged yet.</p> : (
              <ul>
                {seizures.map(s => (
                  <li key={s.id}>
                    <strong>{new Date(s.dateTime).toLocaleString()}</strong>
                    <p><strong>Duration:</strong> {s.duration_minutes}m {s.duration_seconds}s</p>
                    <p><strong>Trigger:</strong> {s.trigger || 'N/A'}</p>
                    <p><strong>Description:</strong> {s.description || 'N/A'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      case 'insights':
        return (
            <div>
                <h2>Data Insights</h2>
                {!insights ? (
                    <p>Log at least 2 seizures to see automated insights and patterns.</p>
                ) : (
                    <div className="insights-container">
                        {insights.hasClusterSeizures && (
                            <div className="warning-card">
                                <strong>Warning:</strong> Multiple seizures have been detected within a 24-hour period (cluster seizures). Please consult your veterinarian.
                            </div>
                        )}

                        <div className="insights-grid">
                            <div className="content-card">
                                <h3 className="subheader">Frequency</h3>
                                <p><strong>Last Seizure:</strong> {new Date(insights.lastSeizureDate).toLocaleDateString()}</p>
                                <p><strong>Avg. Time Between:</strong> {insights.averageTimeBetween}</p>
                                <p><strong>Longest Seizure-Free:</strong> {insights.longestSeizureFreePeriod}</p>
                            </div>

                            <div className="content-card">
                                <h3 className="subheader">Duration</h3>
                                <p><strong>Average:</strong> {insights.averageDuration.minutes}m {insights.averageDuration.seconds}s</p>
                                {insights.shortestDuration && <p><strong>Shortest:</strong> {insights.shortestDuration.minutes}m {insights.shortestDuration.seconds}s</p>}
                                {insights.longestDuration && <p><strong>Longest:</strong> {insights.longestDuration.minutes}m {insights.longestDuration.seconds}s</p>}
                            </div>

                            <div className="content-card">
                                <h3 className="subheader">Patterns</h3>
                                <p><strong>Total Logged:</strong> {insights.totalCount}</p>
                                <p><strong>Most Common Time:</strong> {insights.mostCommonTime}</p>
                                <p><strong>Common Triggers:</strong></p>
                                {insights.commonTriggers.length > 0 ? (
                                    <ul className="insights-list">
                                        {insights.commonTriggers.map((trigger, index) => (
                                            <li key={index}>{trigger}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p style={{marginLeft: '1em', fontStyle: 'italic'}}>No common triggers identified yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
      case 'emergency':
        return (
            <div>
                <h2>Emergency Information & Disclaimer</h2>
                <p className="disclaimer"><strong>Disclaimer:</strong> This app is a tracking tool, not medical advice. The information provided here is for informational purposes only and is not a substitute for professional veterinary advice. Always consult your veterinarian for diagnosis and treatment.</p>
                <h3 className="subheader">When to Seek Emergency Care</h3>
                <p>According to veterinary experts, you should consider a seizure an emergency if:</p>
                <ul className="info-list">
                    <li>It is your dog's first seizure.</li>
                    <li>The seizure lasts longer than 5 minutes.</li>
                    <li>Your dog has multiple seizures in a row (cluster seizures).</li>
                    <li>Your dog does not seem to recover fully within an hour of the seizure.</li>
                </ul>
            </div>
        );
      default:
        return null;
    }
  };


  return (
    <div className="App">
      <h1>Canine Seizure Tracker</h1>
      <nav>
        <button className={view === 'log' ? 'active' : ''} onClick={() => setView('log')}>Log New Seizure</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>View History</button>
        <button className={view === 'insights' ? 'active' : ''} onClick={() => setView('insights')}>Insights</button>
        <button className={view === 'emergency' ? 'active' : ''} onClick={() => setView('emergency')}>Emergency Info</button>
      </nav>
      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;