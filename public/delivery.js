// delivery.js - Delivery Boy App Logic

let currentDriverMobile = '';
let selectedDeliveryCustId = null;
let allDeliveries = [];

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
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

function logoutDelivery() {
    if (confirm('Logout?')) {
        localStorage.removeItem('deliveryDriverMobile');
        location.reload();
    }
}

async function loadDeliveryRoute() {
    showLoading();
    
    const today = getToday();
    
    try {
        // First try to load from local storage
        const localDeliveries = await deliveryDB.deliveries
            .where('date').equals(today)
            .toArray();
        
        if (localDeliveries.length > 0) {
            renderDeliveryCards(localDeliveries);
            hideLoading();
            // Try to sync with cloud in background
            syncWithCloud();
            return;
        }
        
        // If no local data, try to fetch from cloud
        const snapshot = await fs.collection('delivery_customers')
            .where('date', '==', today)
            .where('driverMobile', '==', currentDriverMobile)
            .get();
        
        if (snapshot.empty) {
            showEmptyState();
            hideLoading();
            return;
        }
        
        const deliveries = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                custId: data.custId,
                date: data.date,
                route: data.route,
                driverMobile: data.driverMobile,
                name: data.name,
                nickname: data.nickname,
                inclusions: data.inclusions,
                extraAddons: data.extraAddons,
                isDelivered: data.isDelivered || false,
                updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date()
            };
        });
        
        // Save to local DB
        for (const d of deliveries) {
            await deliveryDB.deliveries.put({
                firestoreId: d.id,
                custId: d.custId,
                date: d.date,
                route: d.route,
                driverMobile: d.driverMobile,
                name: d.name,
                nickname: d.nickname,
                inclusions: d.inclusions,
                extraAddons: d.extraAddons,
                isDelivered: d.isDelivered,
                updatedAt: d.updatedAt
            });
        }
        
        renderDeliveryCards(deliveries);
        
    } catch (error) {
        console.error('Error loading deliveries:', error);
        alert('Error loading route. Check internet connection.');
    }
    
    hideLoading();
}

function renderDeliveryCards(deliveries) {
    const container = document.getElementById('deliveryCards');
    const emptyState = document.getElementById('emptyState');
    
    allDeliveries = deliveries;
    
    // Sort: undelivered first, then delivered
    deliveries.sort((a, b) => {
        if (a.isDelivered === b.isDelivered) return 0;
        return a.isDelivered ? 1 : -1;
    });
    
    if (deliveries.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    // Get route from first delivery
    const route = deliveries[0]?.route || '';
    document.getElementById('routeBadge').textContent = `Route ${route}`;
    
    // Update count
    const delivered = deliveries.filter(d => d.isDelivered).length;
    document.getElementById('deliveryCount').textContent = `${delivered}/${deliveries.length}`;
    
    container.innerHTML = deliveries.map(d => `
        <div id="card-${d.custId}" 
            class="delivery-card p-4 rounded-xl border-l-8 flex justify-between items-center transition-all shadow-lg ${d.isDelivered ? 'bg-green-50 border-l-green-500' : 'bg-white border-l-gray-800'}"
            data-custid="${d.custId}"
            data-firestoreid="${d.firestoreId || ''}">
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                    <span class="bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded font-bold">${d.route}</span>
                    <h3 class="font-bold text-lg text-gray-900">${d.nickname || d.name}</h3>
                    ${d.isDelivered ? '<span class="text-green-500 text-sm font-bold">✓ Delivered</span>' : ''}
                </div>
                <div class="text-sm">
                    <span class="font-bold text-gray-600">INC:</span>
                    <span class="bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-bold ml-1">${d.inclusions}</span>
                </div>
                ${d.extraAddons ? `
                <div class="text-sm mt-1">
                    <span class="font-bold text-gray-600">Extra:</span>
                    <span class="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded font-bold ml-1">${d.extraAddons}</span>
                </div>
                ` : ''}
            </div>
            <div class="text-right">
                ${d.isDelivered ? '' : '<span class="text-gray-300 text-xs">→</span>'}
            </div>
        </div>
    `).join('');
    
    // Add swipe handlers to undelivered cards
    deliveries.filter(d => !d.isDelivered).forEach(d => {
        const card = document.getElementById(`card-${d.custId}`);
        if (card) {
            setupSwipe(card, d);
            setupLongPress(card, d);
        }
    });
    
    // Show the app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appHeader').classList.remove('hidden');
    document.getElementById('deliveryList').classList.remove('hidden');
}

function setupSwipe(el, delivery) {
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
        
        if (diff > 10) {
            el.style.transform = `translateX(${diff}px)`;
            el.style.backgroundColor = "#dcfce7"; // Greenish
        }
    }, { passive: true });
    
    el.addEventListener('touchend', e => {
        let diff = e.changedTouches[0].clientX - startX;
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";
        
        if (!activated && diff > 100) {
            activated = true;
            markDelivered(delivery);
        }
    });
    
    // Mouse support for desktop testing
    el.addEventListener('mousedown', e => {
        startX = e.clientX;
        activated = false;
        el.style.transition = 'none';
    });
    
    el.addEventListener('mousemove', e => {
        if (activated) return;
        let diff = e.clientX - startX;
        
        if (diff > 10) {
            el.style.transform = `translateX(${diff}px)`;
            el.style.backgroundColor = "#dcfce7";
        }
    });
    
    el.addEventListener('mouseup', e => {
        let diff = e.clientX - startX;
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";
        
        if (!activated && diff > 100) {
            activated = true;
            markDelivered(delivery);
        }
    });
    
    el.addEventListener('mouseleave', e => {
        el.style.transition = 'transform 0.3s ease-out, background 0.3s';
        el.style.transform = `translateX(0)`;
        el.style.backgroundColor = "";
    });
}

