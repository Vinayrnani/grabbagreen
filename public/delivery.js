// delivery.js - Delivery Boy App Logic

let currentDriverMobile = '';
let selectedDeliveryCustId = null;
let selectedDeliveryData = null;
let allDeliveries = [];
let deliveryProcessing = false;

// Helper for plan badge
function getPlanBadge(plan) {
    const abbr = {
        'Regular': 'R',
        'Premium': 'P',
        'Couple': 'CP',
        'MealBox': 'M'
    }[plan] || 'R';
    
    const colors = {
        'R': 'bg-gray-500',
        'P': 'bg-amber-500',
        'CP': 'bg-green-500',
        'M': 'bg-blue-500'
    }[abbr] || 'bg-gray-500';
    
    return { abbr, colors };
}

window.addEventListener('DOMContentLoaded', () => {
    cleanupOldLocalRecords();
    checkLogin();
});

function checkLogin() {
    const savedMobile = localStorage.getItem('deliveryDriverMobile');
    if (savedMobile) {
        currentDriverMobile = savedMobile;
        loadDeliveryRoute();
    }
}

function loginDelivery() {
    const mobileInput = document.getElementById('driverMobile');
    const mobile = mobileInput.value.trim();
    
    if (!mobile || mobile.length < 10) {
        alert('Please enter a valid mobile number');
        return;
    }
    
    currentDriverMobile = mobile;
    localStorage.setItem('deliveryDriverMobile', mobile);
    loadDeliveryRoute();
}

async function loadDeliveryRoute() {
    showLoading();
    const today = getToday();
    
    try {
        // Get local deliveries first (offline support)
        const localDeliveries = await deliveryDB.deliveries
            .where('date').equals(today)
            .toArray();
        
        let cloudDeliveries = [];
        let cloudFetched = false;
        
        // Try to fetch from cloud
        try {
            const snapshot = await fs.collection('delivery_customers')
                .where('date', '==', today)
                .where('driverMobile', '==', currentDriverMobile)
                .get();
            
            if (!snapshot.empty) {
                cloudDeliveries = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        firestoreId: doc.id,
                        custId: data.custId,
                        date: data.date,
                        route: data.route,
                        driverMobile: data.driverMobile,
                        name: data.name,
                        nickname: data.nickname,
                        plan: data.plan || 'Regular',
                        inclusions: data.inclusions,
                        extraAddons: data.extraAddons,
                        isDelivered: data.isDelivered || false,
                        updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(0),
                        source: 'cloud'
                    };
                });
                cloudFetched = true;
            }
        } catch (e) {
            console.log('Cloud fetch failed, using local:', e);
        }
        
        // Merge based on timestamp precedence
        const merged = [];
        const allCustIds = new Set();
        
        if (cloudFetched && cloudDeliveries.length > 0) {
            // Cloud first - merge with local using timestamps
            cloudDeliveries.forEach(cloud => {
                allCustIds.add(cloud.custId);
                const local = localDeliveries.find(l => l.custId === cloud.custId);
                
                if (!local) {
                    merged.push(cloud);
                } else {
                    // Compare timestamps - newer wins
                    const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
                    const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
                    
                    if (cloudTime >= localTime) {
                        merged.push(cloud);
                    } else {
                        merged.push(local);
                    }
                }
            });
            
            // Add local-only records
            localDeliveries.forEach(local => {
                if (!allCustIds.has(local.custId)) {
                    merged.push(local);
                }
            });
        } else {
            // No cloud - use local
            merged.push(...localDeliveries);
        }
        
        if (merged.length === 0) {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            document.getElementById('deliveryList').innerHTML = '<div class="text-center py-12 text-gray-500">No deliveries assigned. Check with your manager.</div>';
            hideLoading();
            return;
        }
        
        // Save merged data to local DB
        for (const d of merged) {
            await deliveryDB.deliveries.put({
                firestoreId: d.firestoreId,
                custId: d.custId,
                date: d.date,
                route: d.route,
                driverMobile: d.driverMobile,
                name: d.name,
                nickname: d.nickname,
                plan: d.plan || 'Regular',
                inclusions: d.inclusions,
                extraAddons: d.extraAddons,
                isDelivered: d.isDelivered,
                updatedAt: d.updatedAt
            });
        }
        
        renderDeliveryCards(merged);
        
    } catch (error) {
        console.error('Error loading deliveries:', error);
        
        // On error, try local
        const localDeliveries = await deliveryDB.deliveries
            .where('date').equals(today)
            .toArray();
        
        if (localDeliveries.length > 0) {
            renderDeliveryCards(localDeliveries);
        } else {
            alert('Error loading route. Check internet connection.');
        }
    }
    
    hideLoading();
}

