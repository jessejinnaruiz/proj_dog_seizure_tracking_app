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
    
    const duration = extractDuration(line);
    const trigger = extractTrigger(line);
    const description = line.trim();
    
    return {
        dateTime,
        duration,
        trigger,
        description
    };
};

const extractDateTime = (text) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    const patterns = [
        /(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{2,4})[\s,]*(?<time>\d{1,2}:\d{2}\s*(?:am|pm)?)?/i,
        /(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?[,\s]*(?<year>\d{4})?[\s,]*(?<time>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i,
        /(?<day>\d{1,2})(?:st|nd|rd|th)?\s+(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]*(?<year>\d{4})?[\s,]*(?<time>\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i,
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
                const timeMatch = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = timeMatch[2] || '00';
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
        /(?<minutes>\d+)\s*(?:min(?:ute)?s?)(?:\s*(?<seconds>\d+)\s*(?:sec(?:ond)?s?))?/i,
        /(?<seconds>\d+)\s*(?:sec(?:ond)?s?)/i,
        /(?<minutes>\d+):(?<seconds>\d+)/,
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
        'loud noise', 'thunder', 'fireworks', 'stress', 'excitement',
        'heat', 'flashing lights', 'woke up', 'after eating', 'exercise',
        'medication change', 'missed medication', 'lack of sleep'
    ];
    
    const lowerText = text.toLowerCase();
    for (const trigger of triggers) {
        if (lowerText.includes(trigger)) {
            return trigger.charAt(0).toUpperCase() + trigger.slice(1);
        }
    }
    
    return 'Unknown';
};