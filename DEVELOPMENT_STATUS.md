# ShopMate Development Status

Updated: 2026-11-01

This status reflects the current source and verified checks. “Partial” means a usable first version exists but one or more requested capabilities are still missing.

| Phase | Area | Status | Current scope / remaining work |
|---|---|---|---|
| 1 | Electron and React shell | Complete | Electron, React, TypeScript, restricted preload, Windows NSIS configuration. |
| 2 | SQLite and inventory ledger | Complete | Local SQLite migrations, foreign keys, centralized stock movement service, integrity checks. |
| 3 | Dashboard and navigation | Complete | Dashboard metrics and low stock by parent product. |
| 4–5 | Products, categories, variants | Complete | Saree/Clothing types, CSV/XLSX import, parent minimum stock, variant price defaults. Legacy barcode/wholesale columns remain unused for history compatibility. |
| 6 | Purchases | Complete baseline | Purchase invoice entry, product/variant lines, supplier selection, tax/discount/payment totals, inventory-ledger receipt, history/detail, and supplier-payment reconciliation. Purchase returns and invoice printing remain in Phase 8/13 scope. |
| 7 | Sales and billing | Partial | Search and variant selection, cart, line and invoice discounts, inclusive/exclusive GST, local/interstate tax split, payment and credit, transactional stock deduction, sale history and browser print. No PDF generation, customer creation from POS, configurable negative stock, or full invoice layouts yet. |
| 8 | Inventory | Partial | Current stock/value list, movement history, adjustment and damage through the ledger. Dedicated return workflows, advanced stock reports and negative-stock configuration remain. |
| 9 | Customers and suppliers | Partial | Contact CRUD, state code, ledger views, outstanding calculations and payment allocation. Purchase history/payments are available; ledger presentation needs running balances. |
| 10 | Expenses | Partial | Create, edit, date/category filters, summaries, CSV export and soft delete with audit snapshots. |
| 11 | Reports | Partial | Date-filtered sales, purchase, P&L, and GST summary endpoints with CSV-compatible export. Product/category/payment-method breakdowns, returns treatment and full period presets remain. |
| 12 | GST | Partial | Product rates, tax-inclusive/exclusive calculations, CGST/SGST/IGST selection from configured state codes, and stored invoice tax snapshots. Classification/HSN and all place-of-supply edge cases remain. |
| 13 | Invoice and PDF | Partial | Invoice detail and browser printing with A4/A5/thermal width styling. PDF download, shop logo rendering, and printer-specific validation remain. |
| 14 | Backup and restore | Partial | Verified local backups, daily startup backup, backup history, validated restore with a pre-restore safety copy and rollback path. User-selected backup location/schedule settings and Windows restore acceptance testing remain. |
| 15 | Users and security | Partial | First-run admin setup, salted scrypt password hashes, login/logout, employee/admin role checks on IPC, user management. Session timeout, audit login log, and broader automated IPC authorization tests remain. |
| 16 | Settings | Partial | Shop/contact/GST/state details, invoice prefix/format, and tax-inclusive setting. Logo picker, discount defaults, theme, printer config, backup location/schedule, and negative stock remain. |
| 17 | Google Sheets | Deferred | Optional; not required for offline operation and not started. |
| 18 | Windows installer | Built; acceptance pending | Electron Builder NSIS target and uninstall data retention are configured. Installer build succeeded at `release/ShopMate-Setup.exe`. Windows 10/11 install/upgrade/uninstall testing is still needed. |

## Verification completed

- `npm run build` succeeds (renderer and Electron TypeScript builds).
- `npm test` passes against temporary SQLite databases. Coverage includes migration/persistence, stock ledger behavior, parent low-stock thresholds, variant price defaults, transactional sales/rollback, purchase stock receipt and supplier settlement, tax-inclusive invoice calculation, expense audit deletion, login/password hashing, and backup restore/integrity.

The tests do not exercise an installed Windows application or real printers. Do not treat partial phases as production complete.
