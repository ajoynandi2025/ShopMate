import { getDatabase } from './database';
export type PartyKind='customer'|'supplier';
export function listParties(kind:PartyKind,search=''){
 const db=getDatabase(),q=`%${search.trim()}%`;
 if(kind==='customer')return db.prepare(`SELECT c.id,c.customer_name AS name,c.mobile_number AS mobile,c.address,c.gstin,c.opening_balance AS openingBalance,
 c.opening_balance+COALESCE((SELECT SUM(s.due_amount) FROM sales s WHERE s.customer_id=c.id),0)-COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id=c.id AND cp.sale_id IS NULL),0) AS balance,
 COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id=c.id),0) AS totalBusiness
 FROM customers c WHERE c.customer_name LIKE ? OR COALESCE(c.mobile_number,'') LIKE ? ORDER BY c.customer_name COLLATE NOCASE`).all(q,q);
 return db.prepare(`SELECT s.id,s.supplier_name AS name,s.mobile_number AS mobile,s.address,s.gstin,s.opening_balance AS openingBalance,
 s.opening_balance+COALESCE((SELECT SUM(p.due_amount) FROM purchases p WHERE p.supplier_id=s.id),0)-COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id=s.id AND sp.purchase_id IS NULL),0) AS balance,
 COALESCE((SELECT SUM(p.total_amount) FROM purchases p WHERE p.supplier_id=s.id),0) AS totalBusiness
 FROM suppliers s WHERE s.supplier_name LIKE ? OR COALESCE(s.mobile_number,'') LIKE ? ORDER BY s.supplier_name COLLATE NOCASE`).all(q,q);
}
export function saveParty(kind:PartyKind,id:number|null,input:{name:string;mobile?:string;address?:string;gstin?:string;stateCode?:string}){
 if(!input.name?.trim())throw new Error('Name is required.');const db=getDatabase(),table=kind==='customer'?'customers':'suppliers',field=kind==='customer'?'customer_name':'supplier_name';
 if(input.stateCode&& !/^\d{2}$/.test(input.stateCode))throw new Error('State code must contain two digits.');
 if(id==null)return Number(db.prepare(`INSERT INTO ${table}(${field},mobile_number,address,gstin,state_code) VALUES(?,?,?,?,?)`).run(input.name.trim(),input.mobile?.trim()||null,input.address?.trim()||null,input.gstin?.trim()||null,input.stateCode?.trim()||null).lastInsertRowid);
 if(!db.prepare(`UPDATE ${table} SET ${field}=?,mobile_number=?,address=?,gstin=?,state_code=?,updated_at=datetime('now') WHERE id=?`).run(input.name.trim(),input.mobile?.trim()||null,input.address?.trim()||null,input.gstin?.trim()||null,input.stateCode?.trim()||null,id).changes)throw new Error('Record was not found.');
}
export function getPartyLedger(kind:PartyKind,id:number){
 const db=getDatabase();if(kind==='customer'){
 const party=db.prepare('SELECT customer_name AS name,mobile_number AS mobile,address,gstin,opening_balance AS openingBalance FROM customers WHERE id=?').get(id) as any;if(!party)throw new Error('Customer was not found.');
 const entries=db.prepare(`SELECT s.sale_date AS date,'SALE' AS type,s.invoice_number AS reference,s.total_amount AS debit,0 AS credit,s.due_amount AS balance FROM sales s WHERE s.customer_id=? UNION ALL SELECT cp.payment_date,'PAYMENT',COALESCE(s.invoice_number,'Advance payment'),0,cp.amount,0 FROM customer_payments cp LEFT JOIN sales s ON s.id=cp.sale_id WHERE cp.customer_id=? ORDER BY date DESC`).all(id,id);return {party,entries};}
 const party=db.prepare('SELECT supplier_name AS name,mobile_number AS mobile,address,gstin,opening_balance AS openingBalance FROM suppliers WHERE id=?').get(id) as any;if(!party)throw new Error('Supplier was not found.');const entries=db.prepare(`SELECT p.purchase_date AS date,'PURCHASE' AS type,p.purchase_number AS reference,0 AS debit,p.total_amount AS credit,p.due_amount AS balance FROM purchases p WHERE p.supplier_id=? UNION ALL SELECT sp.payment_date,'PAYMENT',COALESCE(p.purchase_number,'Payment'),sp.amount,0,0 FROM supplier_payments sp LEFT JOIN purchases p ON p.id=sp.purchase_id WHERE sp.supplier_id=? ORDER BY date DESC`).all(id,id);return {party,entries};
}
export function collectPartyPayment(kind:PartyKind,id:number,amount:number,method:string,notes=''){
 if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(amount)||amount<=0)throw new Error('Enter a valid payment amount.');if(!['Cash','UPI','Card','Bank Transfer'].includes(method))throw new Error('Choose a supported payment method.');const db=getDatabase();
 return db.transaction(()=>{
 const table=kind==='customer'?'customers':'suppliers',payments=kind==='customer'?'customer_payments':'supplier_payments',parent=kind==='customer'?'customer_id':'supplier_id',debtTable=kind==='customer'?'sales':'purchases',dateColumn=kind==='customer'?'sale_date':'purchase_date',debtFk=kind==='customer'?'customer_id':'supplier_id',balanceSql=`SELECT opening_balance+COALESCE((SELECT SUM(due_amount) FROM ${debtTable} WHERE ${debtFk}=?),0)-COALESCE((SELECT SUM(amount) FROM ${payments} WHERE ${parent}=? AND ${kind==='customer'?'sale_id':'purchase_id'} IS NULL),0) AS balance FROM ${table} WHERE id=?`;
 const row=db.prepare(balanceSql).get(id,id,id) as any;if(!row)throw new Error(`${kind==='customer'?'Customer':'Supplier'} was not found.`);if(amount>Number(row.balance)+0.001)throw new Error('Payment cannot exceed the outstanding balance.');
 let remaining=amount;const debts=db.prepare(`SELECT id,due_amount AS due,paid_amount AS paid,total_amount AS total FROM ${debtTable} WHERE ${debtFk}=? AND due_amount>0 ORDER BY ${dateColumn},id`).all(id) as any[];
 for(const debt of debts){if(remaining<=0)break;const applied=Math.min(remaining,Number(debt.due));if(kind==='customer')db.prepare('INSERT INTO customer_payments(customer_id,sale_id,amount,payment_method,notes) VALUES(?,?,?,?,?)').run(id,debt.id,applied,method,notes||'Payment collected');else db.prepare('INSERT INTO supplier_payments(supplier_id,purchase_id,amount,payment_method,notes) VALUES(?,?,?,?,?)').run(id,debt.id,applied,method,notes||'Payment recorded');db.prepare(`UPDATE ${debtTable} SET paid_amount=paid_amount+?,due_amount=MAX(0,due_amount-?),payment_status=CASE WHEN due_amount-?<=0 THEN 'paid' ELSE 'partial' END WHERE id=?`).run(applied,applied,applied,debt.id);remaining-=applied;}
 if(remaining>0){if(kind==='customer')db.prepare('INSERT INTO customer_payments(customer_id,amount,payment_method,notes) VALUES(?,?,?,?)').run(id,remaining,method,notes||'Opening balance payment');else db.prepare('INSERT INTO supplier_payments(supplier_id,amount,payment_method,notes) VALUES(?,?,?,?)').run(id,remaining,method,notes||'Opening balance payment');}
 return {paid:amount,balanceAfter:Number(row.balance)-amount};
 })();
}
