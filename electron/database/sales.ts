import { getDatabase } from './database';
import { getStock, recordStockMovement } from './inventory';

export type SaleLineInput = { productId:number; variantId?:number|null; quantity:number; sellingPrice:number; discount?:number };
export type CreateSaleInput = { customerId?:number|null; items:SaleLineInput[]; invoiceDiscount?:number; paidAmount:number; paymentMethod?:string|null; notes?:string };
const methods=['Cash','UPI','Card','Bank Transfer','Credit'];
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
function lineProduct(productId:number,variantId:number|null){
  const db=getDatabase();const product=db.prepare('SELECT id,product_name AS name,unit,purchase_price AS purchasePrice,selling_price AS sellingPrice,gst_percentage AS gstPercentage,is_active AS isActive,has_variants AS hasVariants FROM products WHERE id=?').get(productId) as any;
  if(!product||!product.isActive)throw new Error('A selected product is unavailable.');
  let variant:any=null;if(product.hasVariants){if(variantId==null)throw new Error(`Choose a variant for ${product.name}.`);variant=db.prepare('SELECT id,variant_name AS name,sku,purchase_price AS purchasePrice,selling_price AS sellingPrice,is_active AS isActive FROM product_variants WHERE id=? AND product_id=?').get(variantId,productId);if(!variant||!variant.isActive)throw new Error('A selected variant is unavailable.');}
  else if(variantId!=null)throw new Error('A simple product cannot use a variant.');
  return {product,variant,stock:getStock(productId,variantId)};
}
export function getSaleConfig(){const s=getDatabase().prepare('SELECT tax_inclusive AS taxInclusive,state_code AS stateCode FROM settings ORDER BY id LIMIT 1').get() as any;return {taxInclusive:Boolean(s?.taxInclusive),stateCode:s?.stateCode||''};}
export function getSaleCustomers(){return getDatabase().prepare('SELECT id,customer_name AS name,mobile_number AS mobile,state_code AS stateCode FROM customers ORDER BY customer_name COLLATE NOCASE').all();}
export function searchSaleProducts(query:string){
  const q=query.trim();if(!q)return [];
  const rows=getDatabase().prepare(`SELECT id,product_name AS productName,sku,product_type AS productType,unit,selling_price AS sellingPrice,purchase_price AS purchasePrice,gst_percentage AS gstPercentage,has_variants AS hasVariants
    FROM products WHERE is_active=1 AND (product_name LIKE ? OR COALESCE(sku,'') LIKE ?) ORDER BY product_name COLLATE NOCASE LIMIT 30`).all(`%${q}%`,`%${q}%`) as any[];
  return rows.map(row=>({...row,stock:row.hasVariants?Number((getDatabase().prepare('SELECT COALESCE(SUM(stock_quantity),0) AS n FROM product_variants WHERE product_id=? AND is_active=1').get(row.id) as any).n):getStock(row.id)}));
}
export function getSaleVariants(productId:number){
  if(!Number.isSafeInteger(productId)||productId<=0)throw new Error('Invalid product.');
  return getDatabase().prepare(`SELECT id,variant_name AS variantName,sku,size,color,stock_quantity AS stock,
    selling_price AS sellingPrice,purchase_price AS purchasePrice FROM product_variants WHERE product_id=? AND is_active=1 ORDER BY variant_name COLLATE NOCASE`).all(productId);
}
export function createSale(input:CreateSaleInput){
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>100)throw new Error('Add between 1 and 100 sale items.');
  if(input.customerId!=null&&(!Number.isSafeInteger(input.customerId)||input.customerId<=0))throw new Error('Invalid customer.');
  if(!Number.isFinite(input.invoiceDiscount??0)||(input.invoiceDiscount??0)<0)throw new Error('Invoice discount cannot be negative.');
  if(!Number.isFinite(input.paidAmount)||input.paidAmount<0)throw new Error('Paid amount cannot be negative.');
  const db=getDatabase();
  return db.transaction(()=>{
    const settings=db.prepare('SELECT invoice_prefix AS invoicePrefix,invoice_sequence AS invoiceSequence,tax_inclusive AS taxInclusive,state_code AS stateCode FROM settings ORDER BY id LIMIT 1').get() as any;const taxInclusive=Boolean(settings?.taxInclusive);const customerState=input.customerId==null?null:(db.prepare('SELECT state_code AS code FROM customers WHERE id=?').get(input.customerId) as any)?.code||null;const placeOfSupply=customerState||settings?.stateCode||null;const interstate=Boolean(customerState&&settings?.stateCode&&customerState!==settings.stateCode);
    const prefix=String(settings?.invoicePrefix||'INV').replace(/[^A-Za-z0-9_-]/g,'').slice(0,12)||'INV';
    const next=Math.max(Number(settings?.invoiceSequence||0)+1,Number((db.prepare('SELECT COALESCE(MAX(id),0)+1 AS n FROM sales').get() as any).n));
    const invoiceNumber=`${prefix}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(next).padStart(6,'0')}`;
    const prepared=input.items.map((item)=>{
      if(!Number.isSafeInteger(item.productId)||item.productId<=0||!Number.isFinite(item.quantity)||item.quantity<=0||!Number.isFinite(item.sellingPrice)||item.sellingPrice<0||!Number.isFinite(item.discount??0)||(item.discount??0)<0)throw new Error('A sale item has invalid quantity, price or discount.');
      const {product,variant,stock}=lineProduct(item.productId,item.variantId??null);
      if(item.quantity>stock)throw new Error(`Insufficient stock for ${product.name}${variant?` / ${variant.name}`:''}. Available: ${stock}.`);
      const price=money(item.sellingPrice),raw=money(price*item.quantity),discount=money(item.discount??0);if(discount>raw)throw new Error('An item discount cannot exceed its line amount.');
      const gst=Number(product.gstPercentage),afterItem=money(raw-discount),base=taxInclusive?money(afterItem/(1+gst/100)):afterItem;
      return {item,product,variant,price,raw,discount,base,afterItem,cost:Number(variant?.purchasePrice||product.purchasePrice),gst};
    });
    const subtotal=money(prepared.reduce((sum,row)=>sum+row.raw,0)),itemDiscount=money(prepared.reduce((sum,row)=>sum+row.discount,0));
    const beforeInvoice=money(prepared.reduce((sum,row)=>sum+(taxInclusive?row.afterItem:row.base),0)),invoiceDiscount=money(input.invoiceDiscount??0);
    if(invoiceDiscount>beforeInvoice)throw new Error('Invoice discount cannot exceed the amount after item discounts.');
    const rows=prepared.map(row=>{const weight=taxInclusive?row.afterItem:row.base;const share=beforeInvoice?money(invoiceDiscount*weight/beforeInvoice):0;const taxable=taxInclusive?money(Math.max(0,row.afterItem-share)/(1+row.gst/100)):money(row.base-share);const total=taxInclusive?money(Math.max(0,row.afterItem-share)):money(taxable*(1+row.gst/100));const tax=money(total-taxable);return {...row,discount:money(row.discount+share),taxable,tax,total};});
    const taxableAmount=money(rows.reduce((sum,row)=>sum+row.taxable,0)),taxAmount=money(rows.reduce((sum,row)=>sum+row.tax,0)),totalAmount=money(rows.reduce((sum,row)=>sum+row.total,0)),discount=money(itemDiscount+invoiceDiscount);
    const cgst=interstate?0:money(taxAmount/2),sgst=interstate?0:money(taxAmount-cgst),igst=interstate?taxAmount:0;
    if(input.paidAmount>totalAmount)throw new Error('Paid amount cannot exceed the invoice total.');
    if(input.paidAmount<totalAmount&&input.customerId==null)throw new Error('Select a customer for a credit or partial payment.');
    if(input.customerId!=null&&!db.prepare('SELECT 1 FROM customers WHERE id=?').get(input.customerId))throw new Error('The selected customer was not found.');
    const method=input.paymentMethod??(input.paidAmount===0?'Credit':'Cash');if(!methods.includes(method))throw new Error('Choose a supported payment method.');
    const status=input.paidAmount===0?'unpaid':input.paidAmount<totalAmount?'partial':'paid';
    const saleId=Number(db.prepare(`INSERT INTO sales(invoice_number,customer_id,subtotal,discount,taxable_amount,cgst,sgst,igst,total_amount,paid_amount,due_amount,payment_status,payment_method,notes,place_of_supply,tax_inclusive)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(invoiceNumber,input.customerId??null,subtotal,discount,taxableAmount,cgst,sgst,igst,totalAmount,input.paidAmount,money(totalAmount-input.paidAmount),status,method,input.notes?.trim()||null,placeOfSupply,taxInclusive?1:0).lastInsertRowid);
    const add=db.prepare('INSERT INTO sale_items(sale_id,product_id,variant_id,product_name,quantity,unit,selling_price,discount,gst_percentage,tax_amount,total_amount,cost_price) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    for(const row of rows){add.run(saleId,row.product.id,row.variant?.id??null,row.product.name+(row.variant?` / ${row.variant.name}`:''),row.item.quantity,row.product.unit,row.price,row.discount,row.gst,row.tax,row.total,row.cost);recordStockMovement({productId:row.product.id,variantId:row.variant?.id??null,type:'SALE',quantity:row.item.quantity,direction:'out',referenceId:saleId,notes:`Invoice ${invoiceNumber}`});}
    if(input.paidAmount>0&&input.customerId!=null)db.prepare('INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,notes) VALUES(?,?,?,?,?)').run(input.customerId,saleId,input.paidAmount,method,`Invoice payment ${invoiceNumber}`);
    if(db.prepare('SELECT 1 FROM settings LIMIT 1').get())db.prepare('UPDATE settings SET invoice_sequence=? WHERE id=(SELECT id FROM settings ORDER BY id LIMIT 1)').run(next);
    return {id:saleId,invoiceNumber,subtotal,discount,taxableAmount,taxAmount,totalAmount,paidAmount:input.paidAmount,dueAmount:money(totalAmount-input.paidAmount),paymentStatus:status};
  })();
}
export function getSalesHistory(search=''){
  const q=`%${search.trim()}%`;return getDatabase().prepare(`SELECT s.id,s.invoice_number AS invoiceNumber,s.sale_date AS saleDate,COALESCE(c.customer_name,'Walk-in customer') AS customerName,s.total_amount AS totalAmount,s.paid_amount AS paidAmount,s.due_amount AS dueAmount,s.payment_status AS paymentStatus
    FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.invoice_number LIKE ? OR COALESCE(c.customer_name,'') LIKE ? ORDER BY s.sale_date DESC,s.id DESC LIMIT 200`).all(q,q);
}
export function getSaleById(id:number){
  const db=getDatabase();const sale=db.prepare(`SELECT s.id,s.invoice_number AS invoiceNumber,s.sale_date AS saleDate,s.customer_id AS customerId,COALESCE(c.customer_name,'Walk-in customer') AS customerName,c.mobile_number AS mobile,c.address,c.gstin,s.subtotal,s.discount,s.taxable_amount AS taxableAmount,s.cgst,s.sgst,s.igst,s.total_amount AS totalAmount,s.paid_amount AS paidAmount,s.due_amount AS dueAmount,s.payment_status AS paymentStatus,s.payment_method AS paymentMethod,s.notes,s.place_of_supply AS placeOfSupply,s.tax_inclusive AS taxInclusive,shop.shop_name AS shopName,shop.shop_address AS shopAddress,shop.mobile_number AS shopMobile,shop.gstin AS shopGstin,shop.logo_path AS shopLogo,shop.invoice_format AS invoiceFormat FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN settings shop ON shop.id=1 WHERE s.id=?`).get(id) as any;
  if(!sale)throw new Error('Sale was not found.');sale.items=db.prepare('SELECT product_name AS productName,quantity,unit,selling_price AS sellingPrice,discount,gst_percentage AS gstPercentage,tax_amount AS taxAmount,total_amount AS totalAmount FROM sale_items WHERE sale_id=? ORDER BY id').all(id);return sale;
}
