# Attendance & Addon Management System Requirements

## Overview
The system manages daily attendance tracking with intelligent addon management based on customer packages and preferences.

---

## Customer Packages

### Package Types
1. **Regular (R)** - ₹4,999/month
   - Inclusions: S1 (one salad daily)
   - Free addons: None

2. **Premium (P)** - ₹6,499/month
   - Inclusions: S1 (one salad) + 1 free addon daily
   - Free addons: 1 per day

3. **Couple (CP)** - ₹8,999/month
   - Inclusions: S1 (swappable with S2) × 2 + C (swappable) per person
   - Free addons: 2 per month total

4. **MealBox (M)** - ₹7,800/month
   - Inclusions: M1 (meal box)
   - Free addons: None

**Note:** Subscription is monthly (~26 days, excluding Sundays)

---

## Addon Types & Pricing

### Non-Veg Addons
- **C** - Grilled Chicken: ₹100
- **PR** - Grilled Prawns: ₹140
- **F** - Grilled Fish: ₹110
- **SE** - Scrambled Eggs: ₹50
- **BE** - Boiled Eggs: ₹40

### Veg Addons
- **P** - Grilled Paneer: ₹90
- **T** - Grilled Tofu: ₹90
- **A** - Avocado: ₹60
- **V** - Mix Veggies: ₹60
- **S** - Extra Salad if Requested: ₹200 Retail price

---

## Card UI Design

### Layout (80/20 split)
```
[80% Content Area]                [20% Action]
┌─────────────────────────────────┬─────┐
│ A | CustomerName        [R]     │     │  ← Route, Name, Package Badge, Add Button
│ Inc: S1 (C)                     │  +  │  ← Inclusions (swappable Addons with click, swap between S1 to S2 for only Couple Package customer)
│ Add: C F                        │     │  ← Extra Addons (removable on click with confirmation)
└─────────────────────────────────┴─────┘
```

### Content Area (80%)
1. **Line 1:** Route Letter | Customer Name | Package Badge
   - Route: A, B, C, etc.
   - Name: Customer nickname (prominent)
   - Badge: R (Regular), P (Premium), CP (Couple), M (MealBox)

2. **Line 2:** Inclusions
   - Shows package-included items
   - Swappable items marked with (s) indicator
   - Tap to initiate swap

3. **Line 3:** Extra Addons
   - Label "Extra Addons:" always appears for unlocked (unmarked) cards before + button
   - For locked (delivered/skipped) cards: label only shows if there are extra addons
   - Customer-requested addons displayed as removable buttons
   - Tap to remove addon (with confirmation dialog)
   - + button (purple) appears when less than 5 addons and card is unlocked
    - Extra addons saved to DB when marking delivered
    - Extra addons retrieved from DB when loading marked cards

### Marked Card Behavior
- All card buttons (Inclusion, Addon, Extra Addons) have onclick removed (no click functionality)
- + button is hidden
- Long press opens menu with limited options
- Edit Profile button is hidden
- Set Vacation button is hidden
- Reset Attendance button available (to fix mistakes)
- Resume Early button available (for vacation cards)

### Action Area (20%)
- Large **+** button
- Tap to open addon selection grid
- Shows available addons for the day

---

## Interactions

### Add Addon
1. Tap **+** button on card
2. Popup grid appears with available addons for the day
3. Select addon → Letter added to Line 3 (Extra Addons)
4. Multiple same addons possible (e.g., "C C F")

### Remove Addon
- Tap addon letter in **Line 3** → Addon removed ask for the confirmation

### Swap Inclusion
- Tap addon letter in **Line 2** → Swap dialog appears
- Customer can swap (e.g., S1 ↔ S2, C ↔ other addon)

---

## Chef Logic

### Daily Addon Rotation
1. Chef decides variety and quantities based on **Premium customer count**
2. Addons automatically rotated to each customer based on:
   - Historical addon data
   - Previous day's assignment
   - Customer preferences

### Addon Assignment Strategy
- **Rotation ensures variety** for regular customers
- **Chef capacity** determines daily addon mix available
- **Manual swap** available on customer request

---

## Data Structure Considerations

### Customer Record should include:
- Customer ID, Name, Route
- Package Type (R/P/CP/M)
- Subscription Start Date
- Package Inclusions (items included with package)
- Free Addon Count (remaining for month)
- Addon History (for rotation logic)

### Daily Attendance Record should include:
- Customer ID
- Date
- Status (delivered/skipped)
- Addons Provided
- Addon Cost (if paid addon)
- Whether addon used free quota or charged

---

## Implementation Status

