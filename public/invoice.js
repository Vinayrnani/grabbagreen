// invoice.js - Professional Invoice System
// All invoice functionality separated from app.js

// Constants
const ADDON_PRICES = {
    'C': 100, 'PR': 140, 'F': 110, 'SE': 50, 'BE': 40,
    'P': 90, 'T': 90, 'A': 60, 'V': 60, 'S': 200
};

const PAYMENT_METHODS = ['Cash', 'UPI', 'Google Pay', 'PhonePe', 'Bank Transfer', 'Other'];

const INVOICE_STATUS_COLORS = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-600',
    partial: 'bg-amber-100 text-amber-600',
    paid: 'bg-green-100 text-green-600'
};

// Global state
let currentInvoiceFilter = 'all';
let currentInvoiceId = null;

// Indian Currency Format (1,23,456.00)
function formatINR(amount) {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Generate invoice number
async function generateInvoiceNumber(monthYear) {
    const allInvoices = await db.invoices.toArray();
    const prefix = `INV-${monthYear}-`;
    const monthInvoices = allInvoices.filter(inv => inv.invoiceNumber.startsWith(prefix));
    const maxNum = monthInvoices.reduce((max, inv) => {
        const num = parseInt(inv.invoiceNumber.split('-')[2]);
        return num > max ? num : max;
    }, 0);
    return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
}

// Generate single invoice
async function generateInvoice(custId, monthYear, invoiceNumber = null) {
    const existing = await db.invoices.where({custId, monthYear}).first();
    if (existing) return existing.id;
    
    const cust = await db.customers.get(custId);
    const attendance = await db.attendance.where('date').startsWith(monthYear).toArray();
    const records = attendance.filter(a => a.custId === custId && a.status === 'delivered');
    
    if (records.length === 0) return null;
    
    // Use pre-generated invoice number, or generate new one
    const number = invoiceNumber || await generateInvoiceNumber(monthYear);
    const invoiceId = await db.invoices.add({
        custId,
        monthYear,
        invoiceNumber: number,
        status: 'draft',
        subTotal: 0,
        discountAmount: 0,
        adjustmentsTotal: 0,
        total: 0,
        balanceDue: 0,
        generatedAt: new Date().toISOString()
    });
    
    await addInvoiceLineItems(invoiceId, records, cust, monthYear);
    await recalculateInvoiceTotals(invoiceId, cust);
    
    return invoiceId;
}

// Add line items
async function addInvoiceLineItems(invoiceId, records, cust, monthYear) {
    const workingDays = await calculateWorkingDays(monthYear);
    const deliveredCount = records.length;
    const isSubscriber = deliveredCount >= (workingDays * 0.8);
    const fiftyPercent = workingDays * 0.5;
    const isFiftyPlus = deliveredCount >= fiftyPercent;

    if (cust.plan === 'Couple') {
        const s1Count = records.filter(r => r.inclusion === 'S1').length;
        const s2Count = records.filter(r => r.inclusion === 'S2').length;
        const totalSalads = s1Count + (s2Count * 2);

        let rate;
        if (isSubscriber && s2Count === deliveredCount) {
            rate = 8999 / 26 / 2;
        } else if (isSubscriber && s2Count > s1Count) {
            rate = 182.67;
        } else if (isFiftyPlus) {
            rate = 192.27;
        } else {
            rate = 200;
        }

        await db.invoiceItems.add({
            invoiceId,
            type: 'salad',
            description: 'Salad bowls (Couple)',
            quantity: totalSalads,
            unitPrice: rate,
            amount: totalSalads * rate
        });
    } else {
        let unitPrice;
        if (cust.plan === 'Regular') {
            unitPrice = isSubscriber ? 4999 / 26 : 200;
        } else if (cust.plan === 'Premium') {
            unitPrice = 6499 / 26;
        } else if (cust.plan === 'MealBox') {
            unitPrice = 7800 / 26;
        } else {
            unitPrice = isSubscriber ? (PRICES[cust.plan] || 5000) / 26 : 200;
        }

        await db.invoiceItems.add({
            invoiceId,
            type: 'salad',
            description: `Salad bowls (${cust.plan})`,
            quantity: deliveredCount,
            unitPrice: unitPrice,
            amount: deliveredCount * unitPrice
        });
    }
    
    const addonCounts = {};
    records.forEach(record => {
        if (record.extraAddons && Array.isArray(record.extraAddons)) {
            record.extraAddons.forEach(code => {
                addonCounts[code] = (addonCounts[code] || 0) + 1;
            });
        }
    });
    
    for (const [code, count] of Object.entries(addonCounts)) {
        await db.invoiceItems.add({
            invoiceId,
            type: 'addon',
            description: ADDON_OPTIONS[code],
            quantity: count,
            unitPrice: ADDON_PRICES[code],
            amount: count * ADDON_PRICES[code]
        });
    }
}

// Recalculate totals
async function recalculateInvoiceTotals(invoiceId, cust) {
    const items = await db.invoiceItems.where({invoiceId}).toArray();
    const adjustments = await db.invoiceAdjustments.where({invoiceId}).toArray();
    const payments = await db.payments.where({invoiceId}).toArray();
    
    const subTotal = items.reduce((sum, item) => sum + item.amount, 0);
    const discountAmount = subTotal * ((cust.discount || 0) / 100);
    const adjustmentsTotal = adjustments.reduce((sum, adj) => 
        sum + (adj.type === 'credit' ? -adj.amount : adj.amount), 0);
    
    const total = subTotal - discountAmount + adjustmentsTotal;
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = Math.max(0, total - totalPaid);
    
    let status = 'draft';
    if (balanceDue <= 0 && totalPaid > 0) status = 'paid';
    else if (totalPaid > 0) status = 'partial';
    else {
        const inv = await db.invoices.get(invoiceId);
        if (inv.sentAt) status = 'sent';
    }
    
    await db.invoices.update(invoiceId, {
        subTotal,
        discountAmount,
        adjustmentsTotal,
        total: Math.round(total),
        balanceDue: Math.round(balanceDue),
        status
    });
}

// CRUD Operations
async function addAdjustment(invoiceId, type, description, amount) {
    await db.invoiceAdjustments.add({ invoiceId, type, description, amount });
    const invoice = await db.invoices.get(invoiceId);
    const cust = await db.customers.get(invoice.custId);
    await recalculateInvoiceTotals(invoiceId, cust);
}

async function recordPayment(invoiceId, amount, method, notes) {
    await db.payments.add({
        invoiceId,
        amount,
        date: new Date().toISOString().split('T')[0],
        method,
        notes
    });
    const invoice = await db.invoices.get(invoiceId);
    const cust = await db.customers.get(invoice.custId);
    await recalculateInvoiceTotals(invoiceId, cust);
}

async function updateInvoiceItem(itemId, updates) {
    await db.invoiceItems.update(itemId, updates);
    const item = await db.invoiceItems.get(itemId);
    const invoice = await db.invoices.get(item.invoiceId);
    const cust = await db.customers.get(invoice.custId);
    await recalculateInvoiceTotals(item.invoiceId, cust);
}

async function deleteInvoiceItem(itemId) {
    const item = await db.invoiceItems.get(itemId);
    await db.invoiceItems.delete(itemId);
    const invoice = await db.invoices.get(item.invoiceId);
    const cust = await db.customers.get(invoice.custId);
    await recalculateInvoiceTotals(item.invoiceId, cust);
}

async function markInvoiceSent(invoiceId) {
    await db.invoices.update(invoiceId, {
        status: 'sent',
        sentAt: new Date().toISOString()
    });
}

// Generate all invoices for month
async function generateAllInvoicesForMonth() {
    const picker = document.getElementById('invoiceMonthPicker');
    const monthYear = picker.value;
    
    // Check if invoices already exist for this month
    const existingInvoices = await db.invoices.where('monthYear').equals(monthYear).toArray();
    const existingCount = existingInvoices.length;
    
    if (existingCount > 0) {
        const confirm = window.confirm(`${existingCount} invoice(s) already exist for this month. Regenerate?`);
        if (!confirm) return;
        await deleteMonthInvoices(monthYear);
    }
    
    // Generate fresh invoices
    const customers = await db.customers.where('status').notEqual('inactive').toArray();
    
    // Pre-generate all invoice numbers FIRST to ensure uniqueness
    const prefix = `INV-${monthYear}-`;
    const allInvoices = await db.invoices.toArray();
    const monthInvoices = allInvoices.filter(inv => inv.invoiceNumber.startsWith(prefix));
    const maxNum = monthInvoices.reduce((max, inv) => {
        const num = parseInt(inv.invoiceNumber.split('-')[2]);
        return num > max ? num : max;
    }, 0);
    
    // Create array of invoice numbers for all customers
    const invoiceNumbers = {};
    for (let i = 0; i < customers.length; i++) {
        invoiceNumbers[customers[i].id] = `${prefix}${String(maxNum + i + 1).padStart(4, '0')}`;
    }
    
    // Now create invoices with pre-generated numbers
    let generated = 0;
    for (const cust of customers) {
        const invoiceId = await generateInvoice(cust.id, monthYear, invoiceNumbers[cust.id]);
        if (invoiceId) generated++;
    }
    
    alert(`Generated ${generated} invoices`);
    renderInvoices();
    return generated;
}

// Delete all invoices for a month (for regeneration)
async function deleteMonthInvoices(monthYear) {
    const monthInvoices = await db.invoices.where('monthYear').equals(monthYear).toArray();
    
    for (const invoice of monthInvoices) {
        await db.payments.where('invoiceId').equals(invoice.id).delete();
        await db.invoiceAdjustments.where('invoiceId').equals(invoice.id).delete();
        await db.invoiceItems.where('invoiceId').equals(invoice.id).delete();
        await db.invoices.delete(invoice.id);
    }
}

// Initialize invoice month picker to last generated month
async function initializeInvoiceMonthPicker() {
    const picker = document.getElementById('invoiceMonthPicker');
    if (!picker) return;
    
    // Get the most recent invoice
    const allInvoices = await db.invoices.orderBy('generatedAt').reverse().limit(1).toArray();
    
    if (allInvoices.length > 0) {
        picker.value = allInvoices[0].monthYear;
    } else {
        picker.value = new Date().toISOString().slice(0, 7);
    }
    
    renderInvoices();
}

// PDF Generation with QR
async function generateInvoicePDF(invoiceId) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const invoice = await db.invoices.get(invoiceId);
    const cust = await db.customers.get(invoice.custId);
    const items = await db.invoiceItems.where({invoiceId}).toArray();
    const adjustments = await db.invoiceAdjustments.where({invoiceId}).toArray();
    const monthName = new Date(invoice.monthYear + '-01').toLocaleString('default', { month: 'long' });
    const year = invoice.monthYear.split('-')[0];
    
    // Calculate in paise to avoid floating-point errors
    const itemsTotalPaise = Math.round(invoice.subTotal * 100);
    const discountPaise = Math.round(invoice.discountAmount * 100);
    const adjustmentsPaise = adjustments.reduce((sum, adj) => {
        return sum + (adj.type === 'credit' ? -adj.amount : adj.amount) * 100;
    }, 0);
    
    const subtotalAfterPaise = itemsTotalPaise - discountPaise + adjustmentsPaise;
    const roundedAmountPaise = Math.round(subtotalAfterPaise / 100) * 100;
    const roundOffPaise = roundedAmountPaise - subtotalAfterPaise;
    const roundedTotal = roundedAmountPaise / 100;
    
    const upiLink = `upi://pay?pa=9346379970@ibl&pn=GrabbAGreen&am=${Math.round(roundedTotal)}&tn=${invoice.invoiceNumber}&cu=INR`;
    const qrDiv = document.createElement('div');
    new QRCode(qrDiv, { text: upiLink, width: 80, height: 80 });
    const qrCanvas = qrDiv.querySelector('canvas');
    const qrDataUrl = qrCanvas.toDataURL('image/png');
    
    doc.setFillColor(246, 247, 241);
    doc.rect(0, 0, 210, 297, 'F');
    
    // HEADER with Logo
    try { 
        doc.addImage('data:image/jpeg;base64,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', 'JPEG',  15, 15, 70, 30);
    } catch(e) { console.log('Logo load failed', e); }
    
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(8);
    doc.text("9346379970, 9121448100", 50, 50);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", 150, 30);
    doc.setFontSize(10);
    doc.text(`#${invoice.invoiceNumber}`, 150, 38);
    doc.text(`Date: ${new Date(invoice.generatedAt).toLocaleDateString('en-IN')}`, 150, 43);
    doc.text(`Billing: ${monthName} ${year}`, 150, 48);
    doc.text(`To,`, 15, 60);
    doc.setFontSize(14);
    doc.text(cust.name, 15, 68);
    
    const tableBody = items.map(item => [
        item.description,
        item.quantity,
        `Rs. ${formatINR(item.unitPrice)}`,
        `Rs. ${formatINR(item.amount)}`
    ]);
    
    // Table: Line Items Total → Discount → Adjustments → Sub Total → Round Off → Grand Total
    
    // Add Total (sum of line items)
    const lineItemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
    tableBody.push(['', '', 'Total', `Rs. ${formatINR(lineItemsTotal)}`]);
    
    // Add discount
    tableBody.push(['', '', 'Discount', `-Rs. ${formatINR(invoice.discountAmount)}`]);
    
    // Add adjustments
    adjustments.forEach(adj => {
        tableBody.push([
            '',
            '',
            `${adj.type === 'credit' ? 'Credit' : 'Charge'}: ${adj.description}`,
            `${adj.type === 'credit' ? '-' : '+'}Rs. ${formatINR(adj.amount)}`
        ]);
    });
    
    // Add subtotal after items, discount, adjustments
    const subtotalAfter = subtotalAfterPaise / 100;
    tableBody.push(['', '', 'Sub Total', `Rs. ${formatINR(subtotalAfter)}`]);
    
    // Add round off
    const roundOff = (roundedAmountPaise - subtotalAfterPaise) / 100;
    if (roundOff !== 0) {
        tableBody.push(['', '', 'Round Off', `Rs. ${formatINR(roundOff)}`]);
    }
    
    // Grand Total
    tableBody.push(['', '', 'Grand Total', `Rs. ${formatINR(roundedTotal)}`]);
    
    if (invoice.balanceDue <= 0 && roundedTotal > 0) {
        tableBody.push(['', '', 'PAID ✓', '']);
    }
    
    doc.autoTable({
        startY: 80,
        head: [['Product', 'Qty', 'Price', 'Total']],
        body: tableBody,
        headStyles: { fillColor: [21, 128, 61], halign: 'center' },
        columnStyles: { 
            0: { halign: 'left' },   // Product
            1: { halign: 'right' },  // Qty
            2: { halign: 'right' },  // Price
            3: { halign: 'right' }   // Total
        },
        theme: 'grid',
        styles: { 
            fontStyle: 'bold',
            overflow: 'linebreak'
        },
        tableWidth: 'auto'
    });
    
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.addImage(qrDataUrl, 'PNG', 15, finalY, 25, 25);
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text("Scan to pay via UPI", 45, finalY + 2);
    
    // PhonePe text (not clickable)
    doc.text("Or PhonePe: 9346379970", 45, finalY + 9);
    
    // Clickable Payment Link with underline
    const paymentLink = `upi://pay?pa=9346379970@ibl&pn=GrabbAGreen&am=${roundedTotal}&tn=${invoice.invoiceNumber}&cu=INR`;
    
    doc.text(`Or Payment Link: `, 45, finalY + 16);
    doc.setTextColor(0, 102, 204);
    doc.textWithLink("Click Here to Pay Now", 75, finalY + 16, { url: paymentLink });
    
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(16);
    doc.text(`Total Amount: Rs. ${formatINR(roundedTotal)}`, 45, finalY + 24);
    
    const thankYouY = finalY + 40;
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(21, 128, 61);
    doc.text("Thank you for choosing us for your healthy journey!", 105, thankYouY, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Eat Green, Feel Great.", 105, thankYouY + 5, { align: "center" });
    
    return doc;
}

// Helper function to build invoice message
async function buildInvoiceMessage(invoiceId) {
    const invoice = await db.invoices.get(invoiceId);
    const cust = await db.customers.get(invoice.custId);
    const adjustments = await db.invoiceAdjustments.where({invoiceId}).toArray();
    const monthName = new Date(invoice.monthYear + '-01').toLocaleString('default', { month: 'long' });
    const year = invoice.monthYear.split('-')[0];
    
    const itemsTotalPaise = Math.round(invoice.subTotal * 100);
    const discountPaise = Math.round(invoice.discountAmount * 100);
    const adjustmentsPaise = adjustments.reduce((sum, adj) => {
        return sum + (adj.type === 'credit' ? -adj.amount : adj.amount) * 100;
    }, 0);
    const subtotalAfterPaise = itemsTotalPaise - discountPaise + adjustmentsPaise;
    const roundedAmountPaise = Math.round(subtotalAfterPaise / 100) * 100;
    const roundedTotal = roundedAmountPaise / 100;
    
    return `Hi ${cust.nickname || cust.name},

Your invoice #${invoice.invoiceNumber} for ${monthName} ${year}
Total: Rs. ${formatINR(roundedTotal)}

💳 Pay here: upi://pay?pa=9346379970@ibl&pn=GrabbAGreen&am=${Math.round(roundedTotal)}&tn=${invoice.invoiceNumber}&cu=INR

PDF attached. Thank you!`;
}

// Share Text via WhatsApp
async function shareInvoiceText(invoiceId) {
    const message = await buildInvoiceMessage(invoiceId);
    
    // Try native share first (works on mobile Safari/Chrome), fallback to wa.me redirect
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Invoice',
                text: message
            });
            await db.invoices.update(invoiceId, { textShared: true });
            
            const invoice = await db.invoices.get(invoiceId);
            if (invoice.pdfShared) {
                await markInvoiceSent(invoiceId);
            }
            
            openInvoiceDetail(invoiceId);
            return;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.log('Share cancelled or failed:', err);
            }
        }
    }
    
    // Fallback: Use wa.me redirect (works on all browsers)
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.location.assign(whatsappUrl);
    
    await db.invoices.update(invoiceId, { textShared: true });
    
    const invoice = await db.invoices.get(invoiceId);
    if (invoice.pdfShared) {
        await markInvoiceSent(invoiceId);
    }
    
    openInvoiceDetail(invoiceId);
}

