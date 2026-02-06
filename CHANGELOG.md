# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-02-06

### Added

#### Package Filter System (2026-02-06)
- **Filter Pills in Walk-in Section**: Added 5 filter pills (All, R, P, CP, M) to filter customers by package type
  - Real-time marked/total count display (e.g., "R 5/12")
  - Checkmark indicator (✓) when all customers of a package are marked
  - Color-coded pills matching card badge colors:
    - All: Dark gray
    - R (Regular): Emerald green
    - P (Premium): Amber
    - CP (Couple): Green
    - M (MealBox): Sky blue
  - Inactive customers hidden when filtering by package
  - Click to filter, click again to return to "All"

#### Daily Addon Selection System (2026-02-05)
- **Chef-controlled addon rotation system**:
  - Settings toggle to enforce daily addon selection (default: OFF)
  - Full-screen modal forcing chef to select addon types before viewing main page
  - Supports 1, 3, or 6 addon selections (flexible, not restricted)
  - Yesterday's addons pre-selected when available
  - Falls back to random 3 if no previous selection
  - Skip modal on Sundays and public holidays
  - Auto-assignment of selected addons to Premium customers
  - Swap modal shows only selected addon types
  - Each day's selection independent in localStorage

### Changed

#### UI Improvements (2026-02-05)
- **Edit Profile Modal**:
  - Route selection: Changed dropdown to circular radio buttons (A, B, C)
  - Account status: Changed dropdown to iOS-style toggle switch
  - Real-time status text updates (Active/Inactive with color)
  - Darker selected state for route buttons (bg-blue-700)

#### Walk-in Section (2026-02-05)
- Compacted layout with tighter spacing
- Moved outside main scroll area (sticky positioning)
- Fixed visibility: Only shown in Attendance tab
- Scroll position preservation when making changes

#### Share Route Feature (2026-02-05)
- Updated WhatsApp message format to include addons and extra addons
- Shows addon codes with counts (e.g., "[C, 2SE, P]")
- Addon legend at bottom with full names

### Fixed

#### Scroll Issues (2026-02-05)
- Fixed scroll jumping when marking attendance
- Implemented smart card updates (updateSingleCard) instead of full re-renders
- Scroll position restoration with overflow-anchor CSS
- Changed scroll behavior from 'smooth' to 'auto' for instant restoration

#### Addon System (2026-02-05)
- Extra addons now respect veg/non-veg color coding
- Fixed preservation of 2nd line addons on marked cards
- Fixed addon display for Couple package customers
- Calendar addon legend showing correct extraAddons field

#### Date Handling (2026-02-04)
- Fixed timezone issues causing incorrect warning dialogs
- All date operations now use consistent local timezone

### Technical

- Smart card update system preserves scroll position
- Package filter counts update in real-time when marking
- Database schema updated for comprehensive addon tracking
- Service worker auto-update on every load

---

## [Previous Versions]

*Note: Earlier versions were developed before migration to this repository structure.*

---

## Commit History (since main branch)

- `fbfc106` - feat: Add package filter pills in walk-in section
- `b9cf485` - feat: Daily addon selection system with chef input
- `66d204f` - style: Darker circular route buttons
- `04f9f73` - UI: Edit Profile improvements
- `efab495` - Updated the Share route whatsapp message
- `267af0c` - Fixed scrolling with card id
- `ca50287` - Good Code
- `76e0037` - disapper walkin in other tabs
- `25248c1` - Fix scroll
- `3822a39` - compacted daily walkin
- `4aa7198` - Scroll fixed in addon modal
- `58adb3c` - Fixed the Walking section not to scroll
- `7b9c216` - Refresh :)
- `8560d8b` - Migrate from CodeSpace blank

---

**Current Branch:** AICodeAssist  
**Current Commit:** fbfc106  
**Ahead of main:** 14 commits
