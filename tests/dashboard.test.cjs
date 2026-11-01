const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const database = require('../dist-electron/database/database.js');
const dashboard = require('../dist-electron/database/dashboard.js');
const inventory = require('../dist-electron/database/inventory.js');

test('dashboard returns empty values and aggregates live local records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shopmate-dashboard-'));
  const dbPath = path.join(root, 'shopmate.db');
  try {
    const db = database.initializeDatabase(dbPath);
    const empty = dashboard.getDashboardData('7d');
    assert.equal(empty.salesToday, 0);
    assert.equal(empty.salesThisMonth, 0);
    assert.equal(empty.todayProfit, 0);
    assert.equal(empty.totalProducts, 0);
    assert.equal(empty.stockValue, 0);
    assert.equal(empty.customerDue, 0);
    assert.equal(empty.totalCustomers, 0);
    assert.equal(empty.lowStockCount, 0);
    assert.equal(empty.recentSales.length, 0);
    assert.equal(empty.salesAnalytics.length, 7);

    db.prepare("UPDATE settings SET shop_name='Test Corner Shop',currency='INR' WHERE id=1").run();
    const categoryId = Number(db.prepare('INSERT INTO categories(category_name) VALUES (?)').run('Test').lastInsertRowid);
    const simpleId = Number(db.prepare('INSERT INTO products(product_name, sku, category_id, purchase_price, selling_price, minimum_stock) VALUES (?, ?, ?, 10, 15, 3)').run('Simple item', 'DASH-SIMPLE', categoryId).lastInsertRowid);
    inventory.recordStockMovement({ productId: simpleId, type: 'OPENING', quantity: 1, direction: 'in' });
    const variantProduct = Number(db.prepare('INSERT INTO products(product_name, sku, category_id, purchase_price, selling_price, minimum_stock, has_variants) VALUES (?, ?, ?, 30, 50, 4, 1)').run('Variant item', 'DASH-VARIANT', categoryId).lastInsertRowid);
    const variantId = Number(db.prepare('INSERT INTO product_variants(product_id, variant_name, purchase_price, selling_price, stock_quantity) VALUES (?, ?, 30, 50, 1)').run(variantProduct, 'Blue').lastInsertRowid);
    const customerId = Number(db.prepare('INSERT INTO customers(customer_name, opening_balance) VALUES (?, 5)').run('Dashboard Customer').lastInsertRowid);
    const saleId = Number(db.prepare("INSERT INTO sales(invoice_number, customer_id, total_amount, paid_amount, due_amount, payment_status, payment_method) VALUES ('DASH-INV-1', ?, 30, 26, 4, 'partial', 'cash')").run(customerId).lastInsertRowid);
    db.prepare("INSERT INTO sale_items(sale_id, product_id, product_name, quantity, unit, selling_price, tax_amount, total_amount, cost_price) VALUES (?, ?, 'Simple item', 2, 'Piece', 15, 0, 30, 10)").run(saleId, simpleId);
    db.prepare("INSERT INTO stock_transactions(product_id, transaction_type, reference_id, quantity_in, balance_after, transaction_date) VALUES (?, 'SALE_RETURN', ?, 1, 2, datetime('now'))").run(simpleId, saleId);

    const result = dashboard.getDashboardData('7d');
    assert.equal(result.shopName, 'Test Corner Shop');
    assert.equal(result.currency, 'INR');
    assert.equal(result.salesToday, 15);
    assert.equal(result.salesThisMonth, 15);
    assert.equal(result.todayProfit, 5);
    assert.equal(result.totalProducts, 2);
    assert.equal(result.stockValue, 50);
    assert.equal(result.customerDue, 9);
    assert.equal(result.totalCustomers, 1);
    assert.equal(result.lowStockCount, 2);
    assert.equal(result.lowStockProducts.length, 2);
    assert.equal(result.recentSales[0].invoiceNumber, 'DASH-INV-1');
    assert.equal(result.recentSales[0].customerName, 'Dashboard Customer');
    assert.equal(result.salesAnalytics.length, 7);
    assert.equal(result.salesAnalytics.at(-1).sales, 15);
    assert.equal(dashboard.getSalesAnalytics('30d').length, 30);
    assert.equal(dashboard.getSalesAnalytics('12m').length, 12);
    database.closeDatabase();
  } finally {
    database.closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
