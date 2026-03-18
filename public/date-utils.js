// date-utils.js - Shared IST timezone helpers (IST = UTC+5:30)

const IST_OFFSET = 5.5 * 60 * 60 * 1000;

function istNow() { 
    return new Date(Date.now() + IST_OFFSET); 
}

function istDateStr() { 
    return istNow().toISOString().split('T')[0]; 
}

function istDay(dateStr) { 
    return new Date(dateStr + 'T00:00:00+05:30').getDay(); 
}

function istTimestamp() {
    return istNow().toISOString();
}

function istMonthYear() {
    const d = istNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Expose globally
window.istNow = istNow;
window.istDateStr = istDateStr;
window.istDay = istDay;
window.istTimestamp = istTimestamp;
window.istMonthYear = istMonthYear;
