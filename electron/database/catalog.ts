import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from './database';
import { getStock, recordStockMovement } from './inventory';
import { parseProductImport } from './product-import';
import { enableProductVariants } from './variants';

export type CategoryInput = { categoryName: string; parentCategoryId?: number | null; description?: string | null };
export type ProductInput = {
  productName: string; sku?: string | null; categoryId: number; productType?: 'saree'|'clothing'; brand?: string | null;
  description?: string | null; unit: string; purchasePrice: number; sellingPrice: number;
  gstPercentage: number; minimumStock: number; imagePath?: string | null; isActive: boolean; openingStock?: number;
  sareeType?: string|null; designNumber?:string|null; fabric?:string|null; color?:string|null; pattern?:string|null; sleeveType?:string|null; fitType?:string|null;
};
const units = ['Piece','KG','Gram','Litre','ML','Meter','Box','Packet','Dozen','Pair','Bundle'];
function clean(value: unknown): string | null { const result = typeof value === 'string' ? value.trim() : ''; return result || null; }
function withImage(row: any) { if (!row?.imagePath) return row; try { const ext=path.extname(row.imagePath).slice(1).toLowerCase(); const mime=ext==='jpg'||ext==='jpeg'?'image/jpeg':`image/${ext}`; return {...row,imageData:`data:${mime};base64,${fs.readFileSync(row.imagePath).toString('base64')}`}; } catch { return row; } }
function validateProduct(input: ProductInput) {
  if (!clean(input.productName)) throw new Error('Product name is required.');
  if (!Number.isSafeInteger(input.categoryId) || input.categoryId <= 0) throw new Error('Choose a category.');
  if (!units.includes(input.unit)) throw new Error('Choose a supported unit.');
  for (const [label, value] of [['Purchase price',input.purchasePrice],['Selling price',input.sellingPrice],['Minimum stock',input.minimumStock],['Opening stock',input.openingStock ?? 0]] as const)
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be negative.`);
  if (!Number.isFinite(input.gstPercentage) || input.gstPercentage < 0 || input.gstPercentage > 100) throw new Error('GST must be between 0 and 100%.');
}
export function getCategories(search = '') {
  return getDatabase().prepare(`SELECT c.id,c.category_name AS categoryName,c.parent_category_id AS parentCategoryId,
    p.category_name AS parentCategory,c.description,c.is_active AS isActive,c.created_at AS createdAt,
    (SELECT COUNT(*) FROM products x WHERE x.category_id=c.id) AS productCount,
    (SELECT COUNT(*) FROM products x WHERE x.category_id=c.id AND x.is_active=1) AS activeProductCount
    FROM categories c LEFT JOIN categories p ON p.id=c.parent_category_id
    WHERE c.category_name LIKE ? OR COALESCE(c.description,'') LIKE ? OR COALESCE(p.category_name,'') LIKE ?
    ORDER BY COALESCE(p.category_name,c.category_name) COLLATE NOCASE,c.category_name COLLATE NOCASE`).all(`%${search}%`,`%${search}%`,`%${search}%`);
}
export function createCategory(input: CategoryInput) {
  const name = clean(input.categoryName); if (!name) throw new Error('Category name is required.');
  if (input.parentCategoryId != null && !getDatabase().prepare('SELECT 1 FROM categories WHERE id=?').get(input.parentCategoryId)) throw new Error('Parent category was not found.');
  try { return Number(getDatabase().prepare('INSERT INTO categories(category_name,parent_category_id,description) VALUES(?,?,?)').run(name,input.parentCategoryId ?? null,clean(input.description)).lastInsertRowid); }
  catch (e) { if (String(e).includes('UNIQUE') || String(e).includes('Duplicate category')) throw new Error('A category with this name already exists under that parent.'); throw e; }
}
export function updateCategory(id: number, input: CategoryInput & { isActive?: boolean }) {
  const name = clean(input.categoryName); if (!name) throw new Error('Category name is required.');
  if (id === input.parentCategoryId) throw new Error('A category cannot be its own parent.');
  const db=getDatabase(); if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(id)) throw new Error('Category was not found.');
  const descendants=db.prepare(`WITH RECURSIVE tree(id) AS (SELECT id FROM categories WHERE parent_category_id=? UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_category_id=t.id) SELECT id FROM tree`).all(id) as {id:number}[];
  if (descendants.some(x=>x.id===input.parentCategoryId)) throw new Error('A category cannot be moved beneath its own subcategory.');
  try { db.prepare("UPDATE categories SET category_name=?,parent_category_id=?,description=?,is_active=? WHERE id=?").run(name,input.parentCategoryId ?? null,clean(input.description),input.isActive===false?0:1,id); }
  catch(e) { if(String(e).includes('UNIQUE') || String(e).includes('Duplicate category')) throw new Error('A category with this name already exists under that parent.'); throw e; }
}
export function deleteCategory(id: number) {
  const db=getDatabase(); const assigned=(db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id=?').get(id) as {count:number}).count;
  if(assigned) throw new Error(`This category still has ${assigned} assigned product${assigned===1?'':'s'} (including inactive products). Reassign them before deleting the category.`);
  if(db.prepare('SELECT 1 FROM categories WHERE parent_category_id=? LIMIT 1').get(id)) throw new Error('This category has subcategories. Move or delete them first.');
  if(!db.prepare('DELETE FROM categories WHERE id=?').run(id).changes) throw new Error('Category was not found.');
}
export function createProduct(input: ProductInput) {
  validateProduct(input); const db=getDatabase();
  try { return db.transaction(()=>{
    if(!db.prepare('SELECT 1 FROM categories WHERE id=? AND is_active=1').get(input.categoryId)) throw new Error('Choose an active category.');
    const productType=input.productType==='clothing'?'clothing':'saree';
    if(productType==='clothing'&&(input.openingStock??0)>0)throw new Error('Opening stock for clothing products must be entered on a variant.');
    const r=db.prepare(`INSERT INTO products(product_name,sku,category_id,brand,description,unit,purchase_price,selling_price,gst_percentage,minimum_stock,image_path,is_active,has_variants,product_type,saree_type,design_number,fabric,color,pattern,sleeve_type,fit_type)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(clean(input.productName),clean(input.sku),input.categoryId,clean(input.brand),clean(input.description),input.unit,input.purchasePrice,input.sellingPrice,input.gstPercentage,input.minimumStock,clean(input.imagePath),input.isActive?1:0,productType==='clothing'?1:0,productType,clean(input.sareeType),clean(input.designNumber),clean(input.fabric),clean(input.color),clean(input.pattern),clean(input.sleeveType),clean(input.fitType));
    const id=Number(r.lastInsertRowid); if((input.openingStock ?? 0)>0) recordStockMovement({productId:id,type:'OPENING',quantity:input.openingStock!,direction:'in',notes:'Opening stock'});
    return id;
  })(); } catch(e) { if(String(e).includes('UNIQUE')||String(e).includes('SKU already in use')) throw new Error('SKU is already in use.'); throw e; }
}
export function updateProduct(id:number,input:ProductInput) {
  validateProduct(input); const db=getDatabase();
  try { db.transaction(()=>{
    const current=db.prepare('SELECT has_variants AS hasVariants FROM products WHERE id=?').get(id) as {hasVariants:number}|undefined;if(!current)throw new Error('Product was not found.');
    const productType=input.productType==='clothing'?'clothing':'saree';
    db.prepare(`UPDATE products SET product_name=?,sku=?,category_id=?,brand=?,description=?,unit=?,purchase_price=?,selling_price=?,gst_percentage=?,minimum_stock=?,image_path=?,is_active=?,product_type=?,saree_type=?,design_number=?,fabric=?,color=?,pattern=?,sleeve_type=?,fit_type=?,updated_at=datetime('now') WHERE id=?`)
      .run(clean(input.productName),clean(input.sku),input.categoryId,clean(input.brand),clean(input.description),input.unit,input.purchasePrice,input.sellingPrice,input.gstPercentage,input.minimumStock,clean(input.imagePath),input.isActive?1:0,productType,clean(input.sareeType),clean(input.designNumber),clean(input.fabric),clean(input.color),clean(input.pattern),clean(input.sleeveType),clean(input.fitType),id);
    if(productType==='clothing'&&!current.hasVariants)enableProductVariants(id);
  })(); }
  catch(e) { if(String(e).includes('UNIQUE')||String(e).includes('SKU already in use')) throw new Error('SKU is already in use.'); throw e; }
  if(!db.prepare('SELECT changes() AS n').get() || !db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) throw new Error('Product was not found.');
}
export function getProducts(filters:{search?:string;categoryId?:number;brand?:string;status?:string;sort?:string;direction?:string;page?:number;pageSize?:number}={}) {
  const db=getDatabase(), where:string[]=['1=1'], args:unknown[]=[]; const q=clean(filters.search);
  if(q){where.push("(p.product_name LIKE ? OR COALESCE(p.sku,'') LIKE ? OR COALESCE(p.brand,'') LIKE ?)"); args.push(...Array(3).fill(`%${q}%`));}
  if(filters.categoryId){where.push('p.category_id=?');args.push(filters.categoryId);} if(filters.brand){where.push('p.brand=?');args.push(filters.brand);}
  if(filters.status==='active'||filters.status==='inactive'){where.push('p.is_active=?');args.push(filters.status==='active'?1:0);}
  const order:Record<string,string>={name:'p.product_name',sku:'p.sku',brand:'p.brand',price:'p.selling_price',stock:'stock'};
  const orderBy=order[filters.sort||'name']||'p.product_name',direction=filters.direction==='desc'?'DESC':'ASC';
  const page=Math.max(1,filters.page||1),size=Math.min(100,Math.max(1,filters.pageSize||20));
  const base=`FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')}`;
  const total=Number((db.prepare(`SELECT COUNT(*) n ${base}`).get(...args) as {n:number}).n);
  const rows=db.prepare(`SELECT p.id,p.product_name AS productName,p.sku,p.category_id AS categoryId,c.category_name AS category,p.brand,p.description,p.unit,p.purchase_price AS purchasePrice,p.selling_price AS sellingPrice,p.gst_percentage AS gstPercentage,p.minimum_stock AS minimumStock,p.image_path AS imagePath,p.is_active AS isActive,p.has_variants AS hasVariants,p.product_type AS productType,p.saree_type AS sareeType,p.design_number AS designNumber,p.fabric,p.color,p.pattern,p.sleeve_type AS sleeveType,p.fit_type AS fitType,p.created_at AS createdAt,p.updated_at AS updatedAt,(SELECT COUNT(*) FROM product_variants v WHERE v.product_id=p.id) AS variantCount,CASE WHEN p.has_variants=1 THEN COALESCE((SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1),0) ELSE COALESCE((SELECT SUM(t.quantity_in-t.quantity_out) FROM stock_transactions t WHERE t.product_id=p.id AND t.variant_id IS NULL),0) END AS stock ${base} ORDER BY ${orderBy} ${direction} LIMIT ? OFFSET ?`).all(...args,size,(page-1)*size);
  return {rows:(rows as any[]).map(withImage),total,page,pageSize:size,brands:db.prepare("SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND trim(brand)<>'' ORDER BY brand COLLATE NOCASE").all().map((x:any)=>x.brand)};
}
export function getProductById(id:number) { const r=getDatabase().prepare(`SELECT p.id,p.product_name AS productName,p.sku,p.category_id AS categoryId,c.category_name AS category,p.brand,p.description,p.unit,p.purchase_price AS purchasePrice,p.selling_price AS sellingPrice,p.gst_percentage AS gstPercentage,p.minimum_stock AS minimumStock,p.image_path AS imagePath,p.is_active AS isActive,p.has_variants AS hasVariants,p.product_type AS productType,p.saree_type AS sareeType,p.design_number AS designNumber,p.fabric,p.color,p.pattern,p.sleeve_type AS sleeveType,p.fit_type AS fitType,p.created_at AS createdAt,p.updated_at AS updatedAt FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?`).get(id) as any; if(!r) throw new Error('Product was not found.'); const movements=getDatabase().prepare('SELECT transaction_type AS type,quantity_in AS quantityIn,quantity_out AS quantityOut,balance_after AS balance,transaction_date AS transactionDate,notes FROM stock_transactions WHERE product_id=? ORDER BY id DESC LIMIT 30').all(id); const stock=r.hasVariants?Number((getDatabase().prepare('SELECT COALESCE(SUM(stock_quantity),0) AS stock FROM product_variants WHERE product_id=? AND is_active=1').get(id) as {stock:number}).stock):getStock(id); return {...withImage(r),stock,movements}; }
export const searchProducts=(query:string)=>getProducts({search:query,pageSize:100});
export function deactivateProduct(id:number) { if(!getDatabase().prepare('UPDATE products SET is_active=0,updated_at=datetime(\'now\') WHERE id=?').run(id).changes) throw new Error('Product was not found.'); }
export function deleteProduct(id:number) { deactivateProduct(id); }
export function getProductStock(id:number) { const p=getDatabase().prepare('SELECT has_variants FROM products WHERE id=?').get(id) as {has_variants:number}|undefined; if(!p) throw new Error('Product was not found.'); return p.has_variants?Number((getDatabase().prepare('SELECT COALESCE(SUM(stock_quantity),0) AS stock FROM product_variants WHERE product_id=? AND is_active=1').get(id) as {stock:number}).stock):getStock(id); }
function importedNumber(value:string|undefined,label:string,rowNumber:number):number {
  if(!value?.trim())return 0;const normalized=value.trim().replace(/[₹,\s]/g,'');const number=Number(normalized);
  if(!Number.isFinite(number)||number<0)throw new Error(`${label} must be a non-negative number.`);return number;
}
export function previewProductImport(fileName:string,bytes:Uint8Array) {
  const parsed=parseProductImport(fileName,bytes),db=getDatabase();
  const categoryRows=db.prepare(`WITH RECURSIVE category_path(id,path,is_active) AS (
    SELECT id,category_name,is_active FROM categories WHERE parent_category_id IS NULL
    UNION ALL SELECT c.id,p.path || ' > ' || c.category_name,p.is_active*c.is_active FROM categories c JOIN category_path p ON p.id=c.parent_category_id
  ) SELECT id,path,is_active AS isActive FROM category_path`).all() as {id:number;path:string;isActive:number}[];
  const categoriesByPath=new Map(categoryRows.map(c=>[c.path.trim().toLowerCase(),c]));
  const byName=new Map<string,typeof categoryRows>();for(const c of categoryRows){const name=c.path.split(' > ').pop()!.toLowerCase();byName.set(name,[...(byName.get(name)||[]),c]);}
  const seenSku=new Set<string>();
  return parsed.map(({rowNumber,values})=>{
    const errors:string[]=[],productName=values.productName?.trim()||'';if(!productName)errors.push('Product name is required.');
    const categoryName=values.category?.trim()||'';let category=categoriesByPath.get(categoryName.toLowerCase());
    if(!category&&categoryName){const matches=byName.get(categoryName.toLowerCase())||[];if(matches.length===1)category=matches[0];else if(matches.length>1)errors.push('Category name is ambiguous; use the full Parent > Category path.');}
    if(!categoryName)errors.push('Category is required.');else if(category&&!category.isActive)errors.push('Category is inactive.');else if(!category&&!errors.some(x=>x.startsWith('Category name is ambiguous')))errors.push('Category was not found. Use an existing category path.');
    const sku=values.sku?.trim()||'';
    if(sku){const key=sku.toLowerCase();if(seenSku.has(key))errors.push('SKU is duplicated in this file.');seenSku.add(key);if(db.prepare("SELECT 1 FROM products WHERE lower(trim(sku))=lower(trim(?)) LIMIT 1").get(sku))errors.push('SKU is already in use.');}
    let purchasePrice=0,sellingPrice=0,gstPercentage=0,minimumStock=0,openingStock=0;
    for(const [field,label,set] of [ ['purchasePrice','Purchase price',(n:number)=>purchasePrice=n],['sellingPrice','Selling price',(n:number)=>sellingPrice=n],['gstPercentage','GST',(n:number)=>gstPercentage=n],['minimumStock','Minimum stock',(n:number)=>minimumStock=n],['openingStock','Opening stock',(n:number)=>openingStock=n] ] as const){try{set(importedNumber(values[field],label,rowNumber));}catch(e){errors.push(e instanceof Error?e.message:String(e));}}
    if(gstPercentage>100)errors.push('GST must be between 0 and 100%.');
    const unit=values.unit?.trim()||'Piece';if(!units.includes(unit))errors.push(`Unsupported unit: ${unit}.`);
    const status=(values.status||'active').trim().toLowerCase();if(!['active','inactive','true','false','1','0'].includes(status))errors.push('Status must be Active or Inactive.');
    const product:ProductInput={productName,sku,categoryId:category?.id||0,productType:values.productType?.toLowerCase()==='clothing'?'clothing':'saree',brand:values.brand||'',sareeType:values.sareeType||'',designNumber:values.designNumber||'',fabric:values.fabric||'',color:values.color||values.colour||'',pattern:values.pattern||'',sleeveType:values.sleeveType||'',fitType:values.fitType||'',description:values.description||'',unit,purchasePrice,sellingPrice,gstPercentage,minimumStock,openingStock,isActive:!['inactive','false','0'].includes(status)};
    return {rowNumber,product,sourceCategory:categoryName,errors};
  });
}
export function importProducts(rows:{rowNumber:number;product:ProductInput}[]) {
  if(!Array.isArray(rows)||rows.length>1000)throw new Error('Import is limited to 1,000 products per batch.');
  let imported=0;const errors:{rowNumber:number;message:string}[]=[];
  for(const row of rows){try{createProduct(row.product);imported++;}catch(e){errors.push({rowNumber:row.rowNumber,message:e instanceof Error?e.message:String(e)});}}
  return {imported,errors};
}
export async function chooseProductImage() {
  const result=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Product images',extensions:['png','jpg','jpeg','webp']} ]});
  if(result.canceled||!result.filePaths[0]) return null;
  const source=result.filePaths[0],dir=path.join(app.getPath('userData'),'product-images'); fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,`${Date.now()}-${path.basename(source).replace(/[^\w.-]/g,'_')}`); fs.copyFileSync(source,target); return target;
}
