# Database ID Conversion Commands

1. **Command 1:** Write a separate JavaScript script that connects to MongoDB, deletes the old id fields, and fixes relationships (for example, make sure orders link to a customer's `_id` instead of the old customer id) and do not run it until I verify and give you the green light.
2. **Command 2:** Run the script and verify the changes.
3. **Command 3:** Update `persistence.js`, `business.js`, `app.js`, and the Handlebars views to use `_id` (`ObjectId`).
