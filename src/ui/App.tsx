import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout';
import { DashboardPage } from './DashboardPage';
import { CatalogPage } from './CatalogPage';
import { SalesPage } from './SalesPage';
import { InventoryPage } from './InventoryPage';
import { PartiesPage } from './PartiesPage';
import { ExpensesPage } from './ExpensesPage';
import { ReportsPage } from './ReportsPage';
import { SettingsPage } from './SettingsPage';
import { AuthPage } from './AuthPage';
import { UsersPage } from './UsersPage';
import { PurchasesPage } from './PurchasesPage';
import { BackupPage, ModulePage, modules } from './ModulePage';

export default function App() {
  const [auth,setAuth]=useState<any>(null);
  useEffect(()=>{window.shopmate.auth.status().then(setAuth).catch(()=>setAuth({setupRequired:true,session:null}));},[]);
  if(!auth)return <div className="catalog-loading">Loading local account...</div>;
  if(!auth.session)return <AuthPage setupRequired={auth.setupRequired} onReady={(session)=>setAuth({...auth,session,setupRequired:false})}/>;
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout session={auth.session} onLogout={async()=>{await window.shopmate.auth.logout();setAuth({...auth,session:null});}} />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<CatalogPage mode="products" readOnly={auth.session.role!=='admin'} />} />
          <Route path="categories" element={auth.session.role==='admin'?<CatalogPage mode="categories"/>:<Navigate to="/" replace/>} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="purchases" element={auth.session.role==='admin'?<PurchasesPage/>:<Navigate to="/" replace/>} />
          <Route path="inventory" element={auth.session.role==='admin'?<InventoryPage/>:<Navigate to="/" replace/>} />
          <Route path="customers" element={auth.session.role==='admin'?<PartiesPage kind="customer"/>:<Navigate to="/" replace/>} />
          <Route path="suppliers" element={auth.session.role==='admin'?<PartiesPage kind="supplier"/>:<Navigate to="/" replace/>} />
          <Route path="expenses" element={auth.session.role==='admin'?<ExpensesPage/>:<Navigate to="/" replace/>} />
          <Route path="reports/sales" element={auth.session.role==='admin'?<ReportsPage kind="sales"/>:<Navigate to="/" replace/>} />
          <Route path="reports/purchases" element={auth.session.role==='admin'?<ReportsPage kind="purchases"/>:<Navigate to="/" replace/>} />
          <Route path="reports/profit-loss" element={auth.session.role==='admin'?<ReportsPage kind="profit-loss"/>:<Navigate to="/" replace/>} />
          <Route path="reports/gst" element={auth.session.role==='admin'?<ReportsPage kind="gst"/>:<Navigate to="/" replace/>} />
          <Route path="settings" element={auth.session.role==='admin'?<SettingsPage/>:<Navigate to="/" replace/>} />
          <Route path="users" element={auth.session.role==='admin'?<UsersPage/>:<Navigate to="/" replace/>} />
          {modules.filter((module) => module.path !== 'sales' && module.path !== 'purchases' && module.path !== 'inventory' && module.path !== 'customers' && module.path !== 'suppliers' && module.path !== 'expenses' && !module.path.startsWith('reports/') && module.path !== 'settings' && module.path !== 'users').map((module) => <Route key={module.path} path={module.path} element={<ModulePage module={module} />} />)}
          <Route path="backup" element={auth.session.role==='admin'?<BackupPage/>:<Navigate to="/" replace/>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
