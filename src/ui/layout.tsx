import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, Boxes, ChartNoAxesCombined, ChevronRight, CircleDollarSign, ClipboardList,
  FileBarChart, HardDriveDownload, LayoutDashboard, Menu, Package, Search, Settings,
  ShoppingBag, ShoppingCart, Store, Truck, Users, Wallet, type LucideIcon,
} from 'lucide-react';

type NavItem = { label: string; to: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  { label: 'Workspace', items: [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Sales & Billing', to: '/sales', icon: ShoppingCart },
    { label: 'Products', to: '/products', icon: Package },
    { label: 'Categories', to: '/categories', icon: Boxes },
    { label: 'Purchases', to: '/purchases', icon: ShoppingBag },
    { label: 'Inventory / Stock', to: '/inventory', icon: ClipboardList },
    { label: 'Customers', to: '/customers', icon: Users },
    { label: 'Suppliers', to: '/suppliers', icon: Truck },
    { label: 'Expenses', to: '/expenses', icon: Wallet },
  ] },
  { label: 'Reports', items: [
    { label: 'Sales Reports', to: '/reports/sales', icon: FileBarChart },
    { label: 'Purchase Reports', to: '/reports/purchases', icon: BarChart3 },
    { label: 'Profit & Loss', to: '/reports/profit-loss', icon: CircleDollarSign },
    { label: 'GST Reports', to: '/reports/gst', icon: ChartNoAxesCombined },
  ] },
  { label: 'System', items: [
    { label: 'Backup & Restore', to: '/backup', icon: HardDriveDownload },
    { label: 'User management', to: '/users', icon: Users },
    { label: 'Settings', to: '/settings', icon: Settings },
  ] },
];

function Sidebar({ collapsed, shopName, role, width }: { collapsed: boolean; shopName: string; role:string; width:number }) {
  return <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} style={{width:collapsed?76:width}}>
    <div className="brand-lockup"><div className="brand-mark"><Store size={19} strokeWidth={2.3} /></div><div><div className="brand-name">ShopMate</div><div className="brand-caption">Smart Fashion Retail. Simple Billing. Easy Inventory.</div></div></div>
    <div className="workspace-switcher"><div className="workspace-avatar">S</div><div className="workspace-copy"><span className="eyebrow">CURRENT WORKSPACE</span><strong>{shopName}</strong></div><ChevronRight size={16} className="muted-icon" /></div>
    <nav className="sidebar-nav" aria-label="Main navigation">{groups.map((group) => <div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.items.filter(({label})=>role==='admin'||['Dashboard','Sales & Billing','Products'].includes(label)).map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</div>)}</nav>
    <div className="sidebar-footer"><div className="offline-indicator"><span className="offline-dot" /><span>Works offline</span><span className="footer-version">v0.1</span></div><div className="sidebar-note">Your shop data stays on this computer.</div></div>
  </aside>;
}

