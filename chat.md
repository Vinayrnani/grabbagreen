[2026-04-03 09:53:25 IST] Prompt: Currently while generating the invoice it will check the attendance of the month and warns the user to fill them by showing model, can you add a button next to close saying continue anyway so that the invoice will be generated based on the data available. Show alert model if user wants to continue anyway that the attendance is partial message

Response: 
- Fixed bug in getMissingAttendanceForMonth (invoice.js): Added check to skip dates when customer was in their inactive period, preventing false "missing attendance" warnings for reactivated customers
- Added "Continue Anyway" button to missing attendance modal (index.html): Green button next to Close button, shown only when called from invoice generation
- Updated showMissingAttendanceModal (app.js): Accepts onContinue parameter, shows/hides Continue Anyway button, added continueWithMissingAttendance function that shows confirmation alert about partial attendance
- Refactored generateAllInvoicesForMonth (invoice.js): Extracted invoice generation logic into separate generateInvoicesForMonth function, passes callback via window._onContinueMissingAttendance for the Continue Anyway flow
