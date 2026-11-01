import { getDatabase } from './database';

export type StockTransactionType = 'OPENING' | 'PURCHASE' | 'SALE' | 'SALE_RETURN' | 'PURCHASE_RETURN' | 'ADJUSTMENT' | 'DAMAGE';

export function getStock(productId: number, variantId?: number | null): number {
  const db = getDatabase();
  if (variantId != null) {
    const row = db.prepare('SELECT stock_quantity AS quantity FROM product_variants WHERE id = ? AND product_id = ?').get(variantId, productId) as { quantity: number } | undefined;
    if (!row) throw new Error('Product variant was not found for this product.');
    return row.quantity;
  }
  const product = db.prepare('SELECT has_variants FROM products WHERE id = ?').get(productId) as { has_variants: number } | undefined;
  if (!product) throw new Error('Product was not found.');
  if (product.has_variants) throw new Error('Select a variant to read stock for this product.');
  const row = db.prepare('SELECT COALESCE(SUM(quantity_in - quantity_out), 0) AS quantity FROM stock_transactions WHERE product_id = ? AND variant_id IS NULL').get(productId) as { quantity: number };
  return row.quantity;
}

export function recordStockMovement(input: {
  productId: number; variantId?: number | null; type: StockTransactionType; quantity: number;
  direction: 'in' | 'out'; referenceId?: number | null; notes?: string; transactionDate?: string;
}): { balance: number; transactionId: number } {
  if (!Number.isSafeInteger(input.productId) || input.productId <= 0) throw new Error('Invalid product id.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.');
  const db = getDatabase();
  return db.transaction(() => {
    const product = db.prepare('SELECT has_variants FROM products WHERE id = ?').get(input.productId) as { has_variants: number } | undefined;
    if (!product) throw new Error('Product was not found.');
    const variantId = input.variantId ?? null;
    if (Boolean(product.has_variants) !== (variantId !== null)) throw new Error(product.has_variants ? 'A variant is required for this product.' : 'Simple products cannot use a variant.');
    let current = getStock(input.productId, variantId);
    if (input.direction === 'out' && input.quantity > current) throw new Error('Insufficient stock.');
    const balance = current + (input.direction === 'in' ? input.quantity : -input.quantity);
    if (variantId !== null) {
      db.prepare("UPDATE product_variants SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ? AND product_id = ?").run(balance, variantId, input.productId);
    }
    const result = db.prepare(`INSERT INTO stock_transactions
      (product_id, variant_id, transaction_type, reference_id, quantity_in, quantity_out, balance_after, transaction_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)`)
      .run(input.productId, variantId, input.type, input.referenceId ?? null,
        input.direction === 'in' ? input.quantity : 0, input.direction === 'out' ? input.quantity : 0,
        balance, input.transactionDate ?? null, input.notes ?? null);
    return { balance, transactionId: Number(result.lastInsertRowid) };
  })();
}
export function getInventoryOverview(search=''){
 const q=`%${search.trim()}%`;return getDatabase().prepare(`SELECT p.id,p.product_name AS productName,p.sku,p.product_type AS productType,p.unit,p.minimum_stock AS minimumStock,p.is_active AS isActive,p.has_variants AS hasVariants,
 CASE WHEN p.has_variants=1 THEN COALESCE((SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1),0) ELSE COALESCE((SELECT SUM(t.quantity_in-t.quantity_out) FROM stock_transactions t WHERE t.product_id=p.id AND t.variant_id IS NULL),0) END AS stock,
 CASE WHEN p.has_variants=1 THEN COALESCE((SELECT SUM(v.stock_quantity*COALESCE(NULLIF(v.purchase_price,0),p.purchase_price)) FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1),0) ELSE p.purchase_price*COALESCE((SELECT SUM(t.quantity_in-t.quantity_out) FROM stock_transactions t WHERE t.product_id=p.id AND t.variant_id IS NULL),0) END AS stockValue
 FROM products p WHERE p.is_active=1 AND (p.product_name LIKE ? OR COALESCE(p.sku,'') LIKE ?) ORDER BY p.product_name COLLATE NOCASE LIMIT 500`).all(q,q);
}
export function getInventoryMovements(search=''){
 const q=`%${search.trim()}%`;return getDatabase().prepare(`SELECT t.id,t.transaction_type AS type,t.transaction_date AS transactionDate,t.quantity_in AS quantityIn,t.quantity_out AS quantityOut,t.balance_after AS balance,t.notes,p.product_name AS productName,v.variant_name AS variantName,p.unit
 FROM stock_transactions t JOIN products p ON p.id=t.product_id LEFT JOIN product_variants v ON v.id=t.variant_id WHERE p.product_name LIKE ? OR COALESCE(p.sku,'') LIKE ? ORDER BY t.transaction_date DESC,t.id DESC LIMIT 500`).all(q,q);
}
