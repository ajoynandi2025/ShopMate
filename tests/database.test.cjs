const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const database = require('../dist-electron/database/database.js');
const inventory = require('../dist-electron/database/inventory.js');
const backup = require('../dist-electron/database/backup.js');
const catalog = require('../dist-electron/database/catalog.js');
const variants = require('../dist-electron/database/variants.js');
const sales = require('../dist-electron/database/sales.js');
const dashboard = require('../dist-electron/database/dashboard.js');
const parties = require('../dist-electron/database/parties.js');
const expenses = require('../dist-electron/database/expenses.js');
const reports = require('../dist-electron/database/reports.js');
const settings = require('../dist-electron/database/settings.js');
const security = require('../dist-electron/database/security.js');
const purchases = require('../dist-electron/database/purchases.js');

function storedZip(files) {
  const locals = []; const central = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const file = Buffer.from(name); const body = Buffer.from(content); const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(file.length, 26);
    locals.push(local, file, body);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(body.length, 20); entry.writeUInt32LE(body.length, 24); entry.writeUInt16LE(file.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, file); offset += local.length + file.length + body.length;
  }
  const centralData = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
}

test('Phase 2 schema, constraints, stock transactions, backups, and persistence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shopmate-db-'));
  const dbPath = path.join(root, 'shopmate.db');
  try {
    let db = database.initializeDatabase(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    for (const name of ['settings','users','categories','products','product_variants','customers','suppliers','sales','sale_items','purchases','purchase_items','stock_transactions','expenses','customer_payments','supplier_payments','schema_migrations']) assert.ok(tables.includes(name), `missing ${name}`);
    assert.equal(database.getDatabaseStatus().integrity, 'ok');
    assert.equal(database.getDatabaseStatus().schemaVersion, 8);
    assert.equal(Number(db.pragma('foreign_keys', { simple: true })), 1);

    const category = Number(db.prepare('INSERT INTO categories(category_name) VALUES (?)').run('Test').lastInsertRowid);
    const product = Number(db.prepare('INSERT INTO products(product_name, sku, category_id) VALUES (?, ?, ?)').run('Simple', 'SKU-1', category).lastInsertRowid);
    assert.throws(() => db.prepare('INSERT INTO products(product_name, sku) VALUES (?, ?)').run('Duplicate', 'SKU-1'), /UNIQUE|SKU already in use/);
    const saleId = Number(db.prepare('INSERT INTO sales(invoice_number) VALUES (?)').run('INV-1').lastInsertRowid);
    assert.throws(() => db.prepare('INSERT INTO sales(invoice_number) VALUES (?)').run('INV-1'), /UNIQUE/);
    db.prepare('INSERT INTO sale_items(sale_id, product_id, product_name, quantity, unit, selling_price, total_amount) VALUES (?, ?, ?, 1, ?, 1, 1)').run(saleId, product, 'Simple', 'Piece');
    assert.throws(() => db.prepare('DELETE FROM products WHERE id = ?').run(product), /FOREIGN KEY/);
    const opening = inventory.recordStockMovement({ productId: product, type: 'OPENING', quantity: 8, direction: 'in' });
    assert.equal(opening.balance, 8);
    assert.equal(inventory.getStock(product), 8);
    const supplier=parties.saveParty('supplier',null,{name:'Test Textile Supplier',mobile:'9111111111',stateCode:'27'});
    const purchase=purchases.createPurchase({supplierId:supplier,items:[{productId:product,quantity:3,purchasePrice:20}],paidAmount:10,paymentMethod:'Cash'});
    assert.equal(purchase.paymentStatus,'partial');
    assert.equal(inventory.getStock(product),11);
    assert.equal(purchases.getPurchaseById(purchase.id).items[0].productName,'Simple');
    parties.collectPartyPayment('supplier',supplier,purchase.dueAmount,'UPI','Supplier settlement');
    assert.equal(purchases.getPurchaseById(purchase.id).dueAmount,0);


    const grocery = catalog.createCategory({ categoryName: 'Grocery' });
    const rice = catalog.createCategory({ categoryName: 'Rice', parentCategoryId: grocery });
    assert.throws(() => catalog.createCategory({ categoryName: 'rice', parentCategoryId: grocery }), /already exists/);
    const managed = catalog.createProduct({ productName: 'Basmati rice', sku: 'RICE-1', categoryId: rice, unit: 'KG', purchasePrice: 60, sellingPrice: 80, gstPercentage: 5, minimumStock: 2, isActive: true, openingStock: 10 });
    assert.equal(catalog.getProductStock(managed), 10);
    assert.equal(catalog.getProductById(managed).movements[0].type, 'OPENING');
    assert.throws(() => catalog.createProduct({ productName: 'Duplicate SKU', sku:'RICE-1', categoryId: rice, unit: 'Piece', purchasePrice: 1, sellingPrice: 2, gstPercentage: 0, minimumStock: 0, isActive: true }), /SKU|already in use/);
    const csvImport = Buffer.from('Product Name,Product Type,SKU,Category,Brand,Description,Unit,Purchase Price,Selling Price,GST Percentage,Minimum Stock,Opening Stock,Status\r\n"Rice, premium",Saree,BULK-1,"Grocery > Rice",,Bagged,KG,50,70,5,2,4,Active\r\nDuplicate,Saree,BULK-1,"Grocery > Rice",,,Piece,1,2,0,0,0,Active');
    const importPreview = catalog.previewProductImport('bulk.csv', csvImport);
    assert.equal(importPreview.length, 2);
    assert.equal(importPreview[0].product.productName, 'Rice, premium');
    assert.equal(importPreview[0].errors.length, 0);
    assert.ok(importPreview[1].errors.some((message) => message.includes('duplicated in this file')));
    const importResult = catalog.importProducts([{ rowNumber: importPreview[0].rowNumber, product: importPreview[0].product }]);
    assert.equal(importResult.imported, 1);
    assert.equal(catalog.getProductStock(db.prepare("SELECT id FROM products WHERE sku='BULK-1'").get().id), 4);
    const xlsx = storedZip({
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Product Name</t></is></c><c r="B1" t="inlineStr"><is><t>Category</t></is></c><c r="C1" t="inlineStr"><is><t>Selling Price</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Workbook rice</t></is></c><c r="B2" t="inlineStr"><is><t>Grocery &gt; Rice</t></is></c><c r="C2"><v>45</v></c></row></sheetData></worksheet>',
    });
    const workbookPreview = catalog.previewProductImport('products.xlsx', xlsx);
    assert.equal(workbookPreview[0].product.productName, 'Workbook rice');
    assert.equal(workbookPreview[0].product.sellingPrice, 45);
    assert.deepEqual(workbookPreview[0].errors, []);
    assert.equal(catalog.getCategories().find((item) => item.id === rice).productCount, 2);
    assert.equal(catalog.getCategories().find((item) => item.id === rice).activeProductCount, 2);
    assert.throws(() => catalog.deleteCategory(rice), /assigned product/);
    catalog.updateProduct(managed, { productName: 'Premium rice', sku: 'RICE-1', barcode: '123456789', categoryId: rice, unit: 'KG', purchasePrice: 62, sellingPrice: 82, gstPercentage: 5, minimumStock: 2, isActive: true, openingStock: 0 });
    assert.equal(catalog.getProductStock(managed), 10);
    catalog.deleteProduct(managed);
    assert.equal(db.prepare('SELECT is_active FROM products WHERE id=?').get(managed).is_active, 0);

    const parent = catalog.createProduct({ productName: 'Test saree', sku: 'PARENT-SAREE', categoryId: rice, unit: 'Piece', purchasePrice: 500, sellingPrice: 800, gstPercentage: 5, minimumStock: 1, isActive: true, openingStock: 5 });
    const enabled = variants.enableProductVariants(parent);
    assert.ok(enabled.defaultVariantId);
    assert.equal(variants.getTotalProductStock(parent), 5);
    variants.setVariantAttributesForProduct(parent, ['Colour', 'Design Number', 'Fabric']);
    const redVariant = variants.createVariant(parent, { variantName:'Red / S101', sku:'SAREE-RED-101', color:'Red', designNumber:'S101', fabric:'Silk', purchasePrice:550, sellingPrice:900, wholesalePrice:700, openingStock:2, isActive:true, attributes:{} });
    const blueVariant = variants.createVariant(parent, { variantName:'Blue / S102', sku:'SAREE-BLUE-102', color:'Blue', designNumber:'S102', fabric:'Silk', purchasePrice:560, sellingPrice:920, wholesalePrice:720, openingStock:3, isActive:true, attributes:{} });
    const greenVariant = variants.createVariant(parent, { variantName:'Green / S103', sku:'SAREE-GREEN-103', barcode:'SAREE-BAR-GREEN', color:'Green', designNumber:'S103', fabric:'Cotton', purchasePrice:450, sellingPrice:750, wholesalePrice:600, openingStock:1, isActive:true, attributes:{} });
    assert.equal(variants.getTotalProductStock(parent), 11);
    assert.equal(variants.getVariantById(redVariant).movements[0].type, 'OPENING');
    assert.equal(variants.searchVariants('SAREE-BLUE-102')[0].id, blueVariant);
    variants.updateVariant(redVariant, { variantName:'Red / S101', sku:'SAREE-RED-101', color:'Red', designNumber:'S101', fabric:'Silk', purchasePrice:575, sellingPrice:950, wholesalePrice:725, openingStock:0, isActive:true, attributes:{} });
    assert.equal(variants.getVariantStock(redVariant), 2);
    assert.throws(() => variants.createVariant(parent, { variantName:'Duplicate red', sku:'SAREE-RED-DUP', color:'Red', designNumber:'S101', fabric:'Silk', purchasePrice:1, sellingPrice:1, wholesalePrice:1, isActive:true, attributes:{} }), /same attribute combination/);
    assert.throws(() => variants.createVariant(parent, { variantName:'SKU conflict', sku:'SKU-1', purchasePrice:1, sellingPrice:1, wholesalePrice:1, isActive:true }), /SKU is already in use/);
    const combinations = variants.generateVariantCombinations([{ name:'Size', values:['S','M'] }, { name:'Colour', values:['Black','White'] }]);
    assert.equal(combinations.length, 4);
    const batch = variants.createVariantBatch(parent, combinations.map((item) => ({ variantName:item.variantName, size:item.attributes.Size, color:item.attributes.Colour, purchasePrice:20, sellingPrice:35, wholesalePrice:28, openingStock:1, isActive:true })));
    assert.equal(batch.length, 4);
    assert.equal(variants.getTotalProductStock(parent), 15);
    variants.deactivateVariant(greenVariant);
    assert.equal(variants.getTotalProductStock(parent), 14);
    assert.throws(() => variants.deleteVariant(redVariant), /historical sales\/purchases|stock or historical/);
    assert.equal(variants.getVariantsByProduct(parent, { search:'SAREE-RED-101' }).total, 1);
    const lowSaree = catalog.createProduct({ productName:'Low stock saree', sku:'LOW-SAREE', categoryId:rice, productType:'saree', unit:'Piece', purchasePrice:100, sellingPrice:150, gstPercentage:0, minimumStock:10, isActive:true, openingStock:8 });
    const lowClothing = catalog.createProduct({ productName:'Low stock shirt', sku:'LOW-SHIRT', categoryId:rice, productType:'clothing', unit:'Piece', purchasePrice:200, sellingPrice:300, gstPercentage:0, minimumStock:20, isActive:true });
    const shirtA = variants.createVariant(lowClothing,{variantName:'Blue M',sku:'LOW-SHIRT-M',size:'M',color:'Blue',purchasePrice:null,sellingPrice:null,openingStock:9,isActive:true});
    const shirtB = variants.createVariant(lowClothing,{variantName:'Blue L',sku:'LOW-SHIRT-L',size:'L',color:'Blue',purchasePrice:null,sellingPrice:null,openingStock:9,isActive:true});
    let alerts = dashboard.getLowStockProducts(20);
    assert.equal(alerts.find(row=>row.id===lowSaree).stock,8);
    assert.equal(alerts.find(row=>row.id===lowClothing).stock,18);
    assert.equal(alerts.filter(row=>row.id===lowClothing).length,1);
    assert.equal(variants.getVariantById(shirtA).purchasePrice,200);
    inventory.recordStockMovement({productId:lowClothing,variantId:shirtA,type:'PURCHASE',quantity:7,direction:'in'});
    assert.equal(dashboard.getLowStockProducts(20).some(row=>row.id===lowClothing),false);
    inventory.recordStockMovement({productId:lowClothing,variantId:shirtB,type:'DAMAGE',quantity:5,direction:'out'});
    assert.equal(dashboard.getLowStockProducts(20).find(row=>row.id===lowClothing).stock,20);
    const customer = Number(db.prepare('INSERT INTO customers(customer_name,mobile_number) VALUES (?,?)').run('Sales test customer','9000000000').lastInsertRowid);
    const beforeSaleStock = variants.getTotalProductStock(parent);
    const sale = sales.createSale({customerId:customer,items:[{productId:parent,variantId:redVariant,quantity:1,sellingPrice:1000,discount:50}],invoiceDiscount:25,paidAmount:500,paymentMethod:'UPI'});
    assert.equal(sale.paymentStatus,'partial');
    assert.equal(sale.dueAmount,sale.totalAmount-500);
    assert.equal(variants.getTotalProductStock(parent),beforeSaleStock-1);
    assert.equal(db.prepare("SELECT transaction_type FROM stock_transactions WHERE reference_id=? AND transaction_type='SALE'").get(sale.id).transaction_type,'SALE');
    assert.equal(db.prepare('SELECT cost_price FROM sale_items WHERE sale_id=?').get(sale.id).cost_price,575);
    assert.equal(sales.getSaleById(sale.id).items.length,1);
    parties.saveParty('customer',customer,{name:'Sales test customer',mobile:'9000000000',stateCode:'27'});
    settings.updateSettings({shopName:'Test Shop',stateCode:'27',invoicePrefix:'SM',taxInclusive:true,invoiceFormat:'A4'});
    const inclusiveSale=sales.createSale({customerId:customer,items:[{productId:parent,variantId:redVariant,quantity:1,sellingPrice:1000}],paidAmount:1000,paymentMethod:'Cash'});
    assert.equal(inclusiveSale.totalAmount,1000);
    const inclusiveRow=sales.getSaleById(inclusiveSale.id);
    assert.equal(inclusiveRow.taxInclusive,1);
    assert.equal(inclusiveRow.cgst,23.81);
    assert.equal(inclusiveRow.sgst,23.81);
    assert.equal(inclusiveRow.igst,0);
    const outstanding=sales.getSaleById(sale.id).dueAmount;
    assert.ok(outstanding>0);
    parties.collectPartyPayment('customer',customer,outstanding,'UPI','Balance settlement');
    assert.equal(sales.getSaleById(sale.id).dueAmount,0);
    const expenseId=expenses.saveExpense(null,{category:'Shop Rent',description:'Monthly rent',amount:100,expenseDate:new Date().toISOString().slice(0,10),paymentMethod:'Bank Transfer'});
    assert.equal(expenses.expenseSummary().total,100);
    assert.equal(reports.getBusinessReport('profit-loss',new Date().toISOString().slice(0,10),new Date().toISOString().slice(0,10)).summary.expenses,100);
    expenses.saveExpense(expenseId,{category:'Shop Rent',description:'Updated rent',amount:120,expenseDate:new Date().toISOString().slice(0,10),paymentMethod:'Cash'});
    expenses.deleteExpense(expenseId);
    assert.equal(db.prepare('SELECT is_deleted FROM expenses WHERE id=?').get(expenseId).is_deleted,1);
    assert.equal(expenses.expenseSummary().total,0);

    const stockBeforeRollback=variants.getTotalProductStock(parent);
    assert.throws(()=>sales.createSale({customerId:customer,items:[{productId:parent,variantId:redVariant,quantity:999,sellingPrice:10}],paidAmount:10,paymentMethod:'Cash'}),/Insufficient stock/);
    assert.equal(variants.getTotalProductStock(parent),stockBeforeRollback);
    const parentRow = catalog.getProducts({ search:'Test saree' }).rows[0];
    assert.equal(parentRow.variantCount, 8);
    assert.equal(parentRow.stock, 12);
    assert.throws(() => inventory.recordStockMovement({ productId: product, type: 'SALE', quantity: 12, direction: 'out' }), /Insufficient stock/);
    assert.equal(inventory.getStock(product), 11);

    const variantProduct = Number(db.prepare('INSERT INTO products(product_name, has_variants) VALUES (?, 1)').run('Variant product').lastInsertRowid);
    const variant = Number(db.prepare('INSERT INTO product_variants(product_id, variant_name) VALUES (?, ?)').run(variantProduct, 'Red / M').lastInsertRowid);
    inventory.recordStockMovement({ productId: variantProduct, variantId: variant, type: 'PURCHASE', quantity: 5, direction: 'in' });
    inventory.recordStockMovement({ productId: variantProduct, variantId: variant, type: 'SALE', quantity: 2, direction: 'out' });
    assert.equal(inventory.getStock(variantProduct, variant), 3);
    assert.equal(db.prepare('SELECT balance_after FROM stock_transactions WHERE product_id = ? ORDER BY id DESC LIMIT 1').get(variantProduct).balance_after, 3);

    assert.equal(security.getAuthStatus().setupRequired,true);
    const admin=security.setupAdmin({username:'admin.shop',fullName:'Shop Admin',password:'correct horse battery'});
    assert.equal(admin.role,'admin');
    const employeeId=security.saveUser(null,{username:'cashier',fullName:'Cashier',role:'employee',password:'cashier test password'});
    assert.equal(security.listUsers().length,2);
    security.setUserActive(employeeId,false);
    security.logout();
    assert.equal(security.login({username:'admin.shop',password:'correct horse battery'}).role,'admin');
    security.changePassword('correct horse battery','new admin password secure');
    security.logout();
    assert.equal(security.login({username:'admin.shop',password:'new admin password secure'}).role,'admin');

    const backupDir = path.join(root, 'backups');
    const firstBackup = await backup.createBackup(backupDir);
    const secondBackup = await backup.createBackup(backupDir);
    assert.equal(firstBackup.integrity, 'ok');
    assert.equal(secondBackup.integrity, 'ok');
    assert.notEqual(firstBackup.path, secondBackup.path);
    const verify = new Database(firstBackup.path, { readonly: true });
    assert.equal(verify.pragma('integrity_check', { simple: true }), 'ok');
    verify.close();
    assert.equal(backup.listBackups(backupDir).length,2);
    const restored=await backup.restoreBackup(firstBackup.path);assert.equal(restored.integrity,'ok');db=database.getDatabase();

    database.closeDatabase();
    db = database.initializeDatabase(dbPath);
    assert.equal(db.prepare('SELECT count(*) AS count FROM products').get().count, 7);
    assert.equal(inventory.getStock(product), 11);
    assert.equal(variants.getTotalProductStock(parent), 12);
    assert.equal(variants.getVariantsByProduct(parent, { status:'all' }).total, 8);
    assert.deepEqual(variants.getVariantAttributesForProduct(parent), ['Colour','Design Number','Fabric']);
    assert.equal(database.getDatabaseStatus().schemaVersion, 8);
    database.closeDatabase();
  } finally {
    database.closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
