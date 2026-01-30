const db = new Dexie("SaladDB");
db.version(6).stores({ // Incremented to 6 to apply index change
    customers: '++id, name, nickname, route, plan, status, vacationUntil, pendingAddonDate',
    attendance: '++id, [custId+date], date, status, addons, isWalkIn, quantity, isVacation', // Added 'date' here
    logs: '++id, timestamp, action'
});

const PRICES = { Regular: 5000, Premium: 6500, MealBox: 7800, WalkIn: 200, Addon: 100 };


// Utility to get YYYY-MM-DD
//const getToday = () => new Date().toISOString().split('T')[0];

async function renderList() {
    const list = document.getElementById('attendanceList');
    list.innerHTML = ''; 
    
    // 1. GET CURRENT CONTEXT
    const viewDate = selectedDate || getToday(); 
    let allCustomers = await db.customers.toArray();
    
    // Get all attendance for the date we are currently viewing
    const dayAttendance = await db.attendance.where('date').equals(viewDate).toArray();
    const attendanceMap = new Map(dayAttendance.map(a => [a.custId, a]));

    // 2. SMART FILTERING
    // Active List: Show if customer is 'active' OR if they have a record for this specific date
    let activeCustomers = allCustomers.filter(c => {
        const hasRecord = attendanceMap.has(c.id);
        const isCurrentlyActive = c.status !== 'inactive';
        return isCurrentlyActive || hasRecord;
    });

    // Inactive List: Show only if currently inactive AND no record exists for this date
    const inactiveCustomers = allCustomers.filter(c => {
        const hasRecord = attendanceMap.has(c.id);
        const isCurrentlyInactive = c.status === 'inactive';
        return isCurrentlyInactive && !hasRecord;
    });



    // 3. RENDER ACTIVE/HISTORICAL CARDS
    for (const cust of activeCustomers) {
        const todayEntry = attendanceMap.get(cust.id);
        const hasPendingAddon = cust.pendingAddonDate === viewDate;
        
        let addonBadge = "";
        if (todayEntry && todayEntry.addons > 0) {
            addonBadge = `<span class="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded ml-2 border border-blue-800">ADD-ON INCLUDED</span>`;
        } else if (!todayEntry && cust.pendingAddonDate === viewDate) {
            addonBadge = `<span class="bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded ml-2 animate-pulse border border-yellow-600">ADD-ON REQUESTED</span>`;
        }

        let statusConfig = {
            cardClass: 'bg-white border-green-500 shadow-md',
            badge: '',
            hint: '<p class="text-blue-500 text-[10px] mt-1 italic animate-pulse">Swipe Right: Delivered | Left: Skip</p>',
            isLocked: false
        };

        // Check for Vacation, Delivered, or Skipped status
        if (todayEntry && todayEntry.isVacation) {
            statusConfig = {
                cardClass: 'bg-vacation-muted border-blue-400',
                badge: `<span class="status-badge bg-slate-500 text-white">ON VACATION</span>`,
                hint: `<p class="text-slate-500 text-xs mt-1 font-medium italic">Auto-skipped until ${cust.vacationUntil}</p>`,
                isLocked: true,
                actionButton: `<button onclick="resumeVacationEarly(${cust.id})" class="btn-resume text-[10px] px-3 py-2 rounded-lg font-bold shadow-md pointer-events-auto">RESUME EARLY</button>`
            };
        } else if (todayEntry) {
            if (todayEntry.status === 'delivered') {
                statusConfig = {
                    cardClass: 'bg-green-100 border-green-700 shadow-inner',
                    badge: '<span class="status-badge bg-green-700 text-white">✓ DELIVERED</span>',
                    isLocked: true
                };
            } else {
                statusConfig = {
                    cardClass: 'bg-orange-100 border-orange-700 shadow-inner',
                    badge: '<span class="status-badge bg-orange-700 text-white">⚠ SKIPPED</span>',
                    isLocked: true
                };
            }
        }

        const card = document.createElement('div');
        card.className = `customer-card p-4 rounded-xl border-l-8 flex justify-between items-center transition-all ${statusConfig.cardClass}`;
        
        // Attach long-press for editing
        setupLongPress(card, cust.id);

        card.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">${cust.route}</span>
                    <h3 class="font-bold text-lg text-gray-900">${cust.name} ${addonBadge}</h3>
                </div>
                <p class="text-xs text-gray-600 font-semibold uppercase tracking-tighter">${cust.plan}</p>
                <div class="mt-1">${statusConfig.badge || ''}</div>
                ${!statusConfig.isLocked ? statusConfig.hint : ''}
            </div>
            <div class="flex flex-col gap-2">
                ${statusConfig.isLocked && statusConfig.actionButton ? statusConfig.actionButton : ''}
                ${!statusConfig.isLocked ? `
                    <button onclick="openVacationModal(${cust.id})" class="text-[10px] bg-white border border-orange-300 text-orange-700 px-3 py-1.5 rounded-lg font-bold shadow-sm">VACATION</button>
                    <button onclick="addAddon(${cust.id})" ${hasPendingAddon ? 'disabled' : ''} 
                        class="text-[10px] ${hasPendingAddon ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white border-blue-300 text-blue-700'} px-3 py-1.5 rounded-lg font-bold shadow-sm">
                        ${hasPendingAddon ? 'ADDON SET' : '+ ADDON'}
                    </button>
                ` : ''}
            </div>
        `;

        if (!statusConfig.isLocked) {
            setupSwipe(card, cust);
        }
        list.appendChild(card);
    }

    // 4. RENDER INACTIVE "BASEMENT" (Only for current day)
    if (inactiveCustomers.length > 0) {
        const div = document.createElement('div');
        div.className = "py-8 text-center text-gray-400 text-[10px] font-bold uppercase tracking-[0.3em]";
        div.innerText = "— Inactive Customers —";
        list.appendChild(div);
        
        inactiveCustomers.forEach(c => {
            const iCard = document.createElement('div');
            iCard.className = "p-3 bg-gray-50 border-l-4 border-gray-300 rounded-xl mb-2 flex justify-between items-center opacity-60 grayscale";
            setupLongPress(iCard, c.id);
            iCard.innerHTML = `
                <div>
                    <h4 class="font-bold text-gray-500">${c.name}</h4>
                    <p class="text-[10px] uppercase tracking-tighter font-semibold">${c.plan}</p>
                </div>
                <div class="bg-gray-200 text-gray-500 text-[9px] px-2 py-1 rounded font-black">${c.route}</div>
            `;
            list.appendChild(iCard);
        });
    }
}

// Swipe Setup
function setupSwipe(el, cust) {
    let startX = 0;
    let activated = false; 
    
    el.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        activated = false; 
        el.style.transition = 'none'; // Instant response during move
    }, {passive: true});

    el.addEventListener('touchmove', e => {
        if (activated) return;
        let diff = e.touches[0].clientX - startX;
        
        // Only allow swiping outward
        if (Math.abs(diff) > 10) {
            el.style.transform = `translateX(${diff}px)`;
            // Visual cues while sliding
            if (diff > 80) el.style.backgroundColor = "#dcfce7"; // Greenish
            else if (diff < -80) el.style.backgroundColor = "#fee2e2"; // Reddish
            else el.style.backgroundColor = "";
        }
    }, {passive: true});

    el.addEventListener('touchend', e => {
        let diff = e.changedTouches[0].clientX - startX;
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";

        if (!activated) {
            if (diff > 120) {
                activated = true;
                recordAttendance(cust.id, 'delivered');
            } else if (diff < -120) {
                activated = true;
                recordAttendance(cust.id, 'skipped');
            }
        }
    });
}
// Add this at the top of your app.js
let isProcessing = false; 





// Update the recordAttendance to capture that pending addon
async function recordAttendance(custId, status) {
    if (isProcessing) return;
    // --- ADDED GUARD ---
    if (!confirmDateAction(status.toUpperCase())) {
        await renderList(); // Reset swipe position
        return;
    }
    isProcessing = true;
    const today = getToday();

    try {
        const customer = await db.customers.get(custId);
        const hasPendingAddon = customer.pendingAddonDate === today;

        // NEW RULE: Confirmation if skipping with an Add-on
        if (status === 'skipped' && hasPendingAddon) {
            const confirmSkip = confirm(`Wait! ${customer.nickname} has an Add-on requested. If you skip, the Add-on will be removed for today. Proceed?`);
            if (!confirmSkip) {
                isProcessing = false;
                await renderList(); // Reset the card position
                return;
            }
        }

        // Calculate final addon count
        // Only charge for addon if it was requested AND delivered
        const finalAddons = (status === 'delivered' && hasPendingAddon) ? 1 : 0;

        const id = await db.attendance.add({
            custId: custId,
            date: today,
            status: status,
            addons: finalAddons,
            isWalkIn: false,
            quantity: 1
        });

        // Always clear the pending flag once a swipe (any swipe) is done
        await db.customers.update(custId, { pendingAddonDate: null });

        lastAction = { type: 'attendance', id: id, custId: custId };
        showUndo(`Marked ${status} ${finalAddons ? 'with Add-on' : ''}`);
        
        await renderList();

    } catch (e) {
        console.error("Attendance Error:", e);
    } finally {
        isProcessing = false;
    }
}

// Vacation Logic
// USE THIS INSTEAD OF setVacation
async function openVacationModal(custId) {
    if (!confirmDateAction("Vacation")) return;
    const days = prompt("How many days will they be away? (Including today)", "3");
    
    if (days && !isNaN(days)) {
        const today = new Date();
        
        // 1. Loop and create 'skipped' records for the vacation duration
        for (let i = 0; i < parseInt(days); i++) {
            const vDate = new Date();
            vDate.setDate(today.getDate() + i);
            const dateStr = vDate.toISOString().split('T')[0];

            try {
                await db.attendance.add({
                    custId: custId,
                    date: dateStr,
                    status: 'skipped',
                    addons: 0,
                    isWalkIn: false,
                    isVacation: true // Marker for the "Till Date" message
                });
            } catch (e) {
                // If a record already exists for a date, we don't overwrite it
                console.warn("Day already has a record: " + dateStr);
            }
        }

        // 2. Update the customer's resume date
        const resumeDate = new Date();
        resumeDate.setDate(today.getDate() + parseInt(days));
        await db.customers.update(custId, { 
            vacationUntil: resumeDate.toISOString().split('T')[0] 
        });

        showUndo(`Vacation set for ${days} days`);
        await renderList(); // Refresh UI to show the Blue Vacation card
    }
}

// Invoice Generation Logic (Accounting)
async function generateInvoice(custId) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    
    const logs = await db.attendance
        .where('custId').equals(custId)
        .and(r => r.date >= firstDay)
        .toArray();

    const deliveredCount = logs.filter(l => l.status === 'delivered').length;
    const addonsCount = logs.reduce((sum, l) => sum + (l.addons || 0), 0);
    
    const customer = await db.customers.get(custId);
    // 26 bowls = 1 full subscription. If more/less, we calculate per-bowl.
    const perBowlPrice = PRICES[customer.plan] / 26;
    const total = (deliveredCount * perBowlPrice) + (addonsCount * 100);

    alert(`Invoice for ${customer.name}: 
    Bowls: ${deliveredCount}
    Addons: ${addonsCount}
    Total: ₹${Math.round(total)}`);
}

// Initialize
async function init() {
    const count = await db.customers.count();
    if (count === 0) {
        await db.customers.bulkAdd([
            { name: "Amit Kumar", nickname: "Amit", route: "A", plan: "Premium", status: "active", vacationUntil: null },
            { name: "Sneha Reddy", nickname: "Sneha", route: "B", plan: "Regular", status: "active", vacationUntil: null }
        ]);
    }
    renderList();
}
async function showAddCustomer() {
    const name = prompt("Enter Customer Full Name:");
    if (!name) return;
    const nickname = prompt("Enter Nickname (for quick view):");
    const route = prompt("Enter Route (A, B, or C):").toUpperCase();
    const plan = prompt("Enter Plan (Regular, Premium, MealBox):", "Regular");

    await db.customers.add({
        name,
        nickname,
        route,
        plan,
        status: 'active',
        vacationUntil: null
    });
    
    renderList();
}

// --- NEW FEATURE: MODAL CONTROLS ---
function openModal(contentHtml, confirmAction) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    content.innerHTML = contentHtml;
    confirmBtn.onclick = async () => {
        await confirmAction();
        closeModal();
    };
    overlay.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
}

// --- NEW FEATURE: ADD NEW SUBSCRIBER ---
function showAddCustomer() {
    const html = `
        <h2 class="text-xl font-bold mb-4">Add New Subscriber</h2>
        <div class="space-y-4">
            <input id="newCustName" type="text" placeholder="Full Name" class="w-full border p-3 rounded-lg">
            <input id="newCustNick" type="text" placeholder="Nickname" class="w-full border p-3 rounded-lg">
            <select id="newCustRoute" class="w-full border p-3 rounded-lg">
                <option value="A">Route A</option>
                <option value="B">Route B</option>
                <option value="C">Route C</option>
            </select>
            <select id="newCustPlan" class="w-full border p-3 rounded-lg">
                <option value="Regular">Regular (₹5000)</option>
                <option value="Premium">Premium (₹6500)</option>
                <option value="MealBox">Meal Box (₹7800)</option>
            </select>
        </div>
    `;

    openModal(html, async () => {
        const name = document.getElementById('newCustName').value;
        const nickname = document.getElementById('newCustNick').value;
        const route = document.getElementById('newCustRoute').value;
        const plan = document.getElementById('newCustPlan').value;

        if (name && nickname) {
            await db.customers.add({
                name, nickname, route, plan,
                status: 'active',
                vacationUntil: null
            });
            renderList();
        }
    });
}

// --- NEW FEATURE: WALK-IN / IN-STORE ENTRY ---
function showWalkIn() {
    const html = `
        <h2 class="text-xl font-bold mb-2 text-center">In-Store Sale</h2>
        <div class="flex flex-col items-center gap-4 py-4">
            <input id="walkInQty" type="number" value="1" min="1" 
                   class="text-center text-3xl w-24 border-b-4 border-green-600 p-2 outline-none">
            <p class="text-gray-500 font-bold">Salads @ ₹200 each</p>
        </div>
    `;
    
    // Pass the saveWalkIn function to the modal confirm button
    openModal(html, saveWalkIn);
}
async function saveWalkIn() {
    const qtyInput = document.getElementById('walkInQty');
    const qty = parseInt(qtyInput.value);
    
    if (qty > 0) {
        await db.attendance.add({
            custId: 0, // 0 = Walk-in
            date: getToday(),
            status: 'delivered',
            addons: 0,
            isWalkIn: true,
            quantity: qty
        });
        showUndo(`Saved ₹${qty * 200} Walk-in`);
        closeModal();
    }
}

// --- NEW FEATURE: ADD-ONS (₹100) ---
async function addAddon(custId) {
    if (!confirmDateAction("ADD-ON")) return;
    const today = getToday();
    
    try {
        // Force the database to finish the update before moving to the next line
        await db.customers.update(custId, { 
            pendingAddonDate: today 
        });

        // Store this for the Undo button
        lastAction = { type: 'addon', custId: custId };

        showUndo("Add-on marked for this bowl");

        // Now that the DB is 100% updated, redraw the UI
        await renderList(); 

    } catch (error) {
        console.error("Addon Error:", error);
    }
}

// Variable to store the last action for undo purposes
let lastAction = null;

function showUndo(text) {
    const bar = document.getElementById('undoBar');
    const textEl = document.getElementById('undoText');
    
    if (!bar || !textEl) return; // Guard against missing HTML elements

    textEl.innerText = text;
    bar.classList.remove('hidden');
    bar.classList.add('visible');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        bar.classList.remove('visible');
        bar.classList.add('hidden');
    }, 5000);
}

async function undoLastAction() {
    if (!lastAction) return;

    if (lastAction.type === 'attendance') {
        await db.attendance.delete(lastAction.id);
    } else if (lastAction.type === 'addon') {
        await db.customers.update(lastAction.custId, { pendingAddonDate: null });
    }
    
    lastAction = null;
    document.getElementById('undoBar').classList.add('hidden');
    await renderList();
}


//INVOICE

async function generateAllInvoices() {
    const { jsPDF } = window.jspdf;
    const today = new Date();
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    
    const customers = await db.customers.where('status').equals('active').toArray();

    for (const cust of customers) {
        const doc = new jsPDF();
        const records = await db.attendance.where('custId').equals(cust.id).toArray();
        
        // Filter for current month and exclude Sundays
        const thisMonthRecords = records.filter(r => {
            const d = new Date(r.date);
            return d.getMonth() === today.getMonth() && d.getDay() !== 0;
        });

        const deliveredCount = thisMonthRecords.filter(r => r.status === 'delivered').length;
        const totalAddons = thisMonthRecords.reduce((sum, r) => sum + (r.addons || 0), 0);
        
        // Math: (Total Delivered / 26) * Monthly Cost
        const baseRate = PRICES[cust.plan] / 26;
        const totalAmount = (deliveredCount * baseRate) + (totalAddons * 100);

        // PDF Styling
        doc.setFontSize(22);
        doc.text("SALAD MASTER INVOICE", 20, 20);
        doc.setFontSize(12);
        doc.text(`Customer: ${cust.name} (${cust.nickname})`, 20, 40);
        doc.text(`Route: ${cust.route}`, 20, 50);
        doc.text(`Month: ${monthNames[today.getMonth()]} ${today.getFullYear()}`, 20, 60);
        
        doc.line(20, 65, 190, 65);
        
        doc.text(`Total Bowls Delivered: ${deliveredCount}`, 20, 80);
        doc.text(`Extra Add-ons: ${totalAddons}`, 20, 90);
        doc.setFontSize(16);
        doc.text(`TOTAL PAYABLE: Rs. ${Math.round(totalAmount)}`, 20, 110);
        
        doc.setFontSize(10);
        doc.text("Thank you for your subscription!", 20, 130);

        // Save file
        doc.save(`Invoice_${cust.nickname}_${monthNames[today.getMonth()]}.pdf`);
    }
}

async function resumeVacationEarly(custId) {
    if (!confirm("Customer is back? This will clear future skipped records and make them active today.")) return;

    const today = getToday();

    try {
        // 1. Find and delete all 'skipped' vacation records from today onwards
        const futureRecords = await db.attendance
            .where('custId').equals(custId)
            .filter(r => r.date >= today && r.isVacation === true)
            .toArray();
        
        const idsToDelete = futureRecords.map(r => r.id);
        await db.attendance.bulkDelete(idsToDelete);

        // 2. Clear the vacation date on the customer
        await db.customers.update(custId, { vacationUntil: null });

        showUndo("Customer is back! Card reactivated.");
        
        // 3. Refresh UI
        await renderList();

    } catch (e) {
        console.error("Resume Error:", e);
    }
}
let customDate = null;

function getToday() {
    return selectedDate;
}

let selectedDate = new Date().toISOString().split('T')[0];
const trueToday = new Date().toISOString().split('T')[0];



// Reuse this guard in recordAttendance, addAddon, and openVacationModal
function canExecuteAction(actionName) {
    if (selectedDate !== trueToday) {
        return confirm(`⚠️ ACTION WARNING\n\nYou are currently viewing ${selectedDate}.\nAre you sure you want to record ${actionName} for this date?`);
    }
    return true;
}
function confirmDateAction(actionType) {
    if (selectedDate !== trueToday) {
        return confirm(`⚠️ ATTENTION: You are viewing ${selectedDate}.\n\nDo you really want to record a ${actionType} for this date instead of today?`);
    }
    return true; // No warning needed for today
}
function toggleSettings() {
    const drawer = document.getElementById('settingsDrawer');
    if (drawer) drawer.classList.toggle('hidden');
    
    // Safety check: only update if the element exists
    const versionEl = document.querySelector('.version-text');
    if (versionEl) {
        versionEl.innerText = "Grabb a Green v1.5";
    }
}

// EXPORT: Save all data to a file
async function exportData() {
    try {
        const customers = await db.customers.toArray();
        const attendance = await db.attendance.toArray();
        
        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            customers: customers,
            attendance: attendance
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `GrabbAGreen_Backup_${getToday()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showUndo("Backup downloaded successfully!");
        toggleSettings(); // Close the menu
    } catch (e) {
        console.error("Export failed:", e);
        alert("Export failed: " + e.message);
    }
}

// IMPORT: Restore data from a file
async function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (!confirm("This will overwrite your current data. Are you sure?")) return;

                // Clear current tables
                await db.customers.clear();
                await db.attendance.clear();

                // Restore data
                await db.customers.bulkAdd(data.customers);
                await db.attendance.bulkAdd(data.attendance);

                alert("Data restored successfully!");
                location.reload(); // Refresh app to show new data
            } catch (err) {
                console.error("Import failed:", err);
                alert("Invalid backup file.");
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

let currentEditingId = null;

// Add this to your card generation in renderList
// 1. GLOBAL BLOCKER: Prevents the menu from ever appearing on cards
document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('.customer-card')) {
        e.preventDefault();
        return false;
    }
}, false);

