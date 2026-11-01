import { contextBridge, ipcRenderer } from 'electron';
import type { AnalyticsRange, DashboardData } from './database/dashboard';

export type StockMovementInput = {
  productId: number;
  variantId?: number | null;
  type: 'OPENING' | 'PURCHASE' | 'SALE' | 'SALE_RETURN' | 'PURCHASE_RETURN' | 'ADJUSTMENT' | 'DAMAGE';
  quantity: number;
  direction: 'in' | 'out';
  referenceId?: number | null;
  notes?: string;
  transactionDate?: string;
};

contextBridge.exposeInMainWorld('shopmate', {
  auth: { status:()=>ipcRenderer.invoke('auth:status'), setup:(input:unknown)=>ipcRenderer.invoke('auth:setup',input), login:(input:unknown)=>ipcRenderer.invoke('auth:login',input), logout:()=>ipcRenderer.invoke('auth:logout'), changePassword:(oldPassword:string,newPassword:string)=>ipcRenderer.invoke('auth:change-password',oldPassword,newPassword) },
  users: { list:()=>ipcRenderer.invoke('users:list'), save:(id:number|null,input:unknown)=>ipcRenderer.invoke('users:save',id,input), setActive:(id:number,active:boolean)=>ipcRenderer.invoke('users:active',id,active) },
  database: {
    getStatus: () => ipcRenderer.invoke('database:get-status'),
    createBackup: () => ipcRenderer.invoke('database:create-backup'),
    listBackups: () => ipcRenderer.invoke('database:list-backups'),
    restoreBackup: () => ipcRenderer.invoke('database:restore-backup'),
  },
  inventory: {
    getOverview: (search='') => ipcRenderer.invoke('inventory:get-overview',search),
    getMovements: (search='') => ipcRenderer.invoke('inventory:get-movements',search),
    getStock: (productId: number, variantId?: number | null) => ipcRenderer.invoke('inventory:get-stock', productId, variantId),
    recordMovement: (movement: StockMovementInput) => ipcRenderer.invoke('inventory:record-movement', movement),
  },
  dashboard: {
    getData: (range: AnalyticsRange) => ipcRenderer.invoke('dashboard:get-data', range) as Promise<DashboardData>,
  },
  catalog: {
    getCategories: (search = '') => ipcRenderer.invoke('catalog:get-categories', search),
    createCategory: (input: unknown) => ipcRenderer.invoke('catalog:create-category', input),
    updateCategory: (id: number, input: unknown) => ipcRenderer.invoke('catalog:update-category', id, input),
    deleteCategory: (id: number) => ipcRenderer.invoke('catalog:delete-category', id),
    getProducts: (filters: unknown) => ipcRenderer.invoke('catalog:get-products', filters),
    getProduct: (id: number) => ipcRenderer.invoke('catalog:get-product', id),
    createProduct: (input: unknown) => ipcRenderer.invoke('catalog:create-product', input),
    updateProduct: (id: number, input: unknown) => ipcRenderer.invoke('catalog:update-product', id, input),
    deactivateProduct: (id: number) => ipcRenderer.invoke('catalog:deactivate-product', id),
    deleteProduct: (id: number) => ipcRenderer.invoke('catalog:delete-product', id),
    getStock: (id: number) => ipcRenderer.invoke('catalog:get-stock', id),
    chooseImage: () => ipcRenderer.invoke('catalog:choose-image'),
    previewImport: (fileName: string, bytes: Uint8Array) => ipcRenderer.invoke('catalog:preview-import', fileName, bytes),
    importProducts: (rows: unknown[]) => ipcRenderer.invoke('catalog:import-products', rows),
  },
  settings: { get:()=>ipcRenderer.invoke('settings:get'), update:(input:unknown)=>ipcRenderer.invoke('settings:update',input) },
  reports: { get:(kind:'sales'|'purchases'|'profit-loss'|'gst',from:string,to:string)=>ipcRenderer.invoke('reports:get',kind,from,to) },
  expenses: { list:(search?:string,from?:string,to?:string)=>ipcRenderer.invoke('expenses:list',search,from,to), summary:(from?:string,to?:string)=>ipcRenderer.invoke('expenses:summary',from,to), categories:()=>ipcRenderer.invoke('expenses:categories'), save:(id:number|null,input:unknown)=>ipcRenderer.invoke('expenses:save',id,input), delete:(id:number)=>ipcRenderer.invoke('expenses:delete',id) },
  parties: { list:(kind:'customer'|'supplier',search='')=>ipcRenderer.invoke('parties:list',kind,search), save:(kind:'customer'|'supplier',id:number|null,input:unknown)=>ipcRenderer.invoke('parties:save',kind,id,input), ledger:(kind:'customer'|'supplier',id:number)=>ipcRenderer.invoke('parties:ledger',kind,id), payment:(kind:'customer'|'supplier',id:number,amount:number,method:string,notes='')=>ipcRenderer.invoke('parties:payment',kind,id,amount,method,notes) },
  purchases: { suppliers:()=>ipcRenderer.invoke('purchases:suppliers'), searchProducts:(query:string)=>ipcRenderer.invoke('purchases:search-products',query), create:(input:unknown)=>ipcRenderer.invoke('purchases:create',input), history:(search?:string)=>ipcRenderer.invoke('purchases:history',search), get:(id:number)=>ipcRenderer.invoke('purchases:get',id) },
  sales: {
    config: () => ipcRenderer.invoke('sales:config'),
    customers: () => ipcRenderer.invoke('sales:customers'),
    searchProducts: (query:string) => ipcRenderer.invoke('sales:search-products', query),
    variants: (productId:number) => ipcRenderer.invoke('sales:variants', productId),
    create: (input:unknown) => ipcRenderer.invoke('sales:create', input),
    history: (search='') => ipcRenderer.invoke('sales:history', search),
    get: (id:number) => ipcRenderer.invoke('sales:get', id),
  },
  variants: {
    enable: (productId: number) => ipcRenderer.invoke('variants:enable', productId),
    create: (productId: number, input: unknown) => ipcRenderer.invoke('variants:create', productId, input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('variants:update', id, input),
    getByProduct: (productId: number, filters?: unknown) => ipcRenderer.invoke('variants:get-by-product', productId, filters),
    get: (id: number) => ipcRenderer.invoke('variants:get', id),
    search: (query: string) => ipcRenderer.invoke('variants:search', query),
    deactivate: (id: number) => ipcRenderer.invoke('variants:deactivate', id),
    delete: (id: number) => ipcRenderer.invoke('variants:delete', id),
    getStock: (id: number) => ipcRenderer.invoke('variants:get-stock', id),
    getProductStock: (id: number) => ipcRenderer.invoke('variants:get-product-stock', id),
    getAttributes: (productId: number) => ipcRenderer.invoke('variants:get-attributes', productId),
    setAttributes: (productId: number, names: string[]) => ipcRenderer.invoke('variants:set-attributes', productId, names),
    generateCombinations: (dimensions: unknown[]) => ipcRenderer.invoke('variants:generate-combinations', dimensions),
    previewCombinations: (productId: number, dimensions: unknown[]) => ipcRenderer.invoke('variants:preview-combinations', productId, dimensions),
    createBatch: (productId: number, items: unknown[]) => ipcRenderer.invoke('variants:create-batch', productId, items),
  },
});
