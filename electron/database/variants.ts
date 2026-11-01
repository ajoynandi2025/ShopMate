import { getDatabase } from './database';
import { getStock, recordStockMovement } from './inventory';

export type VariantInput = {
  variantName:string; sku?:string|null; size?:string|null; color?:string|null; designNumber?:string|null;
  fabric?:string|null; weight?:number|null; packaging?:string|null; pattern?:string|null; brand?:string|null;
  purchasePrice?:number|null; sellingPrice?:number|null; isActive:boolean; openingStock?:number;
  attributes?:Record<string,string>;
};
export type VariantDimension = { name:string; values:string[] };
const optionalText=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
const standardFields:Record<string,string>={size:'size',colour:'color',color:'color','design number':'designNumber',designnumber:'designNumber',fabric:'fabric',weight:'weight',packaging:'packaging',pattern:'pattern',brand:'brand'};
function normalizeName(value:string){return value.trim().toLowerCase().replace(/\s+/g,' ');}
function validate(input:VariantInput){
  if(!optionalText(input.variantName))throw new Error('Variant name is required.');
  for(const [label,value] of [['Purchase price',input.purchasePrice],['Selling price',input.sellingPrice],['Opening stock',input.openingStock??0]] as const)
    if(value!=null&&(!Number.isFinite(value)||value<0))throw new Error(`${label} cannot be negative.`);
  if(input.weight!=null&&(!Number.isFinite(input.weight)||input.weight<0))throw new Error('Weight cannot be negative.');
  for(const [key,value] of Object.entries(input.attributes||{}))if(key.trim()&&!/^[\p{L}\p{N} _-]{1,50}$/u.test(key))throw new Error('Custom attribute names may contain letters, numbers, spaces, underscores and hyphens (up to 50 characters).');
}
function productForVariants(productId:number){
  const product=getDatabase().prepare('SELECT id,has_variants,purchase_price AS purchasePrice,selling_price AS sellingPrice FROM products WHERE id=?').get(productId) as {id:number;has_variants:number;purchasePrice:number;sellingPrice:number}|undefined;
  if(!product)throw new Error('Parent product was not found.');if(!product.has_variants)throw new Error('Enable variants for this product first.');return product;
}
function resolvedPrices(productId:number,input:VariantInput){const parent=getDatabase().prepare('SELECT purchase_price AS purchasePrice,selling_price AS sellingPrice FROM products WHERE id=?').get(productId) as {purchasePrice:number;sellingPrice:number}|undefined;if(!parent)throw new Error('Parent product was not found.');return {purchasePrice:input.purchasePrice??parent.purchasePrice,sellingPrice:input.sellingPrice??parent.sellingPrice};}
function normalizedAttributes(input:VariantInput){
  const attributes:Record<string,string>={};
  for(const [key,value] of Object.entries(input.attributes||{})){const name=key.trim();const text=optionalText(value);if(name&&text)attributes[name]=text;}
  return attributes;
}
function signature(input:VariantInput){
  const fields:Record<string,string>={size:input.size||'',color:input.color||'',designNumber:input.designNumber||'',fabric:input.fabric||'',weight:input.weight==null?'':String(input.weight),packaging:input.packaging||'',pattern:input.pattern||'',brand:input.brand||''};
  const custom=normalizedAttributes(input);for(const [key,value] of Object.entries(custom).sort(([a],[b])=>a.localeCompare(b)))fields[`custom:${normalizeName(key)}`]=value;
  const entries=Object.entries(fields).filter(([,value])=>value.trim()).map(([key,value])=>[key,normalizeName(value)]);
  return JSON.stringify(entries.length?entries:[['name',normalizeName(input.variantName)] ]);
}
function assertUniqueIdentifiers(input:VariantInput,productId:number,variantId?:number){
  const db=getDatabase(),sku=optionalText(input.sku);
  if(sku){const product=db.prepare('SELECT 1 FROM products WHERE lower(trim(sku))=lower(trim(?)) LIMIT 1').get(sku);const variant=db.prepare('SELECT 1 FROM product_variants WHERE lower(trim(sku))=lower(trim(?)) AND (? IS NULL OR id<>?) LIMIT 1').get(sku,variantId??null,variantId??null);if(product||variant)throw new Error('SKU is already in use.');}
  const target=signature(input);
  const existing=db.prepare('SELECT id,variant_name AS variantName,design_number AS designNumber,size,color,fabric,weight,packaging,pattern,brand FROM product_variants WHERE product_id=? AND (? IS NULL OR id<>?)').all(productId,variantId??null,variantId??null) as any[];
  for(const row of existing){const attributes=db.prepare('SELECT attribute_name AS name,attribute_value AS value FROM product_variant_attributes WHERE variant_id=?').all(row.id) as {name:string;value:string}[];
    const candidate:VariantInput={...row,variantName:row.variantName,designNumber:row.designNumber,attributes:Object.fromEntries(attributes.map(x=>[x.name,x.value])),purchasePrice:0,sellingPrice:0,isActive:true};
    if(signature(candidate)===target)throw new Error('A variant with the same attribute combination already exists for this product.');
  }
}
function saveAttributes(variantId:number,attributes:Record<string,string>){
  const db=getDatabase();db.prepare('DELETE FROM product_variant_attributes WHERE variant_id=?').run(variantId);
  const insert=db.prepare('INSERT INTO product_variant_attributes(variant_id,attribute_name,attribute_value) VALUES(?,?,?)');
  for(const [name,value] of Object.entries(attributes))insert.run(variantId,name,value);
}
export function getVariantAttributesForProduct(productId:number){
  if(!getDatabase().prepare('SELECT 1 FROM products WHERE id=?').get(productId))throw new Error('Parent product was not found.');
  return getDatabase().prepare('SELECT attribute_name AS name FROM product_variant_attribute_definitions WHERE product_id=? ORDER BY id').all(productId).map((row:any)=>row.name) as string[];
}
export function setVariantAttributesForProduct(productId:number,names:string[]){
  if(!Array.isArray(names)||names.length>30)throw new Error('Choose no more than 30 variant attributes.');
  const cleaned=[...new Map(names.map(name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>50)throw new Error('Attribute names must contain 1 to 50 characters.');return [normalizeName(name),name.trim()] as const;})).values()];
  const db=getDatabase();return db.transaction(()=>{if(!db.prepare('SELECT 1 FROM products WHERE id=?').get(productId))throw new Error('Parent product was not found.');
    db.prepare('DELETE FROM product_variant_attribute_definitions WHERE product_id=?').run(productId);
    const add=db.prepare('INSERT INTO product_variant_attribute_definitions(product_id,attribute_name) VALUES(?,?)');for(const name of cleaned)add.run(productId,name);return cleaned;})();
}
export function enableProductVariants(productId:number){
  const db=getDatabase();return db.transaction(()=>{
    const product=db.prepare('SELECT id,has_variants,product_name AS productName,purchase_price AS purchasePrice,selling_price AS sellingPrice FROM products WHERE id=?').get(productId) as any;
    if(!product)throw new Error('Product was not found.');if(product.has_variants)return {enabled:true,defaultVariantId:null};
    const quantity=getStock(productId);let defaultVariantId:number|null=null;
    if(quantity>0){
      const result=db.prepare(`INSERT INTO product_variants(product_id,variant_name,purchase_price,selling_price,stock_quantity,is_active)
        VALUES(?,?,?,?,0,1)`).run(productId,'Default',product.purchasePrice,product.sellingPrice);
      defaultVariantId=Number(result.lastInsertRowid);
      recordStockMovement({productId,type:'ADJUSTMENT',quantity,direction:'out',notes:'Transferred to Default variant when variants were enabled'});
    }
    db.prepare("UPDATE products SET has_variants=1,updated_at=datetime('now') WHERE id=?").run(productId);
    if(defaultVariantId!=null)recordStockMovement({productId,variantId:defaultVariantId,type:'ADJUSTMENT',quantity,direction:'in',notes:'Transferred from simple product stock when variants were enabled'});
    return {enabled:true,defaultVariantId};
  })();
}
export function createVariant(productId:number,input:VariantInput){
  validate(input);const db=getDatabase();return db.transaction(()=>{
    productForVariants(productId);assertUniqueIdentifiers(input,productId);const prices=resolvedPrices(productId,input);
    const result=db.prepare(`INSERT INTO product_variants(product_id,variant_name,design_number,size,color,fabric,weight,sku,purchase_price,selling_price,stock_quantity,updated_at,packaging,pattern,brand,is_active)
      VALUES(?,?,?,?,?,?,?,?,?,?,0,datetime('now'),?,?,?,?)`).run(productId,input.variantName.trim(),optionalText(input.designNumber),optionalText(input.size),optionalText(input.color),optionalText(input.fabric),input.weight??null,optionalText(input.sku),prices.purchasePrice,prices.sellingPrice,optionalText(input.packaging),optionalText(input.pattern),optionalText(input.brand),input.isActive?1:0);
    const id=Number(result.lastInsertRowid);saveAttributes(id,normalizedAttributes(input));
    if((input.openingStock??0)>0)recordStockMovement({productId,variantId:id,type:'OPENING',quantity:input.openingStock!,direction:'in',notes:'Variant opening stock'});
    return id;
  })();
}
export function updateVariant(id:number,input:VariantInput){
  validate(input);const db=getDatabase();return db.transaction(()=>{
    const current=db.prepare('SELECT product_id AS productId FROM product_variants WHERE id=?').get(id) as {productId:number}|undefined;
    if(!current)throw new Error('Variant was not found.');productForVariants(current.productId);assertUniqueIdentifiers(input,current.productId,id);
    const prices=resolvedPrices(current.productId,input);
    db.prepare(`UPDATE product_variants SET variant_name=?,sku=?,size=?,color=?,design_number=?,fabric=?,weight=?,packaging=?,pattern=?,brand=?,purchase_price=?,selling_price=?,is_active=?,updated_at=datetime('now') WHERE id=?`)
      .run(input.variantName.trim(),optionalText(input.sku),optionalText(input.size),optionalText(input.color),optionalText(input.designNumber),optionalText(input.fabric),input.weight??null,optionalText(input.packaging),optionalText(input.pattern),optionalText(input.brand),prices.purchasePrice,prices.sellingPrice,input.isActive?1:0,id);
    saveAttributes(id,normalizedAttributes(input));
  })();
}
function withAttributes(row:any){const attributes=getDatabase().prepare('SELECT attribute_name AS name,attribute_value AS value FROM product_variant_attributes WHERE variant_id=? ORDER BY attribute_name COLLATE NOCASE').all(row.id) as {name:string;value:string}[];return {...row,attributes:Object.fromEntries(attributes.map(x=>[x.name,x.value]))};}
export function getVariantsByProduct(productId:number,filters:{search?:string;status?:string;sort?:string;direction?:string;page?:number;pageSize?:number}={}){
  productForVariants(productId);const db=getDatabase(),where=['v.product_id=?'],args:unknown[]=[productId],q=optionalText(filters.search);
  if(q){where.push("(v.variant_name LIKE ? OR COALESCE(v.sku,'') LIKE ? OR COALESCE(v.size,'') LIKE ? OR COALESCE(v.color,'') LIKE ? OR EXISTS(SELECT 1 FROM product_variant_attributes a WHERE a.variant_id=v.id AND a.attribute_value LIKE ?))");args.push(...Array(5).fill(`%${q}%`));}
  if(filters.status==='active'||filters.status==='inactive'){where.push('v.is_active=?');args.push(filters.status==='active'?1:0);}
  const sortMap:Record<string,string>={name:'v.variant_name',sku:'v.sku',price:'v.selling_price',stock:'v.stock_quantity'},order=sortMap[filters.sort||'name']||'v.variant_name',direction=filters.direction==='desc'?'DESC':'ASC';
  const page=Math.max(1,filters.page||1),pageSize=Math.min(100,Math.max(1,filters.pageSize||100)),condition=where.join(' AND ');
  const total=Number((db.prepare(`SELECT COUNT(*) AS total FROM product_variants v WHERE ${condition}`).get(...args) as {total:number}).total);
  const variants=db.prepare(`SELECT v.id,v.product_id AS productId,v.variant_name AS variantName,v.sku,v.design_number AS designNumber,v.size,v.color,v.fabric,v.weight,v.packaging,v.pattern,v.brand,v.purchase_price AS purchasePrice,v.selling_price AS sellingPrice,v.stock_quantity AS stock,v.is_active AS isActive,v.created_at AS createdAt,v.updated_at AS updatedAt FROM product_variants v WHERE ${condition} ORDER BY ${order} ${direction},v.id LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize) as any[];
  const activeTotal=Number((db.prepare('SELECT COALESCE(SUM(stock_quantity),0) AS stock FROM product_variants WHERE product_id=? AND is_active=1').get(productId) as {stock:number}).stock);
  return {rows:variants.map(withAttributes),total,page,pageSize,activeTotal};
}
export function getVariantById(id:number){const row=getDatabase().prepare(`SELECT v.id,v.product_id AS productId,v.variant_name AS variantName,v.sku,v.design_number AS designNumber,v.size,v.color,v.fabric,v.weight,v.packaging,v.pattern,v.brand,v.purchase_price AS purchasePrice,v.selling_price AS sellingPrice,v.stock_quantity AS stock,v.is_active AS isActive,v.created_at AS createdAt,v.updated_at AS updatedAt FROM product_variants v WHERE v.id=?`).get(id);if(!row)throw new Error('Variant was not found.');return {...withAttributes(row),movements:getDatabase().prepare("SELECT transaction_type AS type,quantity_in AS quantityIn,quantity_out AS quantityOut,balance_after AS balance,transaction_date AS transactionDate,notes FROM stock_transactions WHERE variant_id=? ORDER BY id DESC LIMIT 50").all(id)};}
export function searchVariants(query:string){const q=`%${query.trim()}%`;return getDatabase().prepare(`SELECT v.id,v.product_id AS productId,p.product_name AS productName,v.variant_name AS variantName,v.sku,v.size,v.color,v.stock_quantity AS stock,v.is_active AS isActive FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.variant_name LIKE ? OR COALESCE(v.sku,'') LIKE ? ORDER BY p.product_name COLLATE NOCASE,v.variant_name COLLATE NOCASE LIMIT 100`).all(q,q);}
export function deactivateVariant(id:number){if(!getDatabase().prepare("UPDATE product_variants SET is_active=0,updated_at=datetime('now') WHERE id=? AND is_active<>0").run(id).changes)throw new Error('Variant was not found or is already inactive.');}
export function deleteVariant(id:number){const db=getDatabase();return db.transaction(()=>{
  const variant=db.prepare('SELECT stock_quantity AS stock FROM product_variants WHERE id=?').get(id) as {stock:number}|undefined;if(!variant)throw new Error('Variant was not found.');
  const refs=db.prepare(`SELECT (SELECT COUNT(*) FROM sale_items WHERE variant_id=?)+(SELECT COUNT(*) FROM purchase_items WHERE variant_id=?)+(SELECT COUNT(*) FROM stock_transactions WHERE variant_id=?) AS total`).get(id,id,id) as {total:number};
  if(refs.total)throw new Error('This variant has stock or historical sales/purchases. Deactivate it to preserve history.');if(variant.stock!==0)throw new Error('A variant with stock cannot be deleted.');
  db.prepare('DELETE FROM product_variants WHERE id=?').run(id);
})();}
export function getVariantStock(variantId:number){const row=getDatabase().prepare('SELECT product_id AS productId FROM product_variants WHERE id=?').get(variantId) as {productId:number}|undefined;if(!row)throw new Error('Variant was not found.');return getStock(row.productId,variantId);}
export function getTotalProductStock(productId:number){
  const db=getDatabase(),product=db.prepare('SELECT has_variants FROM products WHERE id=?').get(productId) as {has_variants:number}|undefined;if(!product)throw new Error('Product was not found.');
  if(!product.has_variants)return getStock(productId);
  return Number((db.prepare('SELECT COALESCE(SUM(stock_quantity),0) AS stock FROM product_variants WHERE product_id=? AND is_active=1').get(productId) as {stock:number}).stock);
}
export function generateVariantCombinations(dimensions:VariantDimension[]){
  if(!Array.isArray(dimensions)||dimensions.length===0||dimensions.length>8)throw new Error('Choose between 1 and 8 attributes to generate combinations.');
  let result:Record<string,string>[]=[{}];const names=new Set<string>();
  for(const dimension of dimensions){const name=optionalText(dimension?.name);if(!name)throw new Error('Each combination attribute needs a name.');
    if(names.has(normalizeName(name)))throw new Error('Each combination attribute must be selected only once.');names.add(normalizeName(name));
    const values=[...new Set((dimension.values||[]).map(value=>value.trim()).filter(Boolean))];if(!values.length)throw new Error(`Enter values for ${name}.`);
    result=result.flatMap(combo=>values.map(value=>({...combo,[name]:value})));if(result.length>200)throw new Error('Combination generation is limited to 200 variants at a time.');
  }
  return result.map(attributes=>({attributes,variantName:Object.values(attributes).join(' / ')}));
}
export function previewVariantCombinations(productId:number,dimensions:VariantDimension[]){
  productForVariants(productId);const candidates=generateVariantCombinations(dimensions),db=getDatabase();
  const existingRows=db.prepare('SELECT id,variant_name AS variantName,design_number AS designNumber,size,color,fabric,weight,packaging,pattern,brand FROM product_variants WHERE product_id=?').all(productId) as any[];
  const existing=new Set<string>();for(const row of existingRows){const attrs=db.prepare('SELECT attribute_name AS name,attribute_value AS value FROM product_variant_attributes WHERE variant_id=?').all(row.id) as {name:string;value:string}[];existing.add(signature({...row,variantName:row.variantName,designNumber:row.designNumber,attributes:Object.fromEntries(attrs.map(x=>[x.name,x.value])),purchasePrice:0,sellingPrice:0,isActive:true}));}
  const seen=new Set<string>();return candidates.map(candidate=>{const input:VariantInput={variantName:candidate.variantName,purchasePrice:0,sellingPrice:0,isActive:true,attributes:{}};
    for(const [name,value] of Object.entries(candidate.attributes)){const field=standardFields[name.toLowerCase()]||standardFields[normalizeName(name)];if(field==='weight')input.weight=Number(value);else if(field) (input as any)[field]=value;else input.attributes![name]=value;}
    const key=signature(input),duplicate=existing.has(key)||seen.has(key);seen.add(key);return {...candidate,duplicate};
  });
}
export function createVariantBatch(productId:number,items:VariantInput[]){
  if(!Array.isArray(items)||!items.length||items.length>200)throw new Error('Choose between 1 and 200 variants to save.');
  const db=getDatabase();return db.transaction(()=>items.map(item=>createVariant(productId,item)))();
}
