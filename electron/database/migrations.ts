import type Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 8;

const migrations: Record<number, string> = {
  1: `
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), shop_name TEXT, shop_address TEXT,
      mobile_number TEXT, email TEXT, gstin TEXT, shop_type TEXT, currency TEXT NOT NULL DEFAULT 'INR',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV', logo_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY, category_name TEXT NOT NULL, description TEXT,
      parent_category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY, product_name TEXT NOT NULL, sku TEXT, barcode TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT, brand TEXT, description TEXT, unit TEXT NOT NULL DEFAULT 'Piece',
      purchase_price REAL NOT NULL DEFAULT 0 CHECK (purchase_price >= 0), selling_price REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
      wholesale_price REAL NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0), gst_percentage REAL NOT NULL DEFAULT 0 CHECK (gst_percentage >= 0),
      minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0), has_variants INTEGER NOT NULL DEFAULT 0 CHECK (has_variants IN (0,1)),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX products_sku_unique ON products(sku) WHERE sku IS NOT NULL AND trim(sku) <> '';
    CREATE TABLE product_variants (
      id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_name TEXT NOT NULL, design_number TEXT, size TEXT, color TEXT, fabric TEXT, weight REAL,
      barcode TEXT, sku TEXT, purchase_price REAL NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
      selling_price REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0), stock_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX variants_sku_unique ON product_variants(sku) WHERE sku IS NOT NULL AND trim(sku) <> '';
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY, customer_name TEXT NOT NULL, mobile_number TEXT, address TEXT, gstin TEXT,
      opening_balance REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY, supplier_name TEXT NOT NULL, mobile_number TEXT, address TEXT, gstin TEXT,
      opening_balance REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY, invoice_number TEXT NOT NULL UNIQUE, customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
      sale_date TEXT NOT NULL DEFAULT (datetime('now')), subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0,
      taxable_amount REAL NOT NULL DEFAULT 0, cgst REAL NOT NULL DEFAULT 0, sgst REAL NOT NULL DEFAULT 0, igst REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0, paid_amount REAL NOT NULL DEFAULT 0, due_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid', payment_method TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sale_items (
      id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT, product_name TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0), unit TEXT NOT NULL, selling_price REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0, gst_percentage REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL
    );
    CREATE TABLE purchases (
      id INTEGER PRIMARY KEY, purchase_number TEXT NOT NULL UNIQUE, supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT,
      purchase_date TEXT NOT NULL DEFAULT (datetime('now')), subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0, paid_amount REAL NOT NULL DEFAULT 0,
      due_amount REAL NOT NULL DEFAULT 0, payment_status TEXT NOT NULL DEFAULT 'unpaid', notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE purchase_items (
      id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT, quantity REAL NOT NULL CHECK (quantity > 0),
      purchase_price REAL NOT NULL, gst_percentage REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL
    );
    CREATE TABLE stock_transactions (
      id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('OPENING','PURCHASE','SALE','SALE_RETURN','PURCHASE_RETURN','ADJUSTMENT','DAMAGE')),
      reference_id INTEGER, quantity_in REAL NOT NULL DEFAULT 0 CHECK (quantity_in >= 0), quantity_out REAL NOT NULL DEFAULT 0 CHECK (quantity_out >= 0),
      balance_after REAL NOT NULL CHECK (balance_after >= 0), transaction_date TEXT NOT NULL DEFAULT (datetime('now')), notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (NOT (quantity_in > 0 AND quantity_out > 0))
    );
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY, expense_category TEXT NOT NULL, description TEXT, amount REAL NOT NULL CHECK (amount >= 0),
      expense_date TEXT NOT NULL DEFAULT (datetime('now')), payment_method TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE customer_payments (
      id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      sale_id INTEGER REFERENCES sales(id) ON DELETE RESTRICT, amount REAL NOT NULL CHECK (amount > 0), payment_method TEXT,
      payment_date TEXT NOT NULL DEFAULT (datetime('now')), notes TEXT
    );
    CREATE TABLE supplier_payments (
      id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE RESTRICT, amount REAL NOT NULL CHECK (amount > 0), payment_method TEXT,
      payment_date TEXT NOT NULL DEFAULT (datetime('now')), notes TEXT
    );
    CREATE INDEX categories_parent_idx ON categories(parent_category_id);
    CREATE INDEX products_name_idx ON products(product_name COLLATE NOCASE);
    CREATE INDEX products_sku_idx ON products(sku);
    CREATE INDEX products_barcode_idx ON products(barcode);
    CREATE INDEX products_category_idx ON products(category_id);
    CREATE INDEX variants_product_idx ON product_variants(product_id);
    CREATE INDEX variants_barcode_idx ON product_variants(barcode);
    CREATE INDEX variants_sku_idx ON product_variants(sku);
    CREATE INDEX sales_date_idx ON sales(sale_date);
    CREATE INDEX purchases_date_idx ON purchases(purchase_date);
    CREATE INDEX customers_mobile_idx ON customers(mobile_number);
    CREATE INDEX suppliers_mobile_idx ON suppliers(mobile_number);
    CREATE INDEX stock_date_idx ON stock_transactions(transaction_date);
    CREATE INDEX stock_product_idx ON stock_transactions(product_id, variant_id, id);
    CREATE INDEX sale_items_sale_idx ON sale_items(sale_id);
    CREATE INDEX purchase_items_purchase_idx ON purchase_items(purchase_id);
    CREATE INDEX customer_payments_customer_idx ON customer_payments(customer_id, payment_date);
    CREATE INDEX supplier_payments_supplier_idx ON supplier_payments(supplier_id, payment_date);
    INSERT INTO schema_migrations(version) VALUES (1);
    PRAGMA user_version = 1;
  `,
  2: `
    ALTER TABLE products ADD COLUMN image_path TEXT;
    CREATE UNIQUE INDEX products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND trim(barcode) <> '';
    CREATE TRIGGER categories_unique_insert BEFORE INSERT ON categories
      WHEN EXISTS (SELECT 1 FROM categories c WHERE c.category_name = NEW.category_name COLLATE NOCASE AND COALESCE(c.parent_category_id,0)=COALESCE(NEW.parent_category_id,0))
      BEGIN SELECT RAISE(ABORT, 'Duplicate category name under parent'); END;
    CREATE TRIGGER categories_unique_update BEFORE UPDATE OF category_name,parent_category_id ON categories
      WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id<>NEW.id AND c.category_name = NEW.category_name COLLATE NOCASE AND COALESCE(c.parent_category_id,0)=COALESCE(NEW.parent_category_id,0))
      BEGIN SELECT RAISE(ABORT, 'Duplicate category name under parent'); END;
    INSERT INTO schema_migrations(version) VALUES (2);
    PRAGMA user_version = 2;
  `,
  3: `
    ALTER TABLE product_variants ADD COLUMN packaging TEXT;
    ALTER TABLE product_variants ADD COLUMN pattern TEXT;
    ALTER TABLE product_variants ADD COLUMN brand TEXT;
    ALTER TABLE product_variants ADD COLUMN wholesale_price REAL NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0);
    ALTER TABLE product_variants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1));
    CREATE TABLE product_variant_attribute_definitions (
      id INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      attribute_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, attribute_name COLLATE NOCASE)
    );
    CREATE TABLE product_variant_attributes (
      id INTEGER PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
      attribute_name TEXT NOT NULL,
      attribute_value TEXT NOT NULL,
      UNIQUE(variant_id, attribute_name COLLATE NOCASE)
    );
    CREATE INDEX variants_active_product_idx ON product_variants(product_id, is_active);
    CREATE TRIGGER variant_global_sku_insert BEFORE INSERT ON product_variants
      WHEN NEW.sku IS NOT NULL AND trim(NEW.sku) <> '' AND (EXISTS (SELECT 1 FROM products WHERE lower(trim(sku))=lower(trim(NEW.sku))) OR EXISTS (SELECT 1 FROM product_variants WHERE lower(trim(sku))=lower(trim(NEW.sku))))
      BEGIN SELECT RAISE(ABORT, 'SKU already in use'); END;
    CREATE TRIGGER variant_global_barcode_insert BEFORE INSERT ON product_variants
      WHEN NEW.barcode IS NOT NULL AND trim(NEW.barcode) <> '' AND (EXISTS (SELECT 1 FROM products WHERE lower(trim(barcode))=lower(trim(NEW.barcode))) OR EXISTS (SELECT 1 FROM product_variants WHERE lower(trim(barcode))=lower(trim(NEW.barcode))))
      BEGIN SELECT RAISE(ABORT, 'Barcode already in use'); END;
    CREATE TRIGGER product_global_variant_sku_insert BEFORE INSERT ON products
      WHEN NEW.sku IS NOT NULL AND trim(NEW.sku) <> '' AND EXISTS (SELECT 1 FROM product_variants WHERE lower(trim(sku))=lower(trim(NEW.sku)))
      BEGIN SELECT RAISE(ABORT, 'SKU already in use'); END;
    CREATE TRIGGER product_global_variant_barcode_insert BEFORE INSERT ON products
      WHEN NEW.barcode IS NOT NULL AND trim(NEW.barcode) <> '' AND EXISTS (SELECT 1 FROM product_variants WHERE lower(trim(barcode))=lower(trim(NEW.barcode)))
      BEGIN SELECT RAISE(ABORT, 'Barcode already in use'); END;
    CREATE TRIGGER variant_global_sku_update BEFORE UPDATE OF sku ON product_variants
      WHEN NEW.sku IS NOT NULL AND trim(NEW.sku) <> '' AND (EXISTS (SELECT 1 FROM products WHERE lower(trim(sku))=lower(trim(NEW.sku))) OR EXISTS (SELECT 1 FROM product_variants WHERE id<>NEW.id AND lower(trim(sku))=lower(trim(NEW.sku))))
      BEGIN SELECT RAISE(ABORT, 'SKU already in use'); END;
    CREATE TRIGGER variant_global_barcode_update BEFORE UPDATE OF barcode ON product_variants
      WHEN NEW.barcode IS NOT NULL AND trim(NEW.barcode) <> '' AND (EXISTS (SELECT 1 FROM products WHERE lower(trim(barcode))=lower(trim(NEW.barcode))) OR EXISTS (SELECT 1 FROM product_variants WHERE id<>NEW.id AND lower(trim(barcode))=lower(trim(NEW.barcode))))
      BEGIN SELECT RAISE(ABORT, 'Barcode already in use'); END;
    CREATE TRIGGER product_global_variant_sku_update BEFORE UPDATE OF sku ON products
      WHEN NEW.sku IS NOT NULL AND trim(NEW.sku) <> '' AND EXISTS (SELECT 1 FROM product_variants WHERE lower(trim(sku))=lower(trim(NEW.sku)))
      BEGIN SELECT RAISE(ABORT, 'SKU already in use'); END;
    CREATE TRIGGER product_global_variant_barcode_update BEFORE UPDATE OF barcode ON products
      WHEN NEW.barcode IS NOT NULL AND trim(NEW.barcode) <> '' AND EXISTS (SELECT 1 FROM product_variants WHERE lower(trim(barcode))=lower(trim(NEW.barcode)))
      BEGIN SELECT RAISE(ABORT, 'Barcode already in use'); END;
    CREATE TRIGGER product_sku_ci_insert BEFORE INSERT ON products
      WHEN NEW.sku IS NOT NULL AND trim(NEW.sku) <> '' AND EXISTS (SELECT 1 FROM products WHERE lower(trim(sku))=lower(trim(NEW.sku)))
      BEGIN SELECT RAISE(ABORT, 'SKU already in use'); END;
    CREATE TRIGGER product_sku_ci_update BEFORE UPDATE OF sku ON products
      WHEN NEW.sku IS NOT NULL AND trim(NEW.sku) <> '' AND EXISTS (SELECT 1 FROM products WHERE id<>NEW.id AND lower(trim(sku))=lower(trim(NEW.sku)))
      BEGIN SELECT RAISE(ABORT, 'SKU already in use'); END;
    CREATE TRIGGER product_barcode_ci_insert BEFORE INSERT ON products
      WHEN NEW.barcode IS NOT NULL AND trim(NEW.barcode) <> '' AND EXISTS (SELECT 1 FROM products WHERE lower(trim(barcode))=lower(trim(NEW.barcode)))
      BEGIN SELECT RAISE(ABORT, 'Barcode already in use'); END;
    CREATE TRIGGER product_barcode_ci_update BEFORE UPDATE OF barcode ON products
      WHEN NEW.barcode IS NOT NULL AND trim(NEW.barcode) <> '' AND EXISTS (SELECT 1 FROM products WHERE id<>NEW.id AND lower(trim(barcode))=lower(trim(NEW.barcode)))
      BEGIN SELECT RAISE(ABORT, 'Barcode already in use'); END;
    INSERT INTO schema_migrations(version) VALUES (3);
    PRAGMA user_version = 3;
  `,
  4: `
    ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'saree' CHECK (product_type IN ('saree','clothing'));
    ALTER TABLE products ADD COLUMN saree_type TEXT;
    ALTER TABLE products ADD COLUMN design_number TEXT;
    ALTER TABLE products ADD COLUMN fabric TEXT;
    ALTER TABLE products ADD COLUMN color TEXT;
    ALTER TABLE products ADD COLUMN pattern TEXT;
    ALTER TABLE products ADD COLUMN sleeve_type TEXT;
    ALTER TABLE products ADD COLUMN fit_type TEXT;
    WITH RECURSIVE clothing_categories(id) AS (
      SELECT id FROM categories WHERE category_name = 'Clothing' COLLATE NOCASE AND parent_category_id IS NULL
      UNION ALL SELECT c.id FROM categories c JOIN clothing_categories p ON c.parent_category_id=p.id
    )
    UPDATE products SET product_type='clothing'
    WHERE has_variants=1 OR category_id IN (SELECT id FROM clothing_categories);
    INSERT INTO schema_migrations(version) VALUES (4);
    PRAGMA user_version = 4;
  `,

  5: `
    ALTER TABLE sale_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0);
    UPDATE sale_items SET cost_price=COALESCE((SELECT NULLIF(v.purchase_price,0) FROM product_variants v WHERE v.id=sale_items.variant_id),(SELECT p.purchase_price FROM products p WHERE p.id=sale_items.product_id),0);
    ALTER TABLE settings ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_stock IN (0,1));
    ALTER TABLE settings ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0 CHECK (tax_inclusive IN (0,1));
    ALTER TABLE settings ADD COLUMN invoice_sequence INTEGER NOT NULL DEFAULT 0 CHECK (invoice_sequence >= 0);
    CREATE INDEX sales_customer_date_idx ON sales(customer_id, sale_date);
    CREATE INDEX sale_items_product_idx ON sale_items(product_id, variant_id);
    INSERT INTO schema_migrations(version) VALUES (5);
    PRAGMA user_version = 5;
  `,

  6: `
    ALTER TABLE expenses ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1));
    ALTER TABLE expenses ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
    CREATE TABLE expense_audit (
      id INTEGER PRIMARY KEY, expense_id INTEGER NOT NULL, action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE')),
      snapshot TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX expenses_date_active_idx ON expenses(is_deleted,expense_date);
    INSERT INTO schema_migrations(version) VALUES (6);
    PRAGMA user_version = 6;
  `,

  7: `
    ALTER TABLE settings ADD COLUMN state_code TEXT;
    ALTER TABLE settings ADD COLUMN invoice_format TEXT NOT NULL DEFAULT 'A4';
    ALTER TABLE customers ADD COLUMN state_code TEXT;
    ALTER TABLE suppliers ADD COLUMN state_code TEXT;
    ALTER TABLE sales ADD COLUMN place_of_supply TEXT;
    ALTER TABLE sales ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0 CHECK (tax_inclusive IN (0,1));
    INSERT OR IGNORE INTO settings(id,shop_name,currency) VALUES(1,'ShopMate Store','INR');
    INSERT INTO schema_migrations(version) VALUES (7);
    PRAGMA user_version = 7;
  `,

  8: `
    ALTER TABLE purchase_items ADD COLUMN product_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE purchase_items ADD COLUMN variant_name TEXT;
    ALTER TABLE purchase_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'Piece';
    ALTER TABLE purchase_items ADD COLUMN discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0);
    UPDATE purchase_items SET product_name=COALESCE((SELECT product_name FROM products WHERE id=purchase_items.product_id),'');
    UPDATE purchase_items SET variant_name=(SELECT variant_name FROM product_variants WHERE id=purchase_items.variant_id);
    CREATE INDEX purchases_supplier_date_idx ON purchases(supplier_id,purchase_date);
    INSERT INTO schema_migrations(version) VALUES (8);
    PRAGMA user_version = 8;
  `,

};

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const current = Number(db.pragma('user_version', { simple: true }));
  if (current > CURRENT_SCHEMA_VERSION) throw new Error(`Database schema ${current} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`);
  for (let version = current + 1; version <= CURRENT_SCHEMA_VERSION; version += 1) {
    const migration = migrations[version];
    if (!migration) throw new Error(`Missing database migration ${version}.`);
    db.transaction(() => db.exec(migration))();
  }
}
