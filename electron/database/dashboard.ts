import { getDatabase } from './database';

export type AnalyticsRange = '7d' | '30d' | '12m';
export type DashboardAnalyticsPoint = { key: string; label: string; sales: number };
export type LowStockProduct = { id: number; variantId: null; name: string; sku: string | null; productType: string; stock: number; minimumStock: number; unit: string };
export type RecentSale = { id: number; invoiceNumber: string; saleDate: string; customerName: string; totalAmount: number; paymentStatus: string; paymentMethod: string | null };
export type DashboardData = {
  shopName: string;
  currency: string;
  salesToday: number;
  salesThisMonth: number;
  todayProfit: number;
  totalProducts: number;
  stockValue: number;
  customerDue: number;
  totalCustomers: number;
  lowStockCount: number;
  lowStockProducts: LowStockProduct[];
  recentSales: RecentSale[];
  salesAnalytics: DashboardAnalyticsPoint[];
};

function sumNumber(sql: string, ...params: unknown[]): number {
  const row = getDatabase().prepare(sql).get(...params) as { value: number | null };
  return Number(row?.value ?? 0);
}

function salesTotalFor(period: 'today' | 'month'): number {
  const condition = period === 'today'
    ? "date(s.sale_date, 'localtime') = date('now', 'localtime')"
    : "strftime('%Y-%m', s.sale_date, 'localtime') = strftime('%Y-%m', 'now', 'localtime')";
  const sales = sumNumber(`SELECT COALESCE(SUM(s.total_amount), 0) AS value FROM sales s WHERE ${condition}`);
  const returns = sumNumber(`
    SELECT COALESCE(SUM(st.quantity_in * COALESCE((
      SELECT si.total_amount / NULLIF(si.quantity, 0)
      FROM sale_items si
      WHERE si.sale_id = st.reference_id AND si.product_id = st.product_id
        AND si.variant_id IS st.variant_id
      ORDER BY si.id LIMIT 1
    ), 0)), 0) AS value
    FROM stock_transactions st
    WHERE st.transaction_type = 'SALE_RETURN'
      AND ${period === 'today'
        ? "date(st.transaction_date, 'localtime') = date('now', 'localtime')"
        : "strftime('%Y-%m', st.transaction_date, 'localtime') = strftime('%Y-%m', 'now', 'localtime')"}`);
  return Math.max(0, sales - returns);
}

export function getTodaySales(): number { return salesTotalFor('today'); }
export function getMonthlySales(): number { return salesTotalFor('month'); }

export function getTodayProfit(): number {
  const salesProfit = sumNumber(`
    SELECT COALESCE(SUM(si.total_amount - si.tax_amount - (si.quantity * si.cost_price)), 0) AS value
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    LEFT JOIN product_variants v ON v.id = si.variant_id
    WHERE date(s.sale_date, 'localtime') = date('now', 'localtime')`);
  const returnedProfit = sumNumber(`
    SELECT COALESCE(SUM(st.quantity_in * COALESCE((
      SELECT (si.total_amount - si.tax_amount) / NULLIF(si.quantity, 0) - si.cost_price
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      LEFT JOIN product_variants v ON v.id = si.variant_id
      WHERE si.sale_id = st.reference_id AND si.product_id = st.product_id AND si.variant_id IS st.variant_id
      ORDER BY si.id LIMIT 1
    ), 0)), 0) AS value
    FROM stock_transactions st
    WHERE st.transaction_type = 'SALE_RETURN' AND date(st.transaction_date, 'localtime') = date('now', 'localtime')`);
  return salesProfit - returnedProfit;
}

export function getTotalProducts(): number {
  return sumNumber('SELECT COUNT(*) AS value FROM products WHERE is_active = 1');
}

export function getStockValue(): number {
  return sumNumber(`
    SELECT COALESCE((
      SELECT SUM(p.purchase_price * COALESCE((
        SELECT SUM(st.quantity_in - st.quantity_out) FROM stock_transactions st
        WHERE st.product_id = p.id AND st.variant_id IS NULL
      ), 0))
      FROM products p WHERE p.is_active = 1 AND p.has_variants = 0
    ), 0) + COALESCE((
      SELECT SUM(v.stock_quantity * COALESCE(NULLIF(v.purchase_price, 0), p.purchase_price))
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.is_active = 1 AND p.has_variants = 1 AND v.is_active = 1
    ), 0) AS value`);
}

export function getLowStockProducts(limit = 8): LowStockProduct[] {
  return getDatabase().prepare(`
    SELECT p.id, NULL AS variantId, p.product_name AS name, p.sku, p.product_type AS productType,
      COALESCE((SELECT SUM(st.quantity_in - st.quantity_out) FROM stock_transactions st WHERE st.product_id = p.id AND st.variant_id IS NULL), 0) AS stock,
      p.minimum_stock AS minimumStock, p.unit
    FROM products p WHERE p.is_active = 1 AND p.has_variants = 0 AND p.minimum_stock > 0
      AND COALESCE((SELECT SUM(st.quantity_in - st.quantity_out) FROM stock_transactions st WHERE st.product_id = p.id AND st.variant_id IS NULL), 0) <= p.minimum_stock
    UNION ALL
    SELECT p.id, NULL AS variantId, p.product_name AS name, p.sku, p.product_type AS productType,
      COALESCE(SUM(v.stock_quantity), 0) AS stock, p.minimum_stock AS minimumStock, p.unit
    FROM products p LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
    WHERE p.is_active = 1 AND p.has_variants = 1 AND p.minimum_stock > 0
    GROUP BY p.id HAVING COALESCE(SUM(v.stock_quantity), 0) <= p.minimum_stock
    ORDER BY stock ASC, name COLLATE NOCASE LIMIT ?`).all(limit) as LowStockProduct[];
}

