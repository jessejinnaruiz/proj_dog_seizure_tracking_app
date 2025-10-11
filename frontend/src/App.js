import React, { useState, useEffect, useMemo } from 'react';

// --- Helper Function for Data Analysis ---
/**
 * Analyzes seizure data to find patterns.
 * @param {Array} seizures - The array of seizure objects.
 * @returns {Object|null} - An object with calculated insights, or null if not enough data.
 */
const analyzeSeizureData = (seizures) => {
    // Only generate insights if there are at least 3 records
    if (!seizures || seizures.length < 3) {
        return null;
    }

    // 1. Calculate the most common triggers
    const triggerCounts = seizures.reduce((acc, seizure) => {
        const trigger = seizure.trigger?.trim().toLowerCase();
        if (trigger && trigger !== 'n/a' && trigger !== '') {
            acc[trigger] = (acc[trigger] || 0) + 1;
        }
        return acc;
    }, {});
    const commonTriggers = Object.entries(triggerCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([trigger]) => trigger);

    // 2. Calculate average duration
    let totalSeconds = 0;
    let countWithDuration = 0;
    seizures.forEach(s => {
        const mins = s.duration_minutes || 0;
        const secs = s.duration_seconds || 0;
        if (mins > 0 || secs > 0) {
            totalSeconds += (mins * 60) + secs;
            countWithDuration++;
        }
    });
    const avgSeconds = countWithDuration > 0 ? Math.round(totalSeconds / countWithDuration) : 0;
    const averageDuration = {
        minutes: Math.floor(avgSeconds / 60),
        seconds: avgSeconds % 60,
    };

    return {
        totalCount: seizures.length,
        commonTriggers,
        averageDuration,
    };
};


// --- Main App Component ---
function App() {
  // --- State Variables ---
  const [seizures, setSeizures] = useState([]);
  const [view, setView] = useState('log'); // 'log', 'history', 'insights', 'emergency'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [dateTime, setDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('');


  // --- Data Fetching ---
  const fetchSeizures = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/seizures');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setSeizures(data);
      setError(null);
    } catch (err) {
      console.error("Fetch error:", err);
      setError('Failed to load seizure history. Please check if the backend server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSeizures();
  }, []);

  // --- Derived State for Insights ---
  // useMemo ensures this analysis only re-runs when the seizure data changes
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
      const response = await fetch('/api/seizures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSeizure),
      });

      if (!response.ok) {
        throw new Error('Failed to save seizure.');
      }

      // Reset form and refresh data
      setDateTime('');
      setDurationMinutes('');
      setDurationSeconds('');
      setDescription('');
      setTrigger('');
      await fetchSeizures();
      setView('history'); // Switch to history view after logging

    } catch (err) {
      setError(err.message);
    }
  };

  // --- Rendering ---
  const renderContent = () => {
    if (isLoading) {
      return <p>Loading seizure history...</p>;
    }

    if (error) {
        return <p style={{ color: 'red' }}>{error}</p>;
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
              <span>
                <input type="number" placeholder="Minutes" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min="0" style={{width: '100px', marginRight: '10px'}}/>
                <input type="number" placeholder="Seconds" value={durationSeconds} onChange={e => setDurationSeconds(e.target.value)} min="0" max="59" style={{width: '100px'}} />
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
                    <p>Log at least 3 seizures to see automated insights and patterns.</p>
                ) : (
                    <div style={{textAlign: 'left', maxWidth: '600px', margin: 'auto'}}>
                        <h3>Summary</h3>
                        <p><strong>Total Seizures Logged:</strong> {insights.totalCount}</p>
                        <p><strong>Average Duration:</strong> {insights.averageDuration.minutes}m {insights.averageDuration.seconds}s</p>
                        
                        <h3 style={{marginTop: '2em'}}>Common Triggers</h3>
                        {insights.commonTriggers.length > 0 ? (
                            <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
                                {insights.commonTriggers.map((trigger, index) => (
                                    <li key={index} style={{textTransform: 'capitalize'}}>{trigger}</li>
                                ))}
                            </ul>
                        ) : (
                            <p>Not enough trigger data to identify common patterns yet.</p>
                        )}
                    </div>
                )}
            </div>
        );
      case 'emergency':
        return (
            <div>
                <h2>Emergency Information & Disclaimer</h2>
                <p style={{textAlign: 'left', maxWidth: '600px', margin: 'auto', lineHeight: '1.6'}}><strong>Disclaimer:</strong> This app is a tracking tool, not a medical device. The information provided here is for informational purposes only and is not a substitute for professional veterinary advice. Always consult your veterinarian for diagnosis and treatment.</p>
                <h3 style={{marginTop: '2em'}}>When to Seek Emergency Care</h3>
                <p>According to veterinary experts, you should consider a seizure an emergency if:</p>
                <ul style={{textAlign: 'left', display: 'inline-block'}}>
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
    <div className="App" style={{textAlign: 'center'}}>
      <h1>Canine Seizure Tracker</h1>
      <nav>
        <button onClick={() => setView('log')}>Log New Seizure</button>
        <button onClick={() => setView('history')}>View History</button>
        <button onClick={() => setView('insights')}>Insights</button>
        <button onClick={() => setView('emergency')}>Emergency Info</button>
      </nav>
      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;

