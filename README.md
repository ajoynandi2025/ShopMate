# ShopMate

**ShopMate – Saree & Clothing Store Manager**  
Smart Fashion Retail. Simple Billing. Easy Inventory.

Offline-first Windows desktop application built with Electron, React, TypeScript and SQLite. SQLite is the primary store; normal product, stock, billing and expense operations do not require internet.

## Current modules

- Product and category management with Saree and Clothing types, variants, CSV/XLSX import and parent-level minimum stock.
- Purchases with supplier invoices, product/variant lines, discounts, GST, partial payment, stock receipt and purchase history.
- Sales and billing with product/variant selection, discounts, GST, partial payments, credit, sales history and browser printing.
- Inventory overview, stock valuation, movement history, stock adjustments and damage entries using the central stock ledger.
- Customer and supplier contact records, outstanding balances, ledgers and payment allocation.
- Expense records with date/category summaries and audit-preserving deletion.
- Date-filtered sales, purchase, profit/loss and GST summary reports with CSV export.
- Local user login, first-run administrator setup, employee/admin roles and settings.
- Integrity-checked local backups, daily startup backup, backup history and validated restore with a safety copy.

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for the exact scope and remaining work. Purchases now has an initial invoice workflow. Reports, GST, printing, settings and other phases are still partial and should not be considered production complete. The Windows installer build succeeds, but has not been installed and tested on Windows 10/11.

## Run locally

Install Node.js 20 or newer, then:

```powershell
npm install
npm run dev
```

The first launch asks you to create the local administrator account. Passwords are stored as salted scrypt hashes.

Create a Windows installer:

```powershell
npm run dist:win
```

Run checks:

```powershell
npm test
```

## Local data and migrations

ShopMate stores `shopmate.db` in Electron's per-user `app.getPath('userData')` folder, outside the installation directory. Schema migrations preserve existing business rows. Current schema version is 8. Backups are created under the user data folder's `backups` directory; restore validates the database and creates a safety backup before replacing the active file. Uninstall is configured not to delete user data.

The renderer uses a restricted preload API and does not access SQLite directly. Barcode and wholesale columns are retained only for compatibility with old database files and historical values; product workflows no longer read or write them.
