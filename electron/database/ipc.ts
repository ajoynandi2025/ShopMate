import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackup, listBackups, chooseAndRestoreBackup, createDailyBackup } from './backup';
import { getDatabaseStatus } from './database';
import { getStock, recordStockMovement, getInventoryOverview, getInventoryMovements, type StockTransactionType } from './inventory';
import { getDashboardData, type AnalyticsRange } from './dashboard';
import { createCategory, updateCategory, getCategories, deleteCategory, createProduct, updateProduct, getProducts, getProductById, deactivateProduct, deleteProduct, getProductStock, chooseProductImage, previewProductImport, importProducts } from './catalog';
import { getSettings, updateSettings } from './settings';
import { getBusinessReport, type ReportKind } from './reports';
import { listExpenses, expenseSummary, saveExpense, deleteExpense, EXPENSE_CATEGORIES } from './expenses';
import { listParties, saveParty, getPartyLedger, collectPartyPayment, type PartyKind } from './parties';
import { createPurchase, getPurchaseById, getPurchasesHistory, getPurchaseSuppliers, searchPurchaseProducts } from './purchases';
import { createSale, getSaleById, getSalesHistory, getSaleCustomers, getSaleConfig, searchSaleProducts, getSaleVariants } from './sales';
import { createVariant, updateVariant, getVariantsByProduct, getVariantById, searchVariants, deactivateVariant, deleteVariant, getVariantStock, getTotalProductStock, setVariantAttributesForProduct, getVariantAttributesForProduct, enableProductVariants, generateVariantCombinations, previewVariantCombinations, createVariantBatch } from './variants';

import { getAuthStatus, getCurrentSession, setupAdmin, login, logout, listUsers, saveUser, setUserActive, changePassword } from './security';

let registered = false;

function assertTrustedSender(event: IpcMainInvokeEvent, allowUnauthenticated=false, adminOnly=false): void {
  const url = event.senderFrame?.url;
  if (!url) throw new Error('Untrusted IPC sender.');
  let sender: URL;
  try { sender = new URL(url); } catch { throw new Error('Untrusted IPC sender.'); }
  if (app.isPackaged) {
    const expectedPath = path.resolve(__dirname, '../../dist/index.html');
    if (sender.protocol !== 'file:' || path.resolve(fileURLToPath(sender)).toLowerCase() !== expectedPath.toLowerCase()) throw new Error('Untrusted IPC sender.');
  } else if (sender.origin !== 'http://127.0.0.1:5173' || sender.pathname !== '/') {
    throw new Error('Untrusted IPC sender.');
  }
  if(!allowUnauthenticated){const session=getCurrentSession();if(!session)throw new Error('Sign in to continue.');if(adminOnly&&session.role!=='admin')throw new Error('Administrator access is required.');}
}

