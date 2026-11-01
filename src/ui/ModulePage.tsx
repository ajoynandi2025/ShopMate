import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, HardDriveDownload, LoaderCircle, type LucideIcon } from 'lucide-react';
import {
  BarChart3, Boxes, ChartNoAxesCombined, CircleDollarSign, ClipboardList, FileBarChart,
  Package, Settings, ShoppingBag, ShoppingCart, Truck, Users, Wallet,
} from 'lucide-react';

export type ModuleDefinition = { path: string; label: string; phase: number; description: string; icon: LucideIcon };
export const modules: ModuleDefinition[] = [
  { path: 'sales', label: 'Sales & Billing', phase: 7, description: 'Build invoices, manage the cart and record payments.', icon: ShoppingCart },
  { path: 'products', label: 'Products', phase: 4, description: 'Create products, pricing, tax and stock settings.', icon: Package },
  { path: 'categories', label: 'Categories', phase: 4, description: 'Organize products with categories and subcategories.', icon: Boxes },
  { path: 'purchases', label: 'Purchases', phase: 6, description: 'Record supplier invoices and incoming stock.', icon: ShoppingBag },
  { path: 'inventory', label: 'Inventory / Stock', phase: 8, description: 'Review stock movements, adjustments and valuation.', icon: ClipboardList },
  { path: 'customers', label: 'Customers', phase: 9, description: 'Manage customer details, balances and payment history.', icon: Users },
  { path: 'suppliers', label: 'Suppliers', phase: 9, description: 'Manage supplier details and outstanding balances.', icon: Truck },
  { path: 'expenses', label: 'Expenses', phase: 10, description: 'Record and review shop expenses.', icon: Wallet },
  { path: 'reports/sales', label: 'Sales Reports', phase: 10, description: 'Explore sales totals, trends and product performance.', icon: FileBarChart },
  { path: 'reports/purchases', label: 'Purchase Reports', phase: 10, description: 'Review purchases and supplier spending.', icon: BarChart3 },
  { path: 'reports/profit-loss', label: 'Profit & Loss', phase: 10, description: 'Review revenue, cost of goods and expenses.', icon: CircleDollarSign },
  { path: 'reports/gst', label: 'GST Reports', phase: 10, description: 'Summarize taxable sales and GST amounts.', icon: ChartNoAxesCombined },
  { path: 'settings', label: 'Settings', phase: 3, description: 'Configure your shop, invoice preferences and account.', icon: Settings },
];

export function ModulePage({ module }: { module: ModuleDefinition }) {
  const Icon = module.icon;
  return <div className="module-page"><div className="module-title"><div className="module-icon"><Icon size={21} /></div><div><div className="page-eyebrow">SHOPMATE WORKSPACE</div><h1>{module.label}</h1><p>{module.description}</p></div></div>
    <section className="module-placeholder panel"><div className="placeholder-art"><Icon size={27} /></div><span className="phase-pill">PLANNED FOR PHASE {module.phase}</span><h2>This workspace is coming soon</h2><p>This module hasn’t been implemented yet. It will be added in its planned development phase. Your local database is ready for the next steps.</p><Link to="/" className="button-secondary"><ArrowLeft size={15} /> Back to dashboard</Link></section>
  </div>;
}

export function BackupPage() {
  const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState(''),[backups,setBackups]=useState<any[]>([]);
  const load=async()=>{try{setBackups(await window.shopmate.database.listBackups());}catch(reason){setError(reason instanceof Error?reason.message:'Backup history could not be loaded.');}};
  useEffect(()=>{void load();},[]);
  const create=async()=>{setBusy(true);setError('');setResult('');try{const item=await window.shopmate.database.createBackup();setResult(`Backup verified: ${item.path}`);await load();}catch(e){setError(e instanceof Error?e.message:'Backup could not be created.');}finally{setBusy(false);}};
  const restore=async()=>{if(!confirm('Restore replaces the current ShopMate database. A safety backup will be created first. Continue?'))return;setBusy(true);setError('');setResult('');try{const item=await window.shopmate.database.restoreBackup();if(item)setResult(`Restore complete. Integrity: ${item.integrity}. Safety copy: ${item.safetyBackup}`);await load();}catch(e){setError(e instanceof Error?e.message:'Restore could not be completed.');}finally{setBusy(false);}};
  return <div className="module-page"><div className="module-title"><div className="module-icon"><HardDriveDownload size={21}/></div><div><div className="page-eyebrow">DATA SAFETY</div><h1>Backup &amp; Restore</h1><p>Backups are stored locally outside the installation folder.</p></div></div><section className="backup-card panel"><div className="backup-card-icon"><HardDriveDownload size={23}/></div><div className="backup-card-copy"><h2>Database backup</h2><p>Create an integrity-checked backup, or restore a validated backup file. A safety copy is made before every restore.</p><div className="backup-actions"><button className="button-primary" disabled={busy} onClick={()=>void create()}>{busy?<LoaderCircle size={16} className="spin-icon"/>:<HardDriveDownload size={16}/>}Create backup now</button><button className="button-secondary" disabled={busy} onClick={()=>void restore()}>{busy?<LoaderCircle size={16} className="spin-icon"/>:null}Choose backup to restore</button></div>{result&&<div className="success-message"><CheckCircle2 size={16}/><span>{result}</span></div>}{error&&<div className="error-message"><CircleAlert size={16}/><span>{error}</span></div>}<h3>Backup history</h3>{backups.length?<ul className="backup-history">{backups.map(item=><li key={item.path}><strong>{item.name}</strong><span>{new Date(item.modifiedAt).toLocaleString()} ? {Math.ceil(item.size/1024)} KB</span></li>)}</ul>:<p>No backups yet. A daily local backup is created when ShopMate starts.</p>}</div></section></div>;
}