let pressTimer;

function setupLongPress(element, custId) {
    const start = (e) => {
        // Only trigger for primary touch or left click
        if (e.type === 'click' && e.button !== 0) return;
        
        // Clear any existing timer just in case
        clearTimeout(pressTimer);
        
        pressTimer = setTimeout(() => {
            // Give haptic feedback (vibration)
            if (navigator.vibrate) navigator.vibrate(50);
            openEditModal(custId);
        }, 600); // Slightly faster for better feel
    };

    const cancel = () => {
        clearTimeout(pressTimer);
    };

    // Mobile events
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);

    // Desktop/Emulator mouse events
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
}

async function openEditModal(custId) {
    const cust = await db.customers.get(custId);
    currentEditingId = custId;
    
    // Load both names
    document.getElementById('editFullName').value = cust.name || ''; 
    document.getElementById('editNickname').value = cust.nickname || '';
    
    document.getElementById('editRoute').value = cust.route;
    document.getElementById('editPlan').value = cust.plan;
    document.getElementById('editStatus').value = cust.status || 'active';
    
    document.getElementById('editModal').classList.remove('hidden');
}

async function saveCustomerEdit() {
    if (!currentEditingId) return;

    const update = {
        name: document.getElementById('editFullName').value,
        nickname: document.getElementById('editNickname').value,
        route: document.getElementById('editRoute').value,
        plan: document.getElementById('editPlan').value,
        status: document.getElementById('editStatus').value
    };

    await db.customers.update(currentEditingId, update);
    closeEditModal();
    await renderList(); 
    showUndo("Profile updated");
}
// 1. GLOBAL UI HELPERS
window.closeEditModal = function() {
    const modal = document.getElementById('editModal');
    if(modal) modal.classList.add('hidden');
};
// V1.5 Walk-in Logic
// Update Walk-In counts (Stored under customerId: 0)
// VERSION 1.5 - CONSOLIDATED LOGIC
// Update Walk-In counts (Stored under customerId: 0, totally separate from customers)
// Fix for v1.5 Walk-in Logic
async function updateWalkIn(type, change) {
    const date = selectedDate || new Date().toISOString().split('T')[0];
    
    // Use 'custId' (standardized) to find the record
    let record = await db.attendance.where({ custId: 0, date: date }).first();
    
    if (!record) {
        record = { custId: 0, date: date, salad: 0, addon: 0, isWalkIn: true };
    }

    if (type === 'salad') record.salad = Math.max(0, (record.salad || 0) + change);
    else record.addon = Math.max(0, (record.addon || 0) + change);

    await db.attendance.put(record);
    renderApp();
}