export function registerDatabaseIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle('auth:status',(event)=>{assertTrustedSender(event,true);return getAuthStatus();});
  ipcMain.handle('auth:setup',(event,input:unknown)=>{assertTrustedSender(event,true);if(!input||typeof input!=='object')throw new Error('Invalid administrator details.');return setupAdmin(input as any);});
  ipcMain.handle('auth:login',(event,input:unknown)=>{assertTrustedSender(event,true);if(!input||typeof input!=='object')throw new Error('Invalid credentials.');return login(input as any);});
  ipcMain.handle('auth:logout',(event)=>{assertTrustedSender(event,true);logout();});
  ipcMain.handle('auth:change-password',(event,oldPassword:unknown,newPassword:unknown)=>{assertTrustedSender(event);if(typeof oldPassword!=='string'||typeof newPassword!=='string')throw new Error('Invalid password change.');changePassword(oldPassword,newPassword);});
  ipcMain.handle('users:list',(event)=>{assertTrustedSender(event,false,true);return listUsers();});
  ipcMain.handle('users:save',(event,id:unknown,input:unknown)=>{assertTrustedSender(event,false,true);if((id!==null&&!Number.isSafeInteger(id))||!input||typeof input!=='object')throw new Error('Invalid user.');return saveUser(id as number|null,input as any);});
  ipcMain.handle('users:active',(event,id:unknown,active:unknown)=>{assertTrustedSender(event,false,true);if(!Number.isSafeInteger(id)||typeof active!=='boolean')throw new Error('Invalid user update.');return setUserActive(id as number,active);});
  ipcMain.handle('database:get-status', (event) => { assertTrustedSender(event); return getDatabaseStatus(); });
  ipcMain.handle('database:create-backup', (event) => { assertTrustedSender(event,false,true); return createBackup(); });
  ipcMain.handle('database:list-backups',(event)=>{assertTrustedSender(event,false,true);return listBackups();});
  ipcMain.handle('database:restore-backup',(event)=>{assertTrustedSender(event,false,true);return chooseAndRestoreBackup();});
  ipcMain.handle('inventory:get-overview',(event,search:unknown='')=>{assertTrustedSender(event,false,true);if(typeof search!=='string'||search.length>100)throw new Error('Invalid inventory search.');return getInventoryOverview(search);});
  ipcMain.handle('inventory:get-movements',(event,search:unknown='')=>{assertTrustedSender(event,false,true);if(typeof search!=='string'||search.length>100)throw new Error('Invalid inventory search.');return getInventoryMovements(search);});
  ipcMain.handle('inventory:get-stock', (event, productId: unknown, variantId?: unknown) => {
    assertTrustedSender(event);
    if (!Number.isSafeInteger(productId) || (variantId !== undefined && variantId !== null && !Number.isSafeInteger(variantId))) throw new Error('Invalid inventory identifiers.');
    return getStock(productId as number, variantId as number | null | undefined);
  });
  ipcMain.handle('inventory:record-movement', (event, raw: unknown) => {
    assertTrustedSender(event);
    if (!raw || typeof raw !== 'object') throw new Error('Invalid stock movement.');
    const value = raw as Record<string, unknown>;
    const allowed = ['OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT', 'DAMAGE'];
    if (!Number.isSafeInteger(value.productId) || (value.variantId != null && !Number.isSafeInteger(value.variantId)) ||
        typeof value.quantity !== 'number' || !Number.isFinite(value.quantity) || value.quantity <= 0 ||
        !['in', 'out'].includes(String(value.direction)) || !allowed.includes(String(value.type)) ||
        (value.notes != null && typeof value.notes !== 'string') || (value.referenceId != null && !Number.isSafeInteger(value.referenceId)) ||
        (value.transactionDate != null && typeof value.transactionDate !== 'string')) throw new Error('Invalid stock movement.');
    return recordStockMovement({
      productId: value.productId as number, variantId: value.variantId as number | null | undefined,
      type: value.type as StockTransactionType, quantity: value.quantity, direction: value.direction as 'in' | 'out',
      referenceId: value.referenceId as number | null | undefined, notes: value.notes as string | undefined,
      transactionDate: value.transactionDate as string | undefined,
    });
  });
  ipcMain.handle('dashboard:get-data', (event, rawRange: unknown) => {
    assertTrustedSender(event);
    if (rawRange !== '7d' && rawRange !== '30d' && rawRange !== '12m') throw new Error('Invalid dashboard range.');
    return getDashboardData(rawRange as AnalyticsRange);
  });
  ipcMain.handle('catalog:get-categories', (event, search: unknown) => { assertTrustedSender(event); if(typeof search!=='string') throw new Error('Invalid search.'); return getCategories(search); });
  ipcMain.handle('catalog:create-category', (event, input: unknown) => { assertTrustedSender(event,false,true); if(!input||typeof input!=='object') throw new Error('Invalid category.'); return createCategory(input as any); });
  ipcMain.handle('catalog:update-category', (event, id: unknown,input: unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id)||!input||typeof input!=='object') throw new Error('Invalid category.'); return updateCategory(id as number,input as any); });
  ipcMain.handle('catalog:delete-category', (event,id: unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id)) throw new Error('Invalid category.'); return deleteCategory(id as number); });
  ipcMain.handle('catalog:get-products', (event, filters: unknown) => { assertTrustedSender(event); if(!filters||typeof filters!=='object') throw new Error('Invalid product filters.'); return getProducts(filters as any); });
  ipcMain.handle('catalog:get-product', (event,id: unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(id)) throw new Error('Invalid product.'); return getProductById(id as number); });
  ipcMain.handle('catalog:create-product', (event,input: unknown) => { assertTrustedSender(event,false,true); if(!input||typeof input!=='object') throw new Error('Invalid product.'); return createProduct(input as any); });
  ipcMain.handle('catalog:update-product', (event,id: unknown,input: unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id)||!input||typeof input!=='object') throw new Error('Invalid product.'); return updateProduct(id as number,input as any); });
  ipcMain.handle('catalog:deactivate-product', (event,id: unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id)) throw new Error('Invalid product.'); return deactivateProduct(id as number); });
  ipcMain.handle('catalog:delete-product', (event,id: unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id)) throw new Error('Invalid product.'); return deleteProduct(id as number); });
  ipcMain.handle('catalog:get-stock', (event,id: unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(id)) throw new Error('Invalid product.'); return getProductStock(id as number); });
  ipcMain.handle('catalog:choose-image', (event) => { assertTrustedSender(event,false,true); return chooseProductImage(); });
  ipcMain.handle('catalog:preview-import', (event,fileName:unknown,rawBytes:unknown) => {
    assertTrustedSender(event);
    if(typeof fileName!=='string'||!(rawBytes instanceof Uint8Array)) throw new Error('Invalid import file.');
    return previewProductImport(fileName,rawBytes);
  });
  ipcMain.handle('catalog:import-products', (event,rawRows:unknown) => {
    assertTrustedSender(event);
    if(!Array.isArray(rawRows)||rawRows.length>1000||rawRows.some(row=>!row||typeof row!=='object'||!Number.isSafeInteger(row.rowNumber)||!row.product||typeof row.product!=='object')) throw new Error('Invalid product import rows.');
    return importProducts(rawRows as any);
  });
  ipcMain.handle('settings:get',(event)=>{assertTrustedSender(event);return getSettings();});
  ipcMain.handle('settings:update',(event,input:unknown)=>{assertTrustedSender(event,false,true);if(!input||typeof input!=='object')throw new Error('Invalid settings.');return updateSettings(input);});
  ipcMain.handle('reports:get',(event,kind:unknown,from:unknown,to:unknown)=>{assertTrustedSender(event,false,true);if(!['sales','purchases','profit-loss','gst'].includes(String(kind))||typeof from!=='string'||typeof to!=='string')throw new Error('Invalid report request.');return getBusinessReport(kind as ReportKind,from,to);});
  ipcMain.handle('expenses:list',(event,search:unknown='',from:unknown='',to:unknown='')=>{assertTrustedSender(event,false,true);if(typeof search!=='string'||typeof from!=='string'||typeof to!=='string')throw new Error('Invalid expense search.');return listExpenses(search,from,to);});
  ipcMain.handle('expenses:summary',(event,from:unknown='',to:unknown='')=>{assertTrustedSender(event,false,true);if(typeof from!=='string'||typeof to!=='string')throw new Error('Invalid expense date range.');return expenseSummary(from,to);});
  ipcMain.handle('expenses:categories',(event)=>{assertTrustedSender(event,false,true);return EXPENSE_CATEGORIES;});
  ipcMain.handle('expenses:save',(event,id:unknown,input:unknown)=>{assertTrustedSender(event,false,true);if((id!==null&&!Number.isSafeInteger(id))||!input||typeof input!=='object')throw new Error('Invalid expense.');return saveExpense(id as number|null,input as any);});
  ipcMain.handle('expenses:delete',(event,id:unknown)=>{assertTrustedSender(event,false,true);if(!Number.isSafeInteger(id))throw new Error('Invalid expense.');return deleteExpense(id as number);});
  ipcMain.handle('parties:list',(event,kind:unknown,search:unknown='')=>{assertTrustedSender(event,false,true);if(!['customer','supplier'].includes(String(kind))||typeof search!=='string'||search.length>100)throw new Error('Invalid party request.');return listParties(kind as PartyKind,search);});
  ipcMain.handle('parties:save',(event,kind:unknown,id:unknown,input:unknown)=>{assertTrustedSender(event,false,true);if(!['customer','supplier'].includes(String(kind))||(id!==null&&!Number.isSafeInteger(id))||!input||typeof input!=='object')throw new Error('Invalid party record.');return saveParty(kind as PartyKind,id as number|null,input as any);});
  ipcMain.handle('parties:ledger',(event,kind:unknown,id:unknown)=>{assertTrustedSender(event,false,true);if(!['customer','supplier'].includes(String(kind))||!Number.isSafeInteger(id))throw new Error('Invalid ledger request.');return getPartyLedger(kind as PartyKind,id as number);});
  ipcMain.handle('parties:payment',(event,kind:unknown,id:unknown,amount:unknown,method:unknown,notes:unknown='')=>{assertTrustedSender(event,false,true);if(!['customer','supplier'].includes(String(kind))||!Number.isSafeInteger(id)||typeof amount!=='number'||typeof method!=='string'||typeof notes!=='string')throw new Error('Invalid payment.');return collectPartyPayment(kind as PartyKind,id as number,amount,method,notes);});
  ipcMain.handle('purchases:suppliers',(event)=>{assertTrustedSender(event,false,true);return getPurchaseSuppliers();});
  ipcMain.handle('purchases:search-products',(event,query:unknown)=>{assertTrustedSender(event,false,true);if(typeof query!=='string'||query.length>100)throw new Error('Invalid product search.');return searchPurchaseProducts(query);});
  ipcMain.handle('purchases:create',(event,input:unknown)=>{assertTrustedSender(event,false,true);if(!input||typeof input!=='object')throw new Error('Invalid purchase.');return createPurchase(input as any);});
  ipcMain.handle('purchases:history',(event,search:unknown='')=>{assertTrustedSender(event,false,true);if(typeof search!=='string'||search.length>100)throw new Error('Invalid purchase search.');return getPurchasesHistory(search);});
  ipcMain.handle('purchases:get',(event,id:unknown)=>{assertTrustedSender(event,false,true);if(!Number.isSafeInteger(id))throw new Error('Invalid purchase.');return getPurchaseById(id as number);});
  ipcMain.handle('sales:config',(event)=>{assertTrustedSender(event);return getSaleConfig();});
  ipcMain.handle('sales:customers', (event) => { assertTrustedSender(event); return getSaleCustomers(); });
  ipcMain.handle('sales:search-products', (event, query:unknown) => { assertTrustedSender(event); if(typeof query!=='string'||query.length>100)throw new Error('Invalid product search.'); return searchSaleProducts(query); });
  ipcMain.handle('sales:variants', (event, productId:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(productId))throw new Error('Invalid product.'); return getSaleVariants(productId as number); });
  ipcMain.handle('sales:create', (event, input:unknown) => { assertTrustedSender(event); if(!input||typeof input!=='object')throw new Error('Invalid sale.'); return createSale(input as any); });
  ipcMain.handle('sales:history', (event, search:unknown) => { assertTrustedSender(event); if(typeof search!=='string'||search.length>100)throw new Error('Invalid sales search.'); return getSalesHistory(search); });
  ipcMain.handle('sales:get', (event, id:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(id))throw new Error('Invalid sale.'); return getSaleById(id as number); });
  ipcMain.handle('variants:enable', (event,productId:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(productId))throw new Error('Invalid product.'); return enableProductVariants(productId as number); });
  ipcMain.handle('variants:create', (event,productId:unknown,input:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(productId)||!input||typeof input!=='object')throw new Error('Invalid variant.'); return createVariant(productId as number,input as any); });
  ipcMain.handle('variants:update', (event,id:unknown,input:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id)||!input||typeof input!=='object')throw new Error('Invalid variant.'); return updateVariant(id as number,input as any); });
  ipcMain.handle('variants:get-by-product', (event,productId:unknown,filters:unknown={}) => { assertTrustedSender(event); if(!Number.isSafeInteger(productId)||!filters||typeof filters!=='object')throw new Error('Invalid variant request.'); return getVariantsByProduct(productId as number,filters as any); });
  ipcMain.handle('variants:get', (event,id:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(id))throw new Error('Invalid variant.'); return getVariantById(id as number); });
  ipcMain.handle('variants:search', (event,query:unknown) => { assertTrustedSender(event); if(typeof query!=='string')throw new Error('Invalid variant search.'); return searchVariants(query); });
  ipcMain.handle('variants:deactivate', (event,id:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id))throw new Error('Invalid variant.'); return deactivateVariant(id as number); });
  ipcMain.handle('variants:delete', (event,id:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(id))throw new Error('Invalid variant.'); return deleteVariant(id as number); });
  ipcMain.handle('variants:get-stock', (event,id:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(id))throw new Error('Invalid variant.'); return getVariantStock(id as number); });
  ipcMain.handle('variants:get-product-stock', (event,id:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(id))throw new Error('Invalid product.'); return getTotalProductStock(id as number); });
  ipcMain.handle('variants:get-attributes', (event,productId:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(productId))throw new Error('Invalid product.'); return getVariantAttributesForProduct(productId as number); });
  ipcMain.handle('variants:set-attributes', (event,productId:unknown,names:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(productId)||!Array.isArray(names)||names.some(x=>typeof x!=='string'))throw new Error('Invalid variant attributes.'); return setVariantAttributesForProduct(productId as number,names as string[]); });
  ipcMain.handle('variants:generate-combinations', (event,dimensions:unknown) => { assertTrustedSender(event); if(!Array.isArray(dimensions)||dimensions.some(d=>!d||typeof d!=='object'||typeof d.name!=='string'||!Array.isArray(d.values)||d.values.some((v:unknown)=>typeof v!=='string')))throw new Error('Invalid variant combination attributes.'); return generateVariantCombinations(dimensions as any); });
  ipcMain.handle('variants:preview-combinations', (event,productId:unknown,dimensions:unknown) => { assertTrustedSender(event); if(!Number.isSafeInteger(productId)||!Array.isArray(dimensions)||dimensions.some(d=>!d||typeof d!=='object'||typeof d.name!=='string'||!Array.isArray(d.values)||d.values.some((v:unknown)=>typeof v!=='string')))throw new Error('Invalid variant combination preview.'); return previewVariantCombinations(productId as number,dimensions as any); });
  ipcMain.handle('variants:create-batch', (event,productId:unknown,items:unknown) => { assertTrustedSender(event,false,true); if(!Number.isSafeInteger(productId)||!Array.isArray(items))throw new Error('Invalid variant batch.'); return createVariantBatch(productId as number,items as any); });
}