function setupLongPress(el, delivery) {
    let pressTimer = null;
    
    el.addEventListener('touchstart', e => {
        pressTimer = setTimeout(() => {
            openActionMenu(delivery);
        }, 800);
    });
    
    el.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    });
    
    el.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
    });
    
    // Mouse support
    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        openActionMenu(delivery);
    });
}

async function markDelivered(delivery) {
    try {
        // Update local DB
        await deliveryDB.deliveries
            .where({ custId: delivery.custId, date: delivery.date })
            .first()
            .then(async record => {
                if (record) {
                    await deliveryDB.deliveries.update(record.id, {
                        isDelivered: true,
                        updatedAt: new Date()
                    });
                }
            });
        
        // Update Firestore
        if (delivery.firestoreId) {
            await fs.collection('delivery_customers').doc(delivery.firestoreId).update({
                isDelivered: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Update UI
        const card = document.getElementById(`card-${delivery.custId}`);
        if (card) {
            card.classList.add('bg-green-50', 'border-l-green-500');
            card.classList.remove('bg-white', 'border-l-gray-800');
            
            const content = card.querySelector('.flex-1');
            content.innerHTML += '<span class="text-green-500 text-sm font-bold ml-2">✓ Delivered</span>';
            
            // Remove swipe handler by replacing element
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
        }
        
        // Update count
        const delivered = allDeliveries.filter(d => d.isDelivered).length + 1;
        const total = allDeliveries.length;
        document.getElementById('deliveryCount').textContent = `${delivered}/${total}`;
        
    } catch (error) {
        console.error('Error marking delivered:', error);
        alert('Error saving. Will retry on next sync.');
    }
}

function openActionMenu(delivery) {
    selectedDeliveryCustId = delivery.custId;
    document.getElementById('actionMenu').classList.remove('hidden');
    document.getElementById('actionMenu').classList.add('flex');
}

function closeActionMenu() {
    document.getElementById('actionMenu').classList.add('hidden');
    document.getElementById('actionMenu').classList.remove('flex');
    selectedDeliveryCustId = null;
}

async function resetDelivery() {
    if (!selectedDeliveryCustId) return;
    
    if (!confirm('Reset attendance for this customer?')) {
        closeActionMenu();
        return;
    }
    
    const today = getToday();
    
    try {
        // Update local DB
        const record = await deliveryDB.deliveries
            .where({ custId: selectedDeliveryCustId, date: today })
            .first();
        
        if (record) {
            await deliveryDB.deliveries.update(record.id, {
                isDelivered: false,
                updatedAt: new Date()
            });
            
            // Update Firestore
            if (record.firestoreId) {
                await fs.collection('delivery_customers').doc(record.firestoreId).update({
                    isDelivered: false,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        // Reload the route
        loadDeliveryRoute();
        
    } catch (error) {
        console.error('Error resetting delivery:', error);
        alert('Error resetting. Check internet.');
    }
    
    closeActionMenu();
}

async function refreshDelivery() {
    localStorage.removeItem('deliveryDriverMobile');
    location.reload();
}

async function syncWithCloud() {
    try {
        const today = getToday();
        
        // Get pending deliveries from local
        const pending = await deliveryDB.deliveries
            .where('date').equals(today)
            .toArray();
        
        for (const d of pending) {
            if (d.firestoreId) {
                // Push to cloud
                await fs.collection('delivery_customers').doc(d.firestoreId).update({
                    isDelivered: d.isDelivered,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        // Pull any updates from cloud
        const snapshot = await fs.collection('delivery_customers')
            .where('date', '==', today)
            .where('driverMobile', '==', currentDriverMobile)
            .get();
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const local = await deliveryDB.deliveries
                .where({ custId: data.custId, date: today })
                .first();
            
            if (local) {
                // Update local with cloud status
                await deliveryDB.deliveries.update(local.id, {
                    isDelivered: data.isDelivered,
                    updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date()
                });
            }
        }
        
        // Reload display
        const updated = await deliveryDB.deliveries
            .where('date').equals(today)
            .toArray();
        
        renderDeliveryCards(updated);
        
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

function showEmptyState() {
    document.getElementById('deliveryCards').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appHeader').classList.remove('hidden');
    document.getElementById('deliveryList').classList.remove('hidden');
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}