function renderDeliveryCards(deliveries) {
    const container = document.getElementById('deliveryList');
    allDeliveries = deliveries;
    
    if (deliveries.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-500">No deliveries assigned</div>';
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        return;
    }
    
    // Sort by customer ID
    deliveries.sort((a, b) => a.custId - b.custId);
    
    const route = deliveries[0]?.route || '';
    document.getElementById('routeBadge').textContent = `Route ${route}`;
    
    const delivered = deliveries.filter(d => d.isDelivered).length;
    document.getElementById('deliveryCount').textContent = `${delivered}/${deliveries.length}`;
    
    container.innerHTML = deliveries.map(d => {
        const name = d.nickname || d.name;
        
        // Get plan badge
        const planInfo = getPlanBadge(d.plan);
        
        // Parse inclusions - if it has + the part after is addon
        const inclusionParts = d.inclusions ? d.inclusions.split('+') : ['S1'];
        const inclusion = inclusionParts[0];
        const addon = inclusionParts[1] || '';
        
        // Extra addons display
        const extraAddonDisplay = d.extraAddons ? d.extraAddons.split(',').map(a => {
            const isNonVeg = ['C', 'F', 'SE', 'BE'].includes(a);
            return `<span class="text-xs px-2 py-0.5 rounded font-bold ${isNonVeg ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-green-100 text-green-700 border border-green-300'}">${a}</span>`;
        }).join(' ') : '';
        
        if (d.isDelivered) {
            // Delivered card - prominent ✓✓✓
            return `
            <div id="card-${d.custId}" class="customer-card p-4 rounded-xl border-l-8 flex justify-between items-center shadow-lg bg-green-50 border-l-green-500 h-[100px]">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded font-bold">${d.route}</span>
                        <span class="${planInfo.colors} text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">${planInfo.abbr}</span>
                        <h3 class="font-bold text-xl text-gray-900">${name}</h3>
                    </div>
                    <div class="text-sm mt-1">
                        <span class="text-black font-bold">INC:</span>
                        <span class="bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-bold ml-1">${inclusion}</span>
                        ${addon ? `<span class="text-black font-bold ml-2">Addon:</span><span class="text-xs px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 border border-red-300 ml-1">${addon}</span>` : ''}
                        ${extraAddonDisplay ? `<div class="mt-1"><span class="text-black font-bold">Extra:</span><span class="ml-1">${extraAddonDisplay}</span></div>` : ''}
                    </div>
                </div>
                <div class="text-green-600 text-3xl font-bold">✓</div>
            </div>`;
        }
        
        // Undelivered card
        return `
        <div id="card-${d.custId}" class="customer-card p-4 rounded-xl border-l-8 flex justify-between items-center transition-all shadow-lg bg-white border-l-gray-800 h-[100px]">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded font-bold">${d.route}</span>
                    <span class="${planInfo.colors} text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">${planInfo.abbr}</span>
                    <h3 class="font-bold text-xl text-gray-900">${name}</h3>
                </div>
                <div class="text-sm mt-1">
                    <span class="text-black font-bold">INC:</span>
                    <span class="bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-bold ml-1">${inclusion}</span>
                    ${addon ? `<span class="text-black font-bold ml-2">Addon:</span><span class="text-xs px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 border border-red-300 ml-1">${addon}</span>` : ''}
                    ${extraAddonDisplay ? `<div class="mt-1"><span class="text-black font-bold">Extra:</span><span class="ml-1">${extraAddonDisplay}</span></div>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
    
    // Add handlers - swipe only for undelivered, long press only for delivered
    deliveries.forEach(d => {
        const card = document.getElementById(`card-${d.custId}`);
        if (!card) return;
        
        if (d.isDelivered) {
            // Long press only for delivered cards (to reset)
            setupLongPress(card, d.custId);
        } else {
            // Swipe only for undelivered cards
            setupSwipe(card, d.custId);
        }
    });
    
    // Show main app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
}

// Exactly like attendance app
function setupSwipe(el, custId) {
    let startX = 0;
    let activated = false;

    el.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        activated = false;
        el.style.transition = 'none';
    }, { passive: true });

    el.addEventListener('touchmove', e => {
        if (activated) return;
        let diff = e.touches[0].clientX - startX;

        if (Math.abs(diff) > 10) {
            el.style.transform = `translateX(${diff}px)`;
            if (diff > 80) el.style.backgroundColor = "#dcfce7";
            else el.style.backgroundColor = "";
        }
    }, { passive: true });

    el.addEventListener('touchend', e => {
        let diff = e.changedTouches[0].clientX - startX;
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";

        if (!activated && diff > 120) {
            activated = true;
            markDelivered(custId);
        }
    });
    
    // Mouse support
    el.addEventListener('mousedown', e => {
        startX = e.clientX;
        activated = false;
        el.style.transition = 'none';
    });
    
    el.addEventListener('mousemove', e => {
        if (activated) return;
        let diff = e.clientX - startX;

        if (Math.abs(diff) > 10) {
            el.style.transform = `translateX(${diff}px)`;
            if (diff > 80) el.style.backgroundColor = "#dcfce7";
            else el.style.backgroundColor = "";
        }
    });
    
    el.addEventListener('mouseup', e => {
        let diff = e.clientX - startX;
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";

        if (!activated && diff > 120) {
            activated = true;
            markDelivered(custId);
        }
    });
    
    el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";
    });
}