### ✅ Completed Features
1. **Package Structure** - R, P, CP, M packages with correct pricing and inclusions
2. **Addon System** - All 10 addon types with proper categorization and pricing
3. **80/20 Card Layout** - Route | Name | Package Badge (Line 1), Inclusions (Line 2), Extra Addons (Line 3), + Button (20%)
4. **Package Badge Display** - Single letter badges (R, P, CP, M) positioned in first row to the right of name using justify-between, made prominent with larger size (text-sm, px-3 py-2, border-2, min-w-[3rem]) without shadow while maintaining correct colors: R (gray), P (amber), CP (green), M (blue)
5. **Addon Button Styling** - + button made perfectly round with equal width/height (90px x 90px), rounded-full, includes shadow-lg and active:scale-95 for feedback, centered content with flex
6. **Premium Default Addon** - Premium (P) customers automatically get default addon 'C' (Chicken) displayed on Inc line (Line 2) as part of package inclusions, added automatically when packageInclusions only has S1
7. **Addon Selection Grid** - Interactive popup with addon types, names, and prices
8. **Swap Functionality** - S1↔S2 for Couple, C↔other addons with (s) indicators
9. **Tap to Remove** - Extra addons clickable with confirmation dialog
10. **Vacation in Long Press Menu** - Moved from card to action menu for cleaner UI
11. **Free Addon Logic** - Premium: 1 free daily, Couple: 2 free monthly
12. **Charging Logic** - Automatic charging when free quota exceeded
13. **Chef Rotation** - Daily addon assignment based on Premium customer count
14. **Database Schema** - Enhanced tracking for addon history, costs, subscriptions
15. **2nd Line Addon Persistence** - Premium addon, coupleAddon1, coupleAddon2, and extraAddons now persist after marking delivered/skipped by reading from saved attendance record when card is locked

### 🔧 Technical Implementation
- Database updated to v10 with comprehensive addon tracking
- Customer cards match Test.html.bkp design exactly
- Long press menu includes: Edit Profile, Set Vacation, Reset Attendance
- Addon cost calculation with free quota management
- Subscription start date tracking
- Package inclusions properly displayed with swappable indicators

### 📋 Free Addon Logic for Couple Customers

| Monthly Used | Unlocked Card Display | Locked Card Display |
|--------------|---------------------|---------------------|
| 0 (2 free) | Addon: - - | Addon: C (what was delivered) |
| 1 (1 free left) | Addon: - | (nothing) |
| 2 (none free) | (nothing shown) | Addon: C F (what was delivered) |

- **Count = 0:** No free addons used this month - both addon slots visible with "- -"
- **Count = 1:** One addon already used this month - shows single slot with "-"
- **Count = 2:** Both free addons used this month - addon labels hidden entirely
- **Locked cards:** Always show only selected addons from today's record (never show dashes)
- Logic automatically counts used addons from attendance records for current calendar month

---

## UI Reference
See `Test.html.bkp` for card design template


---


## Invoice Management System

### Overview
Professional invoice generation with payment tracking, manual adjustments, and WhatsApp sharing with UPI payment links.

---

### Invoice Features

#### 1. Invoice Generation
- **Generate Invoices** - Creates invoices from attendance data for selected month
- **Auto-calculation** - Line items (salads, addons), discounts, adjustments, totals
- **Regeneration** - Confirms before replacing existing invoices (for attendance changes)
- **Month Selector** - Defaults to last generated month

#### 2. Invoice Numbering
- Format: `INV-YYYYMM-0001`
- Sequential numbering per month
- Auto-increments within each month

#### 3. Line Items
- **Salad bowls** - Calculated from delivered attendance
- **Extra addons** - Grouped by type with individual pricing
- **Free addons excluded** - Only paid addons shown

#### 4. Pricing
| Addon | Price |
|-------|-------|
| C (Grilled Chicken) | ₹100 |
| PR (Grilled Prawns) | ₹140 |
| F (Grilled Fish) | ₹110 |
| SE (Scrambled Eggs) | ₹50 |
| BE (Boiled Eggs) | ₹40 |
| P (Grilled Paneer) | ₹90 |
| T (Grilled Tofu) | ₹90 |
| A (Avocado) | ₹60 |
| V (Mix Veggies) | ₹60 |
| S (Extra Salad) | ₹200 |

#### 5. Adjustments
- **Credit** - Discounts, refunds, credits (shown in green, subtracts from total)
- **Charge** - Late fees, delivery charges (shown in red, adds to total)
- **Position** - After discount, before round off

#### 6. Calculations
- **Subtotal** - Sum of all line items
- **Discount** - Customer's default discount percentage
- **Round Off** - Auto-calculated to nearest rupee
- **Grand Total** - Final amount (rounded)

#### 7. Payment Tracking
- **Status Types** - Draft, Sent, Partial, Paid
- **Record Payments** - Amount, date, method, notes
- **Methods** - Cash, UPI, Google Pay, PhonePe, Bank Transfer, Other
- **Balance Due** - Auto-calculated from total - payments

#### 8. PDF Generation
- **Header** - Logo, invoice number, date, billing period, customer name
- **Table** - Product, Qty, Price, Total (right-aligned numbers)
- **Adjustments** - Credit/Charge with descriptions
- **Payment Section** - QR code (scan to pay UPI), PhonePe number, Payment Link (clickable)
- **Footer** - "Thank you" message