async function renderApp() {
    const date = selectedDate || new Date().toISOString().split('T')[0];
    
    // 1. Update counters using the standardized 'custId'
    const walkIn = await db.attendance.where({ custId: 0, date: date }).first() || { salad: 0, addon: 0 };
    
    const sEl = document.getElementById('walkInSaladCount');
    const aEl = document.getElementById('walkInAddonCount');
    if (sEl) sEl.innerText = walkIn.salad || 0;
    if (aEl) aEl.innerText = walkIn.addon || 0;

    // 2. Fix the disappearing list:
    // Call your original v1.4 render function to draw the cards
    await renderList(); 
}

// Ensure the date picker also calls the new renderApp
async function changeAppDate(val) {
    selectedDate = val;
    const display = document.getElementById('displayDate');
    
    if (val === trueToday) {
        display.innerText = "Today";
    } else {
        const d = new Date(val);
        display.innerText = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
    }
    
    await renderApp();
}
/*async function changeAppDate(val) {
    selectedDate = val;
    const display = document.getElementById('displayDate');
    const container = document.getElementById('dateDisplayContainer');
    
    if (val === trueToday) {
        display.innerText = "Today";
        container.style.borderColor = "#374151"; // Gray-700
        display.style.color = "#D1D5DB"; // Gray-300
    } else {
        const d = new Date(val);
        const formatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
        display.innerText = formatted;
        // Make it look "Active" when time travelling
        container.style.borderColor = "#f59e0b"; // Amber
        display.style.color = "#f59e0b";
    }
    
    await renderList();
    await renderApp();
}*/

init();