// Exactly like attendance app
function setupLongPress(element, custId) {
    let pressTimer = null;
    
    const start = (e) => {
        if (e.type === 'click' && e.button !== 0) return;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            openActionMenu(custId);
        }, 600);
    };

    const cancel = () => clearTimeout(pressTimer);

    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchmove', cancel);
    element.addEventListener('mousedown', start);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
}

function openActionMenu(custId) {
    const delivery = allDeliveries.find(d => d.custId === custId);
    if (!delivery) return;
    
    selectedDeliveryCustId = custId;
    selectedDeliveryData = delivery;
    document.getElementById('actionMenu').classList.remove('hidden');
    document.getElementById('actionMenu').classList.add('flex');
}

function closeActionMenu() {
    document.getElementById('actionMenu').classList.add('hidden');
    document.getElementById('actionMenu').classList.remove('flex');
    selectedDeliveryCustId = null;
    selectedDeliveryData = null;
}

async function markDelivered(custId) {
    if (deliveryProcessing) return;
    deliveryProcessing = true;
    
    const delivery = allDeliveries.find(d => d.custId === custId);
    if (!delivery) {
        deliveryProcessing = false;
        return;
    }
    
    try {
        // Update local DB
        const record = await deliveryDB.deliveries
            .where({ custId: custId, date: delivery.date })
            .first();
        
        if (record) {
            await deliveryDB.deliveries.update(record.id, {
                isDelivered: true,
                updatedAt: new Date()
            });
        }
        
        // Update Firestore
        const firestoreId = delivery.firestoreId || delivery.id;
        if (firestoreId) {
            await fs.collection('delivery_customers').doc(firestoreId).update({
                isDelivered: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        loadDeliveryRoute();
        
    } catch (error) {
        console.error('Error marking delivered:', error);
        alert('Error saving. Will retry on next sync.');
    }
    
    deliveryProcessing = false;
}

async function resetDelivery() {
    if (!selectedDeliveryCustId) return;
    
    if (!confirm('Reset attendance for this customer?')) {
        closeActionMenu();
        return;
    }
    
    const today = getToday();
    
    try {
        const record = await deliveryDB.deliveries
            .where({ custId: selectedDeliveryCustId, date: today })
            .first();
        
        if (record) {
            await deliveryDB.deliveries.update(record.id, {
                isDelivered: false,
                updatedAt: new Date()
            });
            
            if (record.firestoreId) {
                await fs.collection('delivery_customers').doc(record.firestoreId).update({
                    isDelivered: false,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        loadDeliveryRoute();
        
    } catch (error) {
        console.error('Error resetting delivery:', error);
        alert('Error resetting. Check internet.');
    }
    
    closeActionMenu();
}

function refreshDelivery() {
    loadDeliveryRoute();
}

async function syncWithCloud() {
    try {
        const today = getToday();
        
        // Get cloud data
        const snapshot = await fs.collection('delivery_customers')
            .where('date', '==', today)
            .where('driverMobile', '==', currentDriverMobile)
            .get();
        
        const cloudData = {};
        if (!snapshot.empty) {
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                cloudData[data.custId] = {
                    firestoreId: doc.id,
                    isDelivered: data.isDelivered || false,
                    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(0)
                };
            });
        }
        
        // Get local data and compare timestamps
        const localDeliveries = await deliveryDB.deliveries
            .where('date').equals(today)
            .toArray();
        
        for (const d of localDeliveries) {
            const cloud = cloudData[d.custId];
            const localTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
            
            if (cloud) {
                const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
                
                if (localTime > cloudTime) {
                    // Local is newer - push to cloud
                    await fs.collection('delivery_customers').doc(d.firestoreId).update({
                        isDelivered: d.isDelivered,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else if (cloudTime > localTime) {
                    // Cloud is newer - update local
                    await deliveryDB.deliveries.update(d.id, {
                        isDelivered: cloud.isDelivered,
                        updatedAt: cloud.updatedAt
                    });
                }
                // If equal, do nothing
            } else if (d.firestoreId) {
                // No cloud record, push local
                await fs.collection('delivery_customers').doc(d.firestoreId).update({
                    isDelivered: d.isDelivered,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
    } catch (error) {
        console.log('Sync error:', error);
    }
}

function showLoading() {
    document.getElementById('loadingIndicator').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingIndicator').classList.add('hidden');
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

async function cleanupOldLocalRecords() {
    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const cutoffDate = sixtyDaysAgo.toISOString().split('T')[0];
        
        const oldRecords = await deliveryDB.deliveries
            .where('date')
            .below(cutoffDate)
            .toArray();
        
        if (oldRecords.length === 0) return;
        
        for (const record of oldRecords) {
            await deliveryDB.deliveries.delete(record.id);
        }
        console.log(`Cleaned up ${oldRecords.length} old local delivery records`);
    } catch (e) {
        console.log('Error cleaning up old local records:', e);
    }
}
