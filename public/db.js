// db.js - Database initialization and schema
// Separated from app.js for cleaner architecture

const db = new Dexie("SaladDB");

db.version(15).stores({
    customers: '++id, name, nickname, route, plan, status, vacationUntil, pendingAddonDate, mobile, discount, createdAt, updatedAt',
    attendance: '++id, [custId+date], date, status, addons, isWalkIn, quantity, isVacation, inclusion, addon, coupleAddon1, coupleAddon2, extraAddons, createdAt, updatedAt',
    logs: '++id, timestamp, action',
    settings: 'id, value',
    invoices: '++id, custId, monthYear, invoiceNumber, status, subTotal, discountAmount, adjustmentsTotal, total, balanceDue, generatedAt, sentAt, textShared, pdfShared, [custId+monthYear], createdAt, updatedAt',
    invoiceItems: '++id, invoiceId, type, description, quantity, unitPrice, amount, createdAt, updatedAt',
    invoiceAdjustments: '++id, invoiceId, type, description, amount, createdAt, updatedAt',
    payments: '++id, invoiceId, amount, date, method, notes, createdAt, updatedAt'
}).upgrade(tx => {
    const now = new Date().toISOString();
    
    // Migrate all tables - add timestamps if missing
    const tables = ['customers', 'attendance', 'invoices', 'invoiceItems', 'invoiceAdjustments', 'payments'];
    
    return Promise.all(tables.map(tableName => {
        return tx.table(tableName).toCollection().modify(record => {
            if (!record.createdAt) record.createdAt = now;
            if (!record.updatedAt) record.updatedAt = now;
        });
    }));
});

// === AUTOMATIC TIMESTAMPS VIA GLOBAL HOOKS ===
// Applies to ALL tables automatically

db.hook('creating', (primKey, obj) => {
    const now = new Date().toISOString();
    obj.createdAt = now;
    obj.updatedAt = now;
});

db.hook('updating', (mods) => {
    mods.updatedAt = new Date().toISOString();
});

// Make db available globally for other scripts
window.db = db;