export function getCustomerOutstanding(): number {
  return sumNumber(`
    SELECT COALESCE((SELECT SUM(due_amount) FROM sales), 0) +
      COALESCE((SELECT SUM(opening_balance) FROM customers), 0) AS value`);
}

export function getTotalCustomers(): number {
  return sumNumber('SELECT COUNT(*) AS value FROM customers');
}

export function getRecentSales(limit = 50): RecentSale[] {
  return getDatabase().prepare(`
    SELECT s.id, s.invoice_number AS invoiceNumber, s.sale_date AS saleDate,
      COALESCE(c.customer_name, 'Walk-in customer') AS customerName,
      s.total_amount AS totalAmount, s.payment_status AS paymentStatus, s.payment_method AS paymentMethod
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.sale_date DESC, s.id DESC LIMIT ?`).all(limit) as RecentSale[];
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSalesAnalytics(range: AnalyticsRange): DashboardAnalyticsPoint[] {
  const db = getDatabase();
  const points: DashboardAnalyticsPoint[] = [];
  const keys: string[] = [];
  const now = new Date();
  if (range === '12m') {
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let index = 0; index < 12; index += 1) {
      const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      keys.push(key);
      points.push({ key, label: month.toLocaleDateString('en-IN', { month: 'short' }), sales: 0 });
    }
  } else {
    const days = range === '7d' ? 7 : 30;
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - index);
      const key = localDate(date);
      keys.push(key);
      points.push({ key, label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), sales: 0 });
    }
  }
  const expression = range === '12m' ? "strftime('%Y-%m', sale_date, 'localtime')" : "date(sale_date, 'localtime')";
  const firstKey = keys[0];
  const lastKey = keys[keys.length - 1];
  const salesRows = db.prepare(`SELECT ${expression} AS key, COALESCE(SUM(total_amount), 0) AS value FROM sales WHERE ${expression} BETWEEN ? AND ? GROUP BY key`).all(firstKey, lastKey) as { key: string; value: number }[];
  const returnExpression = range === '12m' ? "strftime('%Y-%m', st.transaction_date, 'localtime')" : "date(st.transaction_date, 'localtime')";
  const returnRows = db.prepare(`
    SELECT ${returnExpression} AS key, COALESCE(SUM(st.quantity_in * COALESCE((
      SELECT si.total_amount / NULLIF(si.quantity, 0)
      FROM sale_items si WHERE si.sale_id = st.reference_id AND si.product_id = st.product_id AND si.variant_id IS st.variant_id
      ORDER BY si.id LIMIT 1
    ), 0)), 0) AS value
    FROM stock_transactions st WHERE st.transaction_type = 'SALE_RETURN' AND ${returnExpression} BETWEEN ? AND ? GROUP BY key`).all(firstKey, lastKey) as { key: string; value: number }[];
  const values = new Map(salesRows.map((row) => [row.key, Number(row.value)]));
  const returns = new Map(returnRows.map((row) => [row.key, Number(row.value)]));
  return points.map((point, index) => ({ ...point, sales: Math.max(0, (values.get(keys[index]) ?? 0) - (returns.get(keys[index]) ?? 0)) }));
}

export function getDashboardData(range: AnalyticsRange): DashboardData {
  const db = getDatabase();
  const settings = db.prepare('SELECT shop_name AS shopName, currency FROM settings ORDER BY id LIMIT 1').get() as { shopName: string | null; currency: string | null } | undefined;
  const lowStockProducts = getLowStockProducts(8);
  const lowStockCount = sumNumber(`
    SELECT COUNT(*) AS value FROM products p WHERE p.is_active=1 AND p.minimum_stock>0 AND (
      (p.has_variants=0 AND COALESCE((SELECT SUM(st.quantity_in-st.quantity_out) FROM stock_transactions st WHERE st.product_id=p.id AND st.variant_id IS NULL),0)<=p.minimum_stock)
      OR (p.has_variants=1 AND COALESCE((SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1),0)<=p.minimum_stock)
    )`);
  return {
    shopName: settings?.shopName?.trim() || 'ShopMate Store',
    currency: settings?.currency || 'INR',
    salesToday: getTodaySales(),
    salesThisMonth: getMonthlySales(),
    todayProfit: getTodayProfit(),
    totalProducts: getTotalProducts(),
    stockValue: getStockValue(),
    customerDue: getCustomerOutstanding(),
    totalCustomers: getTotalCustomers(),
    lowStockCount,
    lowStockProducts,
    recentSales: getRecentSales(12),
    salesAnalytics: getSalesAnalytics(range),
  };
}