#### 9. UPI Payment Link
- Format: `upi://pay?pa=9346379970@ibl&pn=GrabbAGreen&am={amount}&tn={invoiceNumber}&cu=INR`
- Clickable in PDF (underlined blue text)
- Opens UPI app with pre-filled amount

#### 10. WhatsApp Sharing
- Native share API (mobile)
- PDF + message with UPI link
- Falls back to download if share cancelled

---

### Invoice Status Workflow
```
Draft → Mark as Sent → Sent
              ↓
         Record Payment
              ↓
         Partial/Paid
```

---

### Database Schema (v13)

```javascript
invoices: '++id, custId, monthYear, invoiceNumber, status, subTotal, discountAmount, adjustmentsTotal, total, balanceDue, generatedAt, sentAt, [custId+monthYear]'

invoiceItems: '++id, invoiceId, type, description, quantity, unitPrice, amount'

invoiceAdjustments: '++id, invoiceId, type, description, amount'

payments: '++id, invoiceId, amount, date, method, notes'
```

---

### Implementation Status

#### ✅ Completed Features
1. **Invoice Generation** - From attendance data with auto-calculation
2. **Regeneration** - Confirmation dialog before replacing
3. **Invoice Numbering** - INV-YYYYMM-0001 format
4. **Line Items** - Salads + grouped addons with individual prices
5. **Adjustments** - Credits and charges with descriptions
6. **Round Off** - Auto-calculated to nearest rupee
7. **Payment Recording** - Full payment tracking with methods
8. **Status Tracking** - Draft, Sent, Partial, Paid
9. **PDF Generation** - Professional layout with logo
10. **QR Code** - Scan to pay via UPI
11. **Clickable Payment Link** - Underlined hyperlink in PDF
12. **WhatsApp Sharing** - PDF + message with UPI link
13. **Indian Currency** - Format: Rs. 12,34,567.00
14. **Date Format** - DD/MM/YYYY

---

### Invoice UI Screens

#### Invoice List
```
┌─────────────────────────────────────────┐
│ 📅 January 2026              [Generate] │
├─────────────────────────────────────────┤
│ [All] [Draft] [Sent] [Paid]           │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🟢 Amit Kumar          ₹3,200  [⋯] │ │
│ │    INV-2026-001-0001  •  Paid ✓   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🟡 Sneha Reddy         ₹4,150  [⋯] │ │
│ │    INV-2026-001-0002  •  Balance 0 │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Total: ₹47,200  Collected: ₹32,000  Pending: ₹15,200 │
└─────────────────────────────────────────┘
```

#### Invoice Detail Modal
```
┌─────────────────────────────────────────┐
│ INV-2026-001-0001  [DRAFT]        [✕] │
│ Jan 15, 2026                         │
├─────────────────────────────────────────┤
│ Amit Kumar                            │
│ Premium                               │
├─────────────────────────────────────────┤
│ Line Items                             │
│ Salad bowls (Premium)    12 × Rs. 208.00  Rs. 2,496.00 │
│ Grilled Chicken (2)                   Rs.   200.00 │
│ Grilled Prawns (1)                    Rs.   140.00 │
├─────────────────────────────────────────┤
│ Subtotal                              Rs. 2,836.00 │
│ Discount (10%)                        -Rs.   283.60 │
│ Round Off                             -Rs.     0.40 │
│ Grand Total                           Rs. 2,552.00 │
│ PAID ✓                                        │
├─────────────────────────────────────────┤
│ Payments                               │
│ Jan 15 - UPI - Rs. 2,552.00            │
├─────────────────────────────────────────┤
│ [Mark as Sent]    [Share]              │
└─────────────────────────────────────────┘
```

---

### PDF Layout
```
┌─────────────────────────────────────────┐
│          [LOGO]                       │
│     Grabb A Green                     │
│     9346379970, 9121448100           │
├─────────────────────────────────────────┤
│ INVOICE                          #INV-2026-001-0001        │
│ Date: 15/01/2026                 Billing: January 2026    │
│ To,                                                     │
│ Amit Kumar                                               │
├─────────────────────────────────────────┬────────────────┤
│ Product              Qty    Price      Total             │
├─────────────────────────────────────────┼────────────────┤
│ Salad bowls (Premium) 12    Rs. 208    Rs. 2,496.00    │
│ Grilled Chicken        2     Rs. 100    Rs.   200.00    │
│ Grilled Prawns         1     Rs. 140    Rs.   140.00    │
│ Subtotal                            Rs. 2,836.00        │
│ Discount (10%)                      -Rs. 283.60         │
│ Round Off                           -Rs.   0.40         │
│ Grand Total                         Rs. 2,552.00        │
│ PAID ✓                                             │
├─────────────────────────────────────────┴────────────────┤
│ [QR CODE]   Scan to pay via UPI                            │
│           Or PhonePe: 9346379970                           │
│           Or Payment Link (clickable, underlined)            │
│           Total Amount: Rs. 2,552.00                        │
├─────────────────────────────────────────┤
│     Thank you for choosing us for your     │
│           healthy journey!                  │
│           Eat Green, Feel Great.            │
└─────────────────────────────────────────┘
```
