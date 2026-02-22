// db.js - Database initialization and schema
// Separated from app.js for cleaner architecture

const db = new Dexie("SaladDB");

db.version(14).stores({
    customers: '++id, name, nickname, route, plan, status, vacationUntil, pendingAddonDate, mobile, discount',
    attendance: '++id, [custId+date], date, status, addons, isWalkIn, quantity, isVacation, inclusion, addon, coupleAddon1, coupleAddon2, extraAddons',
    logs: '++id, timestamp, action',
    settings: 'id, value',
    invoices: '++id, custId, monthYear, invoiceNumber, status, subTotal, discountAmount, adjustmentsTotal, total, balanceDue, generatedAt, sentAt, textShared, pdfShared, [custId+monthYear]',
    invoiceItems: '++id, invoiceId, type, description, quantity, unitPrice, amount',
    invoiceAdjustments: '++id, invoiceId, type, description, amount',
    payments: '++id, invoiceId, amount, date, method, notes'
});

// Make db available globally for other scripts
window.db = db;
