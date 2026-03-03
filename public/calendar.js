// calendar.js - Calendar view for customer attendance

let currentDisplayDate = new Date();

async function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthYear');
    const customerSelector = document.getElementById('calendarCustomerSelector');

    if (!customerSelector) return;
    currentCalendarCustomer = customerSelector.value;
    const customerId = isNaN(customerSelector.value) ? customerSelector.value : Number(customerSelector.value);

    grid.innerHTML = '';
    const year = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 1. Update Month/Year Header
    if (label) {
        label.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDisplayDate);
    }
    // 2. Fetch Data: Attendance + Holiday List from Settings
    const [attendanceRecords, holidayData] = await Promise.all([
        db.attendance.where('custId').equals(customerId).filter(r => r.date.startsWith(monthPrefix)).toArray(),
        db.settings.get('holidayList')
    ]);
    const dynamicHolidays = holidayData ? holidayData.value : [];

    // 3. Map Attendance for lookup
    const dayMap = {};
    attendanceRecords.forEach(rec => {
        // 1. Extract day from date string 'YYYY-MM-DD'
        const day = parseInt(rec.date.split('-')[2]);
        // 2. Add-on Logic: Check if the 'extraAddons' field exists and has content
        // This handles both arrays and simple truthy checks
        const hasAddon = Array.isArray(rec.extraAddons)
            ? rec.extraAddons.length > 0
            : !!rec.extraAddons;

        // 3. Status Logic: Priority to Vacation, then the saved status
        let finalStatus = rec.status;
        if (rec.isVacation) {
            finalStatus = 'Skipped';
        }
        // 4. Map to object for the loop
        dayMap[day] = {
            status: finalStatus, // 'delivered' or 'skipped'
            hasAddon: hasAddon
        };
    });

    // 4. Grid Generation
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
    
    for (let i = 0; i < offset; i++) grid.innerHTML += `<div></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = dateObj.getDay();

        const data = dayMap[day];
        const isToday = new Date().toDateString() === dateObj.toDateString();
        const isSunday = dayOfWeek === 0;
        const isHoliday = dynamicHolidays.includes(dateStr);
        // --- COLOR LOGIC ---
        let bgColor = "bg-white";
        let textColor = "text-gray-600";
        let dotsHtml = "";

        // Background Priority: Holiday (Cyan) > Sunday (Amber)
        if (isHoliday) {
            bgColor = "bg-cyan-100";
            textColor = "text-cyan-800";
        } else if (isSunday) {
            bgColor = "bg-amber-100";
            textColor = "text-amber-800";
        }

        if (data) {

            // Apply Status Backgrounds only if it's a "normal" day
            if (data.status === 'delivered') {
                if (!isSunday && !isHoliday) bgColor = "bg-green-50";
                dotsHtml += '<div class="w-1.5 h-1.5 bg-green-500 rounded-full"></div>';
                textColor = "text-green-700 font-black";
            } else if (data.status.toLowerCase() === 'skipped') {
                if (!isSunday && !isHoliday) bgColor = "bg-red-50";
                dotsHtml += '<div class="w-1.5 h-1.5 bg-red-400 rounded-full"></div>';
                textColor = "text-red-700 font-black";
            }

            // Addon Dot (Blue)
            if (data.hasAddon) {
                dotsHtml += '<div class="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>';
            }
        }

        grid.innerHTML += `
            <div class="aspect-square ${bgColor} rounded-2xl border border-gray-100 flex flex-col items-center justify-center relative ${isToday ? 'ring-2 ring-blue-500 shadow-md z-10' : ''}">
                <span class="text-xs font-black ${textColor}">${day}</span>
                <div class="flex gap-0.5 mt-1">${dotsHtml}</div>
            </div>
        `;
    }
}

async function populateCalendarCustomerDropdown() {
    const selector = document.getElementById('calendarCustomerSelector');
    if (!selector) return;

    const year = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const customersWithRecords = await db.attendance
        .where('date')
        .startsWith(monthPrefix)
        .toArray();
    
    const customerIdsWithRecords = [...new Set(customersWithRecords.map(r => r.custId))];
    
    const allCustomers = await db.customers.toArray();

    let filteredCustomers = allCustomers.filter(c => {
        if (c.status !== 'inactive') return true;
        return customerIdsWithRecords.includes(c.id);
    });

    if (filteredCustomers.length === 0) {
        filteredCustomers = allCustomers.filter(c => c.status !== 'inactive');
    }

    selector.innerHTML = filteredCustomers.map(c =>
        `<option value="${c.id}">${c.name}</option>`
    ).join('');
}

async function changeMonth(step) {
    currentDisplayDate.setMonth(currentDisplayDate.getMonth() + step);
    await populateCalendarCustomerDropdown();
    renderCalendar();
}