// Share PDF via Native Share
async function shareInvoicePDF(invoiceId) {
    const doc = await generateInvoicePDF(invoiceId);
    const pdfBlob = doc.output('blob');
    const invoice = await db.invoices.get(invoiceId);
    const cust = await db.customers.get(invoice.custId);
    const customerName = cust.name || cust.nickname;
    const fileName = `${customerName}_Invoice_${invoice.invoiceNumber}.pdf`;
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: `Invoice ${invoice.invoiceNumber}` });
            await db.invoices.update(invoiceId, { pdfShared: true });
            
            const updatedInvoice = await db.invoices.get(invoiceId);
            if (updatedInvoice.textShared) {
                await markInvoiceSent(invoiceId);
            }
        } catch (err) {
            console.log('PDF share cancelled or failed');
        }
    } else {
        doc.save(fileName);
    }
    
    openInvoiceDetail(invoiceId);
}

// Legacy function - now shows dropdown
async function shareInvoiceViaWhatsApp(invoiceId) {
    // This function is kept for backward compatibility
    // The UI now calls shareInvoiceText or shareInvoicePDF directly
}

// UI Render Functions
async function renderInvoices() {
    const container = document.getElementById('invoiceListContainer');
    const picker = document.getElementById('invoiceMonthPicker');
    const monthYear = picker.value || new Date().toISOString().slice(0, 7);
    
    if (!container) return;
    
    container.innerHTML = '<p class="text-center text-gray-400 py-10">Loading...</p>';
    
    const invoices = await db.invoices.where('monthYear').equals(monthYear).toArray();
    const customers = await db.customers.toArray();
    const custMap = new Map(customers.map(c => [c.id, c]));
    
    const filter = currentInvoiceFilter || 'all';
    const filteredInvoices = filter === 'all' ? invoices : invoices.filter(inv => inv.status === filter);
    
    let totalInvoiced = 0, totalCollected = 0, totalPending = 0;
    invoices.forEach(inv => {
        totalInvoiced += inv.total;
        totalCollected += (inv.total - inv.balanceDue);
        totalPending += inv.balanceDue;
    });
    
    document.getElementById('totalInvoiced').textContent = totalInvoiced.toLocaleString('en-IN');
    document.getElementById('totalCollected').textContent = totalCollected.toLocaleString('en-IN');
    document.getElementById('totalPending').textContent = totalPending.toLocaleString('en-IN');
    
    container.innerHTML = '';
    filteredInvoices.forEach(inv => {
        const cust = custMap.get(inv.custId);
        const statusColor = INVOICE_STATUS_COLORS[inv.status];
        
        const card = document.createElement('div');
        card.className = `bg-white p-4 rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer`;
        card.onclick = () => openInvoiceDetail(inv.id);
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h3 class="font-black text-gray-800 text-sm">${cust.nickname || cust.name}</h3>
                    <p class="text-[10px] text-gray-400 font-bold">${inv.invoiceNumber}</p>
                </div>
                <span class="px-2 py-1 rounded-full text-[10px] font-bold ${statusColor}">
                    ${inv.status === 'partial' ? 'Partial' : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
            </div>
            <div class="flex justify-between items-center">
                <p class="text-xs text-gray-500">
                    Balance: Rs. ${formatINR(inv.balanceDue)}
                </p>
                <p class="text-lg font-black text-green-700">Rs. ${formatINR(Math.round(inv.total))}</p>
            </div>
        `;
        container.appendChild(card);
    });
    
    if (filteredInvoices.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-10">No invoices found. Click Generate Invoices.</p>';
    }
}

async function openInvoiceDetail(invoiceId) {
    currentInvoiceId = invoiceId;
    const invoice = await db.invoices.get(invoiceId);
    const cust = await db.customers.get(invoice.custId);
    const items = await db.invoiceItems.where({invoiceId}).toArray();
    const adjustments = await db.invoiceAdjustments.where({invoiceId}).toArray();
    const payments = await db.payments.where({invoiceId}).toArray();
    
    document.getElementById('detailInvoiceNumber').textContent = invoice.invoiceNumber;
    document.getElementById('detailInvoiceDate').textContent = new Date(invoice.generatedAt).toLocaleDateString();
    document.getElementById('detailInvoiceStatus').textContent = invoice.status.toUpperCase();
    document.getElementById('detailInvoiceStatus').className = `px-3 py-1 rounded-full text-xs font-bold ${INVOICE_STATUS_COLORS[invoice.status]}`;
    document.getElementById('detailCustomerName').textContent = cust.nickname || cust.name;
    document.getElementById('detailCustomerPlan').textContent = cust.plan;
    
    const itemsContainer = document.getElementById('detailLineItems');
    itemsContainer.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center py-2 border-b border-gray-100';
        div.innerHTML = `
            <div>
                <p class="font-bold text-sm">${item.description}</p>
                <p class="text-xs text-gray-400">${item.quantity} × Rs. ${formatINR(item.unitPrice)}</p>
            </div>
            <p class="font-bold">Rs. ${formatINR(item.amount)}</p>
        `;
        itemsContainer.appendChild(div);
    });
    
    const adjContainer = document.getElementById('detailAdjustments');
    adjContainer.innerHTML = '';
    adjustments.forEach(adj => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center py-2 border-b border-gray-100';
        div.innerHTML = `
            <div>
                <p class="font-bold text-sm ${adj.type === 'credit' ? 'text-green-600' : 'text-red-600'}">
                    ${adj.type === 'credit' ? 'Credit' : 'Charge'}: ${adj.description}
                </p>
            </div>
            <p class="font-bold ${adj.type === 'credit' ? 'text-green-600' : 'text-red-600'}">
                ${adj.type === 'credit' ? '-' : '+'}Rs. ${formatINR(adj.amount)}
            </p>
        `;
        adjContainer.appendChild(div);
    });
    
    // Calculate using paise method (same as PDF)
    const itemsTotalPaise = Math.round(invoice.subTotal * 100);
    const discountPaise = Math.round(invoice.discountAmount * 100);
    const adjustmentsPaise = adjustments.reduce((sum, adj) => {
        return sum + (adj.type === 'credit' ? -adj.amount : adj.amount) * 100;
    }, 0);
    const subtotalAfterPaise = itemsTotalPaise - discountPaise + adjustmentsPaise;
    const roundedAmountPaise = Math.round(subtotalAfterPaise / 100) * 100;
    const roundedTotal = roundedAmountPaise / 100;
    const balanceDuePaise = roundedAmountPaise - (payments.reduce((sum, p) => sum + p.amount, 0) * 100);
    const balanceDue = balanceDuePaise / 100;
    
    document.getElementById('detailSubtotal').textContent = `Rs. ${formatINR(subtotalAfterPaise / 100)}`;
    document.getElementById('detailDiscount').textContent = `-Rs. ${formatINR(invoice.discountAmount)}`;
    document.getElementById('detailTotal').textContent = `Rs. ${formatINR(roundedTotal)}`;
    document.getElementById('detailBalance').textContent = `Rs. ${formatINR(Math.max(0, balanceDue))}`;
    
    const paymentsContainer = document.getElementById('detailPayments');
    paymentsContainer.innerHTML = '';
    payments.forEach(payment => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center py-2 border-b border-gray-100';
        div.innerHTML = `
            <div>
                <p class="font-bold text-sm">Rs. ${formatINR(payment.amount)} - ${payment.method}</p>
                <p class="text-xs text-gray-400">${payment.date}</p>
            </div>
        `;
        paymentsContainer.appendChild(div);
    });
    
    const markSentBtn = document.getElementById('markSentBtn');
    if (invoice.status === 'draft') {
        markSentBtn.style.display = 'block';
    } else {
        markSentBtn.style.display = 'none';
    }
    
    document.getElementById('invoiceDetailModal').classList.remove('hidden');
    updateShareCheckmarks();
}

function closeInvoiceDetailModal() {
    document.getElementById('invoiceDetailModal').classList.add('hidden');
    currentInvoiceId = null;
    renderInvoices();
}

function filterInvoices(status) {
    currentInvoiceFilter = status;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.className = 'filter-btn px-4 py-2 rounded-full text-xs font-bold bg-gray-100 text-gray-600';
    });
    event.target.className = 'filter-btn px-4 py-2 rounded-full text-xs font-bold bg-gray-800 text-white';
    
    renderInvoices();
}

function showAddAdjustmentModal() {
    document.getElementById('addAdjustmentModal').classList.remove('hidden');
}

function closeAddAdjustmentModal() {
    document.getElementById('addAdjustmentModal').classList.add('hidden');
    document.getElementById('adjDescription').value = '';
    document.getElementById('adjAmount').value = '';
}

async function saveAdjustment() {
    const type = document.querySelector('input[name="adjType"]:checked').value;
    const description = document.getElementById('adjDescription').value;
    const amount = parseFloat(document.getElementById('adjAmount').value);
    
    if (!description || !amount) {
        alert('Please fill all fields');
        return;
    }
    
    await addAdjustment(currentInvoiceId, type, description, amount);
    closeAddAdjustmentModal();
    openInvoiceDetail(currentInvoiceId);
}

async function showRecordPaymentModal() {
    const invoice = await db.invoices.get(currentInvoiceId);
    document.getElementById('paymentAmount').value = invoice.balanceDue;
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('recordPaymentModal').classList.remove('hidden');
}

function closeRecordPaymentModal() {
    document.getElementById('recordPaymentModal').classList.add('hidden');
}

async function savePayment() {
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const date = document.getElementById('paymentDate').value;
    const method = document.getElementById('paymentMethod').value;
    const notes = document.getElementById('paymentNotes').value;
    
    if (!amount || !date) {
        alert('Please fill required fields');
        return;
    }
    
    await recordPayment(currentInvoiceId, amount, method, notes);
    closeRecordPaymentModal();
    openInvoiceDetail(currentInvoiceId);
}

async function markCurrentInvoiceSent() {
    await markInvoiceSent(currentInvoiceId);
    openInvoiceDetail(currentInvoiceId);
}

function toggleShareDropdown() {
    const dropdown = document.getElementById('shareDropdown');
    dropdown.classList.toggle('hidden');
    
    if (!dropdown.classList.contains('hidden')) {
        updateShareCheckmarks();
    }
}

async function updateShareCheckmarks() {
    if (!currentInvoiceId) return;
    
    const invoice = await db.invoices.get(currentInvoiceId);
    const textCheck = document.getElementById('textSharedCheck');
    const pdfCheck = document.getElementById('pdfSharedCheck');
    
    if (invoice.textShared) {
        textCheck.classList.remove('hidden');
    } else {
        textCheck.classList.add('hidden');
    }
    
    if (invoice.pdfShared) {
        pdfCheck.classList.remove('hidden');
    } else {
        pdfCheck.classList.add('hidden');
    }
}

async function handleShareOption(option) {
    document.getElementById('shareDropdown').classList.add('hidden');
    
    if (option === 'text') {
        await shareInvoiceText(currentInvoiceId);
    } else if (option === 'pdf') {
        await shareInvoicePDF(currentInvoiceId);
    }
}

// Legacy function - no longer used
async function shareCurrentInvoice() {
    await shareInvoiceText(currentInvoiceId);
}

async function calculateWorkingDays(monthYear) {
    const holidayData = await db.settings.get('holidayList');
    const holidays = holidayData ? holidayData.value : [];
    const [year, month] = monthYear.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthYear}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        if (dayOfWeek !== 0 && !holidays.includes(dateStr)) workingDays++;
    }
    return workingDays;
}
