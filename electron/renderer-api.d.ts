import type { StockMovementInput } from './preload';
import type { AnalyticsRange, DashboardData } from './database/dashboard';

declare global {
  interface Window {
    shopmate: {
      auth: { status():Promise<any>; setup(input:any):Promise<any>; login(input:any):Promise<any>; logout():Promise<void>; changePassword(oldPassword:string,newPassword:string):Promise<void>; };
      users: { list():Promise<any[]>; save(id:number|null,input:any):Promise<number|void>; setActive(id:number,active:boolean):Promise<void>; };
      database: {
        getStatus(): Promise<{ path: string; schemaVersion: number; integrity: string; tableCount: number }>;
        createBackup(): Promise<{ path: string; integrity: string }>; listBackups():Promise<any[]>; restoreBackup():Promise<any|null>;
      };
      inventory: {
        getOverview(search?:string):Promise<any[]>; getMovements(search?:string):Promise<any[]>;
        getStock(productId: number, variantId?: number | null): Promise<number>;
        recordMovement(movement: StockMovementInput): Promise<{ balance: number; transactionId: number }>;
      };
      dashboard: {
        getData(range: AnalyticsRange): Promise<DashboardData>;
      };
      catalog: {
        getCategories(search?: string): Promise<any[]>; createCategory(input: any): Promise<number>;
        updateCategory(id: number, input: any): Promise<void>; deleteCategory(id: number): Promise<void>;
        getProducts(filters: any): Promise<any>; getProduct(id: number): Promise<any>;
        createProduct(input: any): Promise<number>; updateProduct(id: number, input: any): Promise<void>;
        deactivateProduct(id: number): Promise<void>; deleteProduct(id: number): Promise<void>;
        getStock(id: number): Promise<number>; chooseImage(): Promise<string | null>;
        previewImport(fileName: string, bytes: Uint8Array): Promise<any[]>;
        importProducts(rows: any[]): Promise<{ imported: number; errors: { rowNumber: number; message: string }[] }>;
      };
      settings: { get():Promise<any>; update(input:any):Promise<any>; };
      reports: { get(kind:'sales'|'purchases'|'profit-loss'|'gst',from:string,to:string):Promise<any>; };
      expenses: { list(search?:string,from?:string,to?:string):Promise<any[]>; summary(from?:string,to?:string):Promise<any>; categories():Promise<string[]>; save(id:number|null,input:any):Promise<number>; delete(id:number):Promise<void>; };
      parties: { list(kind:'customer'|'supplier',search?:string):Promise<any[]>; save(kind:'customer'|'supplier',id:number|null,input:any):Promise<number|void>; ledger(kind:'customer'|'supplier',id:number):Promise<any>; payment(kind:'customer'|'supplier',id:number,amount:number,method:string,notes?:string):Promise<any>; };
      purchases: { suppliers():Promise<any[]>; searchProducts(query:string):Promise<any[]>; create(input:any):Promise<any>; history(search?:string):Promise<any[]>; get(id:number):Promise<any>; };
      sales: { config():Promise<any>; customers():Promise<any[]>; searchProducts(query:string):Promise<any[]>; variants(productId:number):Promise<any[]>; create(input:any):Promise<any>; history(search?:string):Promise<any[]>; get(id:number):Promise<any>; };
      variants: {
        enable(productId:number):Promise<{enabled:boolean;defaultVariantId:number|null}>;
        create(productId:number,input:any):Promise<number>; update(id:number,input:any):Promise<void>;
        getByProduct(productId:number,filters?:any):Promise<any>; get(id:number):Promise<any>; search(query:string):Promise<any[]>;
        deactivate(id:number):Promise<void>; delete(id:number):Promise<void>; getStock(id:number):Promise<number>;
        getProductStock(id:number):Promise<number>; getAttributes(productId:number):Promise<string[]>;
        setAttributes(productId:number,names:string[]):Promise<string[]>; generateCombinations(dimensions:any[]):Promise<any[]>;
        previewCombinations(productId:number,dimensions:any[]):Promise<any[]>;
        createBatch(productId:number,items:any[]):Promise<number[]>;
      };
    };
  }
}

export {};