function Topbar({ onToggleSidebar, lowStockCount, session, onLogout }: { onToggleSidebar: () => void; lowStockCount: number; session:any; onLogout:()=>void }) {
  const [now, setNow] = useState(() => new Date());
  const [query,setQuery]=useState(''),[results,setResults]=useState<any[]>([]),[searchOpen,setSearchOpen]=useState(false);
  const location = useLocation();
  const navigate=useNavigate(); const searchRef=useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(()=>{const q=query.trim();if(!q){setResults([]);return;}let active=true;const timer=window.setTimeout(()=>{window.shopmate.catalog.getProducts({search:q,page:1,pageSize:8,status:'active'}).then((r:any)=>{if(active)setResults(r.rows||[]);}).catch(()=>{if(active)setResults([]);});},180);return()=>{active=false;window.clearTimeout(timer);};},[query]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();setSearchOpen(true);}if(e.key==='Escape'){setSearchOpen(false);searchRef.current?.blur();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const date = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(now);
  const current = location.pathname === '/' ? 'Dashboard' : location.pathname.split('/').filter(Boolean).pop()?.replaceAll('-', ' ') || 'Dashboard';
  return <header className="topbar">
    <div className="topbar-left"><button className="icon-button menu-button" aria-label="Toggle sidebar" onClick={onToggleSidebar}><Menu size={18} /></button><div className="breadcrumb">ShopMate <span>/</span> <strong>{current}</strong></div></div>
    <div className="topbar-right"><div className="topbar-date"><span>{date}</span><b>{time}</b></div>
      <div className="global-search-wrap"><label className="global-search"><Search size={16} /><input ref={searchRef} aria-label="Search products" value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>setQuery(e.target.value)} placeholder="Search products" /><kbd>Ctrl K</kbd></label>{searchOpen&&query.trim()&&<div className="global-search-results">{results.length?results.map((item:any)=><button key={item.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{navigate('/products',{state:{globalSearch:query.trim()}});setSearchOpen(false);searchRef.current?.blur();}}><span><strong>{item.productName}</strong><small>{[item.sku,item.category,item.brand].filter(Boolean).join(' · ')}</small></span><b>{item.stock} {item.unit}</b></button>):<div className="global-search-empty">No matching products</div>}</div>}</div>
      {session.role==='admin'&&<NavLink to="/inventory" className="icon-button notification-button" aria-label={`Low stock: ${lowStockCount}`} title={lowStockCount ? `${lowStockCount} low stock items` : 'No low stock alerts'}><Bell size={18} />{lowStockCount > 0 && <span className="notification-dot">{lowStockCount > 9 ? '9+' : lowStockCount}</span>}</NavLink>}
      {session.role==='admin'&&<NavLink to="/settings" className="icon-button settings-shortcut" aria-label="Settings" title="Settings"><Settings size={18} /></NavLink>}
      <button className="profile-chip" onClick={onLogout} title="Sign out"><div className="profile-avatar">{session.fullName.slice(0,2).toUpperCase()}</div><div className="profile-copy"><strong>{session.fullName}</strong><span>{session.role} ? Sign out</span></div><ChevronRight size={14} className="muted-icon" /></button>
    </div>
  </header>;
}

export function AppLayout({session,onLogout}:{session:any;onLogout:()=>void}) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth,setSidebarWidth]=useState(()=>{const saved=Number(localStorage.getItem('shopmate-sidebar-width'));return Number.isFinite(saved)&&saved>=200&&saved<=360?saved:256;});
  const [shopName, setShopName] = useState('Set up your shop');
  const [lowStockCount, setLowStockCount] = useState(0);
  const dragRef=useRef(false);
  useEffect(() => { window.shopmate.dashboard.getData('7d').then((data) => { setShopName(data.shopName); setLowStockCount(data.lowStockCount); }).catch(() => undefined); }, []);
  useEffect(()=>{const move=(e:PointerEvent)=>{if(!dragRef.current)return;const next=Math.min(360,Math.max(200,e.clientX));setSidebarWidth(next);};const up=()=>{if(dragRef.current){dragRef.current=false;document.body.classList.remove('resizing-sidebar');localStorage.setItem('shopmate-sidebar-width',String(sidebarWidth));}};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};},[sidebarWidth]);
  return <div className="app-shell"><Sidebar collapsed={collapsed} shopName={shopName} role={session.role} width={sidebarWidth} /><button className={`sidebar-resizer${collapsed?' is-collapsed':''}`} style={{left:collapsed?76:sidebarWidth}} aria-label="Resize sidebar" role="separator" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={360} aria-valuenow={sidebarWidth} onPointerDown={e=>{if(collapsed)return;dragRef.current=true;e.currentTarget.setPointerCapture(e.pointerId);document.body.classList.add('resizing-sidebar');}} onPointerMove={e=>{if(dragRef.current)setSidebarWidth(Math.min(360,Math.max(200,e.clientX)));}} onPointerUp={()=>{dragRef.current=false;document.body.classList.remove('resizing-sidebar');localStorage.setItem('shopmate-sidebar-width',String(sidebarWidth));}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setSidebarWidth(v=>Math.min(360,Math.max(200,v+(e.key==='ArrowRight'?10:-10))));}}} /><div className="app-main" style={{width:`calc(100% - ${collapsed?76:sidebarWidth}px)`,marginLeft:collapsed?76:sidebarWidth}}><Topbar onToggleSidebar={() => setCollapsed((value) => !value)} lowStockCount={lowStockCount} session={session} onLogout={onLogout} /><main className="page-content"><Outlet /></main></div></div>;
}
