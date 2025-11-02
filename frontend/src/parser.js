export const parseSeizureText = (text) => {
    const lines = text.split(/\n+/).filter(line => line.trim());
    const seizures = [];
    
    lines.forEach(line => {
        const seizure = parseLine(line);
        if (seizure) {
            seizures.push(seizure);
        }
    });
    
    return seizures;
};

const parseLine = (line) => {
    const dateTime = extractDateTime(line);
    if (!dateTime) return null;
    
    // Remove the datetime portion to avoid false duration matches
    const textWithoutDate = removeDateTime(line);
    
    const duration = extractDuration(textWithoutDate);
    const trigger = extractTrigger(line);
    const description = line.trim();
    
    return {
        dateTime,
        duration,
        trigger,
        description
    };
};

/**
 * Removes date/time portion from text to prevent false duration matches
 */
const removeDateTime = (text) => {
    // Remove common date/time patterns
    const patterns = [
        /\d{1,2}\/\d{1,2}\/\d{2,4}\s*\d{1,4}(?::\d{2})?\s*(?:am|pm)?/gi,
        /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,\s]*\d{4}?\s*\d{1,4}(?::\d{2})?\s*(?:am|pm)?/gi,
    ];
    
    let result = text;
    for (const pattern of patterns) {
        result = result.replace(pattern, '');
    }
    
    return result;
};

const extractDateTime = (text) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    const patterns = [
        /(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{2,4})[\s,]*(?<time>\d{1,4}(?::\d{2})?\s*(?:am|pm|AM|PM)(?:\(ish\))?)?/i,
        /(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?[,\s]*(?<year>\d{4})?[\s,]*(?<time>\d{1,4}(?::\d{2})?\s*(?:am|pm|AM|PM)(?:\(ish\))?)?/i,
        /(?<day>\d{1,2})(?:st|nd|rd|th)?\s+(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]*(?<year>\d{4})?[\s,]*(?<time>\d{1,4}(?::\d{2})?\s*(?:am|pm|AM|PM)(?:\(ish\))?)?/i,
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match.groups) {
            const { month, day, year, time } = match.groups;
            
            let monthNum;
            if (isNaN(month)) {
                monthNum = parseMonthName(month);
            } else {
                monthNum = parseInt(month);
            }
            
            const dayNum = parseInt(day);
            const yearNum = year ? (year.length === 2 ? 2000 + parseInt(year) : parseInt(year)) : currentYear;
            
            let timeStr = '12:00';
            if (time) {
                // Remove (ish) and other qualifiers
                const cleanTime = time.replace(/\(ish\)/gi, '').trim();
                const timeMatch = cleanTime.match(/(\d{1,4})(?::(\d{2}))?\s*(am|pm)/i);
                if (timeMatch) {
                    let timeNum = timeMatch[1];
                    let hours, minutes;
                    
                    // Handle times without colon (e.g., "806" or "835")
                    if (!timeMatch[2]) {
                        // Time without colon
                        if (timeNum.length === 3) {
                            // 3 digits: first digit is hour (e.g., "339" = 3:39)
                            hours = parseInt(timeNum[0]);
                            minutes = timeNum.slice(1);
                        } else if (timeNum.length === 4) {
                            // 4 digits: first two are hours (e.g., "1140" = 11:40)
                            hours = parseInt(timeNum.slice(0, 2));
                            minutes = timeNum.slice(2);
                        } else {
                            // 1-2 digits: just hours
                            hours = parseInt(timeNum);
                            minutes = '00';
                        }
                    } else {
                        // Time with colon (e.g., "3:39")
                        hours = parseInt(timeNum);
                        minutes = timeMatch[2];
                    }
                    
                    const period = timeMatch[3]?.toLowerCase();
                    
                    if (period === 'pm' && hours < 12) hours += 12;
                    if (period === 'am' && hours === 12) hours = 0;
                    
                    timeStr = `${hours.toString().padStart(2, '0')}:${minutes}`;
                }
            }
            
            const dateStr = `${yearNum}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
            return `${dateStr}T${timeStr}`;
        }
    }
    
    return null;
};

const parseMonthName = (monthName) => {
    const months = {
        jan: 1, january: 1,
        feb: 2, february: 2,
        mar: 3, march: 3,
        apr: 4, april: 4,
        may: 5,
        jun: 6, june: 6,
        jul: 7, july: 7,
        aug: 8, august: 8,
        sep: 9, september: 9,
        oct: 10, october: 10,
        nov: 11, november: 11,
        dec: 12, december: 12
    };
    return months[monthName.toLowerCase()] || 1;
};

const extractDuration = (text) => {
    const patterns = [
        // Minutes with optional seconds (e.g., "3 minutes", "2 min 30 sec")
        /(?<minutes>\d+)\s*(?:min(?:ute)?s?)(?:\s*(?<seconds>\d+)\s*(?:sec(?:ond)?s?))?/i,
        // Seconds only (e.g., "30 seconds")
        /(?<seconds>\d+)\s*(?:sec(?:ond)?s?)/i,
        // Time format MM:SS but NOT if followed by am/pm (negative lookahead)
        // This prevents matching times like "3:39pm"
        /(?<minutes>\d+):(?<seconds>\d+)(?!\s*(?:am|pm))/i,
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match.groups) {
            return {
                minutes: parseInt(match.groups.minutes || 0),
                seconds: parseInt(match.groups.seconds || 0)
            };
        }
    }
    
    return { minutes: 0, seconds: 0 };
};

const extractTrigger = (text) => {
    const triggers = [
        // Movement/Activity
        'ran to door', 'ran to', 'came home', 'door opened', 'knocked',
        'running', 'playing', 'exercise',
        // Resting/Sleep
        'sleeping', 'woke up', 'resting', 'asleep', 'laying down',
        // Food/Eating
        'after eating', 'called for food', 'food', 'eating',
        // Environment
        'loud noise', 'thunder', 'fireworks', 'noise',
        // Other
        'stress', 'excitement', 'heat', 'flashing lights',
        'medication change', 'missed medication', 'lack of sleep'
    ];
    
    const lowerText = text.toLowerCase();
    
    // Find the longest matching trigger (more specific)
    let foundTrigger = '';
    for (const trigger of triggers) {
        if (lowerText.includes(trigger) && trigger.length > foundTrigger.length) {
            foundTrigger = trigger;
        }
    }
    
    if (foundTrigger) {
        return foundTrigger.charAt(0).toUpperCase() + foundTrigger.slice(1);
    }
    
    return 'Unknown';
};