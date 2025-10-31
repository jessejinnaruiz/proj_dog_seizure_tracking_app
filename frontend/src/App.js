import React, { useState, useEffect, useMemo } from 'react';
import { initDB, getSeizures, addSeizure } from './database';
import BatchImport from './BatchImport';
import './App.css';

/**
 * Analyzes seizure data to find patterns.
 * @param {Array} seizures - The array of seizure objects.
 * @returns {Object|null} - An object with calculated insights, or null if not enough data.
 */
const analyzeSeizureData = (seizures) => {
    if (!seizures || seizures.length < 2) {
        return null;
    }

    const sortedSeizures = [...seizures].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    const formatTimeDiff = (ms) => {
        if (ms <= 0) return 'N/A';
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h`;
    };

    const triggerCounts = seizures.reduce((acc, seizure) => {
        const trigger = seizure.trigger?.trim().toLowerCase();
        if (trigger && trigger !== 'n/a' && trigger !== '') {
            acc[trigger] = (acc[trigger] || 0) + 1;
        }
        return acc;
    }, {});
    const commonTriggers = Object.entries(triggerCounts).sort(([, a], [, b]) => b - a).slice(0, 3).map(([trigger]) => trigger);

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

    const timeDiffs = [];
    for (let i = 1; i < sortedSeizures.length; i++) {
        const diff = new Date(sortedSeizures[i].dateTime) - new Date(sortedSeizures[i - 1].dateTime);
        timeDiffs.push(diff);
    }
    const avgTimeBetween = timeDiffs.length > 0 ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length : 0;
    const longestSeizureFreePeriod = timeDiffs.length > 0 ? Math.max(...timeDiffs) : 0;
    const lastSeizureDate = sortedSeizures[sortedSeizures.length - 1].dateTime;

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

function App() {
  const [seizures, setSeizures] = useState([]);
  const [view, setView] = useState('log');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateTime, setDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('');

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

  const insights = useMemo(() => analyzeSeizureData(seizures), [seizures]);
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
      setDateTime('');
      setDurationMinutes('');
      setDurationSeconds('');
      setDescription('');
      setTrigger('');
      await loadSeizuresFromDB();
      setView('history');

    } catch (err) {
      console.error(err);
      setError('Failed to save seizure to the local database.');
    }
  };
  const renderContent = () => {
    if (isLoading) {
      return <div className="loading" role="status" aria-live="polite"><span>Loading seizure history...</span></div>;
    }

    if (error) {
        return <div className="error-message" role="alert" aria-live="assertive">{error}</div>;
    }

    switch (view) {
      case 'log':
        return (
          <form onSubmit={handleSubmit} aria-labelledby="log-heading">
            <h2 id="log-heading">Log a New Seizure</h2>
            <div>
              <label htmlFor="seizure-datetime">Date and Time:</label>
              <input 
                id="seizure-datetime" 
                type="datetime-local" 
                value={dateTime} 
                onChange={e => setDateTime(e.target.value)} 
                required 
                aria-required="true"
              />
            </div>
            <div>
              <label id="duration-label">Duration:</label>
              <span className="duration-inputs" role="group" aria-labelledby="duration-label">
                <input 
                  id="duration-minutes" 
                  type="number" 
                  placeholder="Minutes" 
                  value={durationMinutes} 
                  onChange={e => setDurationMinutes(e.target.value)} 
                  min="0" 
                  aria-label="Duration in minutes"
                />
                <input 
                  id="duration-seconds" 
                  type="number" 
                  placeholder="Seconds" 
                  value={durationSeconds} 
                  onChange={e => setDurationSeconds(e.target.value)} 
                  min="0" 
                  max="59" 
                  aria-label="Duration in seconds"
                />
              </span>
            </div>
            <div>
                <label htmlFor="seizure-trigger">Possible Trigger:</label>
                <input 
                  id="seizure-trigger" 
                  type="text" 
                  value={trigger} 
                  onChange={e => setTrigger(e.target.value)} 
                  placeholder="e.g., Woke up suddenly" 
                  aria-describedby="trigger-hint"
                />
                <span id="trigger-hint" className="sr-only">Enter any potential trigger that may have caused the seizure</span>
            </div>
            <div>
              <label htmlFor="seizure-description">Description:</label>
              <textarea 
                id="seizure-description" 
                value={description} 
                onChange={e => setDescription(e.target.value)}
                aria-describedby="description-hint"
              ></textarea>
              <span id="description-hint" className="sr-only">Provide additional details about the seizure</span>
            </div>
            <button type="submit" aria-label="Save seizure entry">Save Seizure</button>
          </form>
        );
      case 'history':
        return (
          <section aria-labelledby="history-heading">
            <h2 id="history-heading">Seizure History</h2>
            {seizures.length === 0 ? (
              <p role="status">No seizures logged yet.</p>
            ) : (
              <ul aria-label="List of seizure entries">
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
          </section>
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
                                <p><strong>Average Time Between Seizures:</strong> {insights.averageTimeBetween}</p>
                                <p><strong>Longest Time Without Seizures:</strong> {insights.longestSeizureFreePeriod}</p>
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
      case 'batchImport':
        return <BatchImport onImportComplete={loadSeizuresFromDB} />;
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
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <header>
        <h1>Canine Seizure Tracker</h1>
      </header>
      <nav aria-label="Main navigation">
        <button 
          className={view === 'log' ? 'active' : ''} 
          onClick={() => setView('log')}
          aria-label="Log new seizure"
          aria-current={view === 'log' ? 'page' : undefined}
        >
          Log New Seizure
        </button>
        <button 
          className={view === 'batchImport' ? 'active' : ''} 
          onClick={() => setView('batchImport')}
          aria-label="Batch import seizure history"
          aria-current={view === 'batchImport' ? 'page' : undefined}
        >
          Batch Import
        </button>
        <button 
          className={view === 'history' ? 'active' : ''} 
          onClick={() => setView('history')}
          aria-label="View seizure history"
          aria-current={view === 'history' ? 'page' : undefined}
        >
          View History
        </button>
        <button 
          className={view === 'insights' ? 'active' : ''} 
          onClick={() => setView('insights')}
          aria-label="View data insights"
          aria-current={view === 'insights' ? 'page' : undefined}
        >
          Insights
        </button>
        <button 
          className={view === 'emergency' ? 'active' : ''} 
          onClick={() => setView('emergency')}
          aria-label="Emergency information"
          aria-current={view === 'emergency' ? 'page' : undefined}
        >
          Emergency Info
        </button>
      </nav>
      <main id="main-content" role="main" aria-live="polite">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;