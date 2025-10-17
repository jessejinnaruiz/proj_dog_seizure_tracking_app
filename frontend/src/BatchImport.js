import React, { useState } from 'react';
import { parseSeizureText } from './parser';
import { addSeizure } from './database';

const BatchImport = ({ onImportComplete }) => {
    const [inputText, setInputText] = useState('');
    const [parsedSeizures, setParsedSeizures] = useState([]);
    const [isPreview, setIsPreview] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResults, setImportResults] = useState(null);

    const handleParse = () => {
        const seizures = parseSeizureText(inputText);
        setParsedSeizures(seizures);
        setIsPreview(true);
        setImportResults(null);
    };

    const handleImport = async () => {
        setImporting(true);
        const results = { success: 0, failed: 0, errors: [] };

        for (const seizure of parsedSeizures) {
            try {
                await addSeizure(seizure);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push(`Failed to import: ${seizure.description.substring(0, 50)}... - ${error.message}`);
            }
        }

        setImportResults(results);
        setImporting(false);
        
        if (results.success > 0 && onImportComplete) {
            onImportComplete();
        }
    };

    const handleEdit = (index, field, value) => {
        const updated = [...parsedSeizures];
        if (field === 'minutes' || field === 'seconds') {
            updated[index].duration[field] = parseInt(value) || 0;
        } else {
            updated[index][field] = value;
        }
        setParsedSeizures(updated);
    };

    const handleRemove = (index) => {
        setParsedSeizures(parsedSeizures.filter((_, i) => i !== index));
    };

    const handleReset = () => {
        setInputText('');
        setParsedSeizures([]);
        setIsPreview(false);
        setImportResults(null);
    };

    return (
        <div className="batch-import-container">
            <h2>Batch Import Seizure History</h2>
            
            <div className="batch-import-instructions">
                <h3>How to Format Your Text:</h3>
                <p>Enter one seizure per line. The parser will extract:</p>
                <ul>
                    <li><strong>Date:</strong> "June 16, 2024" or "6/16/2024" or "16 June 2024"</li>
                    <li><strong>Time:</strong> "9pm" or "9:30 PM" or "21:30"</li>
                    <li><strong>Duration:</strong> "2 minutes" or "30 seconds" or "1:30"</li>
                    <li><strong>Trigger:</strong> Keywords like "woke up", "loud noise", "after eating", etc.</li>
                </ul>
                <p><strong>Example:</strong></p>
                <code>
                    June 16, 2024 9pm - 2 min seizure, woke up suddenly<br/>
                    6/18/24 morning - 30 seconds, after eating<br/>
                    June 20 around 3:30pm - 1 minute 45 seconds, loud noise, fireworks
                </code>
            </div>

            {!isPreview ? (
                <div className="batch-input-section">
                    <textarea
                        className="batch-textarea"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Paste your seizure history here, one entry per line..."
                        rows={15}
                    />
                    <button 
                        className="btn btn-primary" 
                        onClick={handleParse}
                        disabled={!inputText.trim()}
                    >
                        Parse Text →
                    </button>
                </div>
            ) : (
                <div className="batch-preview-section">
                    <h3>Preview & Edit ({parsedSeizures.length} seizures found)</h3>
                    
                    {parsedSeizures.length === 0 ? (
                        <div className="no-results">
                            <p>No seizures could be parsed from the text.</p>
                            <p>Make sure each line includes a date. See examples above.</p>
                            <button className="btn btn-secondary" onClick={handleReset}>
                                ← Try Again
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="preview-table-wrapper">
                                <table className="preview-table">
                                    <thead>
                                        <tr>
                                            <th>Date & Time</th>
                                            <th>Duration</th>
                                            <th>Trigger</th>
                                            <th>Description</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedSeizures.map((seizure, index) => (
                                            <tr key={index}>
                                                <td>
                                                    <input
                                                        type="datetime-local"
                                                        value={seizure.dateTime}
                                                        onChange={(e) => handleEdit(index, 'dateTime', e.target.value)}
                                                        className="edit-input"
                                                    />
                                                </td>
                                                <td>
                                                    <div className="duration-inputs">
                                                        <input
                                                            type="number"
                                                            value={seizure.duration.minutes}
                                                            onChange={(e) => handleEdit(index, 'minutes', e.target.value)}
                                                            className="edit-input-small"
                                                            min="0"
                                                        />m
                                                        <input
                                                            type="number"
                                                            value={seizure.duration.seconds}
                                                            onChange={(e) => handleEdit(index, 'seconds', e.target.value)}
                                                            className="edit-input-small"
                                                            min="0"
                                                            max="59"
                                                        />s
                                                    </div>
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={seizure.trigger}
                                                        onChange={(e) => handleEdit(index, 'trigger', e.target.value)}
                                                        className="edit-input"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={seizure.description}
                                                        onChange={(e) => handleEdit(index, 'description', e.target.value)}
                                                        className="edit-input"
                                                    />
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn-remove"
                                                        onClick={() => handleRemove(index)}
                                                        title="Remove this entry"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="batch-actions">
                                <button className="btn btn-secondary" onClick={handleReset}>
                                    ← Start Over
                                </button>
                                <button 
                                    className="btn btn-primary" 
                                    onClick={handleImport}
                                    disabled={importing || parsedSeizures.length === 0}
                                >
                                    {importing ? 'Importing...' : `Import ${parsedSeizures.length} Seizures`}
                                </button>
                            </div>

                            {importResults && (
                                <div className={`import-results ${importResults.failed > 0 ? 'has-errors' : 'success'}`}>
                                    <h4>Import Complete!</h4>
                                    <p>✓ Successfully imported: {importResults.success}</p>
                                    {importResults.failed > 0 && (
                                        <>
                                            <p>✗ Failed: {importResults.failed}</p>
                                            <ul className="error-list">
                                                {importResults.errors.map((error, i) => (
                                                    <li key={i}>{error}</li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                    <button className="btn btn-primary" onClick={handleReset}>
                                        Import More
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default BatchImport;