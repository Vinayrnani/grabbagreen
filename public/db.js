// db.js - Database initialization and schema
// Separated from app.js for cleaner architecture

const db = new Dexie("SaladDB");

db.version(18).stores({
    customers: '++id, name, nickname, route, plan, status, vacationUntil, startDate, inactive_st_dt, inactive_ed_dt, pendingAddonDate, mobile, discount, paymentType, advanceBalance, createdAt, updatedAt',
    advances: '++id, custId, amount, date, invoiceNumber, notes, createdAt',
    attendance: '++id, [custId+date], date, status, addons, isWalkIn, quantity, isVacation, inclusion, addon, coupleAddon1, coupleAddon2, extraAddons, createdAt, updatedAt',
    logs: '++id, timestamp, action',
    settings: 'id, value',
    invoices: '++id, custId, monthYear, invoiceNumber, status, subTotal, discountAmount, adjustmentsTotal, total, balanceDue, generatedAt, sentAt, textShared, pdfShared, [custId+monthYear], createdAt, updatedAt',
    invoiceItems: '++id, invoiceId, type, description, quantity, unitPrice, amount, createdAt, updatedAt',
    invoiceAdjustments: '++id, invoiceId, type, description, amount, createdAt, updatedAt',
    payments: '++id, invoiceId, amount, date, method, notes, createdAt, updatedAt'
}).upgrade(tx => {
    // IST Timezone (IST = UTC+5:30)
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const now = new Date(Date.now() + IST_OFFSET).toISOString();
    
    // Migrate all tables - add timestamps if missing
    const tables = ['customers', 'attendance', 'invoices', 'invoiceItems', 'invoiceAdjustments', 'payments'];
    
    return Promise.all(tables.map(tableName => {
        return tx.table(tableName).toCollection().modify(record => {
            if (!record.createdAt) record.createdAt = now;
            if (!record.updatedAt) record.updatedAt = now;
        });
    }));
}).upgrade(tx => {
    // v16: Add paymentType and advanceBalance to customers
    return tx.table('customers').toCollection().modify(record => {
        if (!record.paymentType) record.paymentType = 'postpaid';
        if (record.advanceBalance === undefined) record.advanceBalance = 0;
    });
}).upgrade(tx => {
    // v17: Add startDate field to customers (set to null, will be populated by app.js init)
    return tx.table('customers').toCollection().modify(record => {
        if (record.startDate === undefined) {
            record.startDate = null;
        }
    });
}).upgrade(tx => {
    // v18: Add inactive_st_dt and inactive_ed_dt fields
    return tx.table('customers').toCollection().modify(record => {
        if (record.inactive_st_dt === undefined) record.inactive_st_dt = null;
        if (record.inactive_ed_dt === undefined) record.inactive_ed_dt = null;
    });
});

// Make db available globally for other scripts
window.db = db;

// Optional hooks for sync indicator (use optional chaining to prevent errors if Dexie version doesn't support hooks)
try {
    db.customers?.hook('creating', () => { window.hasPendingChanges = true; window.updateSyncIndicator?.('pending'); });
    db.customers?.hook('updating', () => { window.hasPendingChanges = true; window.updateSyncIndicator?.('pending'); });
} catch(e) {
    console.log('DB hooks not supported in this version');
}
