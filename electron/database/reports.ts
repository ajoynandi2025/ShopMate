import { getDatabase } from './database';
export type ReportKind='sales'|'purchases'|'profit-loss'|'gst';
export function getBusinessReport(kind:ReportKind,from:string,to:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new Error('Choose a valid date range.');const db=getDatabase();
 if(kind==='sales'){
 const summary=db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(subtotal),0) AS gross,COALESCE(SUM(discount),0) AS discounts,COALESCE(SUM(taxable_amount),0) AS taxable,COALESCE(SUM(cgst+sgst+igst),0) AS tax,COALESCE(SUM(total_amount),0) AS total,COALESCE(SUM(paid_amount),0) AS paid,COALESCE(SUM(due_amount),0) AS due FROM sales WHERE date(sale_date) BETWEEN date(?) AND date(?)`).get(from,to);
 const rows=db.prepare(`SELECT si.product_name AS productName,SUM(si.quantity) AS quantity,si.unit,COALESCE(SUM(si.total_amount),0) AS total,COALESCE(SUM(si.tax_amount),0) AS tax FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE date(s.sale_date) BETWEEN date(?) AND date(?) GROUP BY si.product_name,si.unit ORDER BY total DESC`).all(from,to);return {summary,rows};}
 if(kind==='purchases'){
 const summary=db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(subtotal),0) AS subtotal,COALESCE(SUM(discount),0) AS discounts,COALESCE(SUM(tax_amount),0) AS tax,COALESCE(SUM(total_amount),0) AS total,COALESCE(SUM(paid_amount),0) AS paid,COALESCE(SUM(due_amount),0) AS due FROM purchases WHERE date(purchase_date) BETWEEN date(?) AND date(?)').get(from,to);
 const rows=db.prepare(`SELECT COALESCE(s.supplier_name,'Unassigned') AS supplier,pi.product_id,pi.product_name AS productName,pi.variant_name AS variantName,SUM(pi.quantity) AS quantity,COALESCE(SUM(pi.total_amount),0) AS total FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id LEFT JOIN suppliers s ON s.id=pu.supplier_id WHERE date(pu.purchase_date) BETWEEN date(?) AND date(?) GROUP BY s.supplier_name,pi.product_id,p.product_name ORDER BY total DESC`).all(from,to);return {summary,rows};}
 if(kind==='gst'){
 const sales=db.prepare('SELECT COALESCE(SUM(taxable_amount),0) AS taxable,COALESCE(SUM(cgst),0) AS cgst,COALESCE(SUM(sgst),0) AS sgst,COALESCE(SUM(igst),0) AS igst FROM sales WHERE date(sale_date) BETWEEN date(?) AND date(?)').get(from,to) as any;
 const purchases=db.prepare('SELECT COALESCE(SUM(tax_amount),0) AS tax FROM purchases WHERE date(purchase_date) BETWEEN date(?) AND date(?)').get(from,to);return {summary:{...sales,purchaseTax:(purchases as any).tax,netTax:Number((sales as any).cgst)+Number((sales as any).sgst)+Number((sales as any).igst)-Number((purchases as any).tax)},rows:[]};}
 const sales=db.prepare('SELECT COALESCE(SUM(subtotal-discount),0) AS netSales FROM sales WHERE date(sale_date) BETWEEN date(?) AND date(?)').get(from,to) as any;
 const cogs=db.prepare('SELECT COALESCE(SUM(si.quantity*si.cost_price),0) AS cogs FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE date(s.sale_date) BETWEEN date(?) AND date(?)').get(from,to) as any;
 const expenses=db.prepare('SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE is_deleted=0 AND date(expense_date) BETWEEN date(?) AND date(?)').get(from,to) as any;
 const purchases=db.prepare(`SELECT COALESCE(SUM(total_amount),0) AS total FROM purchases WHERE date(purchase_date) BETWEEN date(?) AND date(?)`).get(from,to) as any;
 return {summary:{netSales:Number(sales.netSales),cogs:Number(cogs.cogs),grossProfit:Number(sales.netSales)-Number(cogs.cogs),expenses:Number(expenses.expenses),netProfit:Number(sales.netSales)-Number(cogs.cogs)-Number(expenses.expenses),purchases:Number(purchases.total)},rows:[]};
}
