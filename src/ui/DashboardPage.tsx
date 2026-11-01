import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight, ArrowUpDown, ArrowUpRight, Box, Boxes, CalendarDays, CircleAlert, Clock3,
  HandCoins, IndianRupee, PackagePlus, Plus, RefreshCw, Search, ShoppingBag, ShoppingCart,
  UserPlus, Users, Warehouse, type LucideIcon,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsRange, DashboardData, LowStockProduct, RecentSale } from '../../electron/database/dashboard';

const ranges: Array<{ label: string; value: AnalyticsRange }> = [
  { label: '7 days', value: '7d' }, { label: '30 days', value: '30d' }, { label: '12 months', value: '12m' },
];

function currency(value: number, code: string): string {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value); }
  catch { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value); }
}
function number(value: number): string { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value); }

type Metric = { title: string; value: string; helper: string; icon: LucideIcon; tone: string; to?: string };
function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  const body = <><div className="metric-top"><span className="metric-label">{metric.title}</span><span className={`metric-icon ${metric.tone}`}><Icon size={18} strokeWidth={1.9} /></span></div><div className="metric-value">{metric.value}</div><div className="metric-helper">{metric.helper}</div></>;
  return metric.to ? <Link to={metric.to} className="metric-card metric-card-link">{body}</Link> : <article className="metric-card">{body}</article>;
}

function EmptyBlock({ icon: Icon = Boxes, title, description }: { icon?: LucideIcon; title: string; description: string }) {
  return <div className="empty-block"><div className="empty-icon"><Icon size={19} /></div><strong>{title}</strong><span>{description}</span></div>;
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label}</span><strong>{format(payload[0].value)}</strong></div>;
}

function SalesChart({ data, range, setRange, currencyCode }: { data: DashboardData['salesAnalytics']; range: AnalyticsRange; setRange: (range: AnalyticsRange) => void; currencyCode: string }) {
  const total = data.reduce((sum, point) => sum + point.sales, 0);
  const hasSales = data.some((point) => point.sales !== 0);
  return <section className="panel analytics-panel">
    <div className="panel-heading chart-heading"><div><div className="panel-kicker"><span className="chart-kicker-dot" /> SALES OVERVIEW</div><h2>Sales analytics</h2><p>Sales totals recorded in your local database.</p></div>
      <div className="range-switch" role="group" aria-label="Sales chart time range">{ranges.map((option) => <button key={option.value} className={range === option.value ? 'selected' : ''} onClick={() => setRange(option.value)}>{option.label}</button>)}</div>
    </div>
    <div className="chart-summary"><div><span>Selected period</span><strong>{currency(total, currencyCode)}</strong></div><span className="chart-summary-period"><CalendarDays size={14} /> {range === '7d' ? 'Daily · 7 days' : range === '30d' ? 'Daily · 30 days' : 'Monthly · 12 months'}</span></div>
    <div className="chart-area">{hasSales ? <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3978e8" stopOpacity={0.2} /><stop offset="100%" stopColor="#3978e8" stopOpacity={0.015} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="4 5" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#98a1b1', fontSize: 11 }} minTickGap={20} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#98a1b1', fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`} width={48} />
        <Tooltip content={<ChartTooltip format={(n) => currency(n, currencyCode)} />} cursor={{ stroke: '#b6c8e9', strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="sales" stroke="#3978e8" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 5, fill: '#3978e8', stroke: '#fff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer> : <EmptyBlock icon={IndianRupee} title="No sales for this period" description="Sales will appear here once they are recorded." />}</div>
  </section>;
}

function stockStatus(stock: number, minimum: number): { label: string; className: string } {
  if (stock <= 0) return { label: 'Out of stock', className: 'status-out' };
  if (stock <= minimum * 0.5) return { label: 'Very low', className: 'status-critical' };
  return { label: 'Low stock', className: 'status-low' };
}

function LowStockPanel({ products }: { products: LowStockProduct[] }) {
  return <section className="panel low-stock-panel">
    <div className="panel-heading compact-heading"><div><div className="panel-kicker">NEEDS ATTENTION</div><h2>Low stock</h2></div><Link className="text-link" to="/inventory">View stock <ArrowUpRight size={14} /></Link></div>
    {products.length ? <div className="low-stock-list">{products.slice(0, 5).map((item) => { const status = stockStatus(item.stock, item.minimumStock); return <div className="low-stock-row" key={`${item.id}-${item.variantId ?? 'simple'}`}>
      <div className="stock-product-icon"><Box size={17} /></div><div className="stock-product-copy"><strong title={item.name}>{item.name}</strong><span>{item.productType === 'clothing' ? 'Clothing' : 'Saree'} | {item.sku || 'No SKU'} · Min {number(item.minimumStock)} {item.unit}</span></div>
      <div className="stock-product-end"><strong className={item.stock <= 0 ? 'stock-zero' : ''}>{number(item.stock)} <small>{item.unit}</small></strong><span className={`stock-status ${status.className}`}>{status.label}</span></div>
    </div>; })}</div> : <EmptyBlock icon={PackagePlus} title="Stock levels look good" description="No products are below their minimum stock." />}
    <div className="panel-footnote"><CircleAlert size={14} /> Based on each product’s minimum stock setting</div>
  </section>;
}

type SortField = 'saleDate' | 'invoiceNumber' | 'customerName' | 'totalAmount';
function RecentSales({ sales, currencyCode }: { sales: RecentSale[]; currencyCode: string }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ field: SortField; direction: 'asc' | 'desc' }>({ field: 'saleDate', direction: 'desc' });
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const rows = sales.filter((sale) => !needle || [sale.invoiceNumber, sale.customerName, sale.paymentMethod ?? '', sale.paymentStatus].some((value) => value.toLocaleLowerCase().includes(needle)));
    return rows.sort((a, b) => {
      const av = a[sort.field]; const bv = b[sort.field];
      const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [sales, query, sort]);
  const toggleSort = (field: SortField) => setSort((current) => ({ field, direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc' }));
  const SortButton = ({ field, label }: { field: SortField; label: string }) => <button className="sort-button" onClick={() => toggleSort(field)}>{label}<ArrowUpDown size={12} className={sort.field === field ? 'sort-active' : ''} /></button>;
  return <section className="panel recent-sales-panel">
    <div className="panel-heading recent-heading"><div><div className="panel-kicker">LATEST ACTIVITY</div><h2>Recent sales</h2><p>Latest invoices saved in ShopMate.</p></div><label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an invoice or customer" aria-label="Search recent sales" /></label></div>
    {filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th><SortButton field="invoiceNumber" label="Invoice" /></th><th><SortButton field="saleDate" label="Date" /></th><th><SortButton field="customerName" label="Customer" /></th><th>Payment</th><th><SortButton field="totalAmount" label="Amount" /></th></tr></thead><tbody>
      {filtered.slice(0, 8).map((sale) => { const rawDate = sale.saleDate.replace(' ', 'T'); const parsedDate = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawDate) ? rawDate : `${rawDate}Z`); return <tr key={sale.id}><td className="invoice-cell">{sale.invoiceNumber}</td><td>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsedDate)}</td><td>{sale.customerName}</td><td><span className={`payment-badge payment-${sale.paymentStatus.toLowerCase().replace(/\s+/g, '-')}`}>{sale.paymentStatus}</span><span className="payment-method">{sale.paymentMethod || '—'}</span></td><td className="amount-cell">{currency(sale.totalAmount, currencyCode)}</td></tr>; })}
    </tbody></table></div> : <EmptyBlock icon={ShoppingCart} title={query ? 'No matching sales' : 'No sales recorded yet'} description={query ? 'Try a different invoice, customer or payment search.' : 'Completed invoices will appear here.'} />}
    <div className="table-footer"><span>{filtered.length ? `Showing ${Math.min(filtered.length, 8)} of ${filtered.length} invoices` : '0 invoices'}</span><span>Sorted by {sort.field === 'saleDate' ? 'date' : sort.field === 'invoiceNumber' ? 'invoice' : sort.field === 'customerName' ? 'customer' : 'amount'} · {sort.direction === 'desc' ? 'descending' : 'ascending'}</span></div>
  </section>;
}

const actions: Array<{ label: string; description: string; icon: LucideIcon; to: string }> = [
  { label: 'New sale', description: 'Create a customer bill', icon: ShoppingCart, to: '/sales' },
  { label: 'Add product', description: 'Set up an item', icon: PackagePlus, to: '/products' },
  { label: 'Add purchase', description: 'Record stock received', icon: ShoppingBag, to: '/purchases' },
  { label: 'Add customer', description: 'Save customer details', icon: UserPlus, to: '/customers' },
  { label: 'Add supplier', description: 'Save supplier details', icon: Users, to: '/suppliers' },
  { label: 'View stock', description: 'Check inventory levels', icon: Warehouse, to: '/inventory' },
];

function QuickActions() {
  return <section className="panel quick-actions-panel"><div className="panel-heading compact-heading"><div><div className="panel-kicker">SHORTCUTS</div><h2>Quick actions</h2></div><span className="shortcut-key"><Plus size={14} /> Quick</span></div>
    <div className="quick-action-list">{actions.map(({ label, description, icon: Icon, to }) => <Link to={to} key={label} className="quick-action"><span className="quick-action-icon"><Icon size={17} /></span><span className="quick-action-copy"><strong>{label}</strong><small>{description}</small></span><ArrowUpRight size={14} className="quick-action-arrow" /></Link>)}</div>
    <div className="quick-action-note"><Clock3 size={14} /> Some workflows are coming in later phases.</div>
  </section>;
}

export function DashboardPage() {
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await window.shopmate.dashboard.getData(range); setData(result); setRefreshedAt(new Date()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Dashboard data could not be loaded.'); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { void refresh(); }, [refresh]);

  const currencyCode = data?.currency || 'INR';
  const metrics: Metric[] = data ? [
    { title: 'Sales today', value: currency(data.salesToday, currencyCode), helper: 'Net of recorded returns', icon: IndianRupee, tone: 'blue' },
    { title: 'Sales this month', value: currency(data.salesThisMonth, currencyCode), helper: 'Month to date', icon: CalendarDays, tone: 'violet' },
    { title: "Today's profit", value: currency(data.todayProfit, currencyCode), helper: 'Estimated gross profit', icon: data.todayProfit < 0 ? ArrowDownRight : ArrowUpRight, tone: data.todayProfit < 0 ? 'orange' : 'green' },
    { title: 'Total products', value: number(data.totalProducts), helper: 'Active products', icon: PackagePlus, tone: 'blue' },
    { title: 'Stock value', value: currency(data.stockValue, currencyCode), helper: 'At purchase cost', icon: Boxes, tone: 'violet', to: '/inventory' },
    { title: 'Low stock', value: number(data.lowStockCount), helper: data.lowStockCount ? 'Below minimum level' : 'No items need attention', icon: CircleAlert, tone: data.lowStockCount ? 'orange' : 'green', to: '/inventory' },
    { title: 'Customer due', value: currency(data.customerDue, currencyCode), helper: 'Outstanding balance', icon: HandCoins, tone: 'orange', to: '/customers' },
    { title: 'Total customers', value: number(data.totalCustomers), helper: 'Registered customers', icon: Users, tone: 'blue', to: '/customers' },
  ] : [];

  return <div className="dashboard-page">
    <div className="page-title-row"><div><div className="page-eyebrow">YOUR BUSINESS AT A GLANCE</div><h1>Dashboard</h1><p>Welcome back{data?.shopName ? ` to ${data.shopName}` : ''}. Here’s what’s happening today.</p></div>
      <div className="page-title-actions">{refreshedAt && <span className="refreshed-at">Updated {new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(refreshedAt)}</span>}<button className="button-secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin-icon' : ''} />{loading ? 'Refreshing' : 'Refresh'}</button></div></div>
    {error && <div className="error-banner"><CircleAlert size={17} /><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div>}
    <div className="metrics-grid">{metrics.length ? metrics.map((metric) => <MetricCard key={metric.title} metric={metric} />) : Array.from({ length: 8 }, (_, index) => <div className="metric-card metric-loading" key={index}><span /><b /><small /></div>)}</div>
    {data && <><div className="dashboard-grid dashboard-grid-top"><SalesChart data={data.salesAnalytics} range={range} setRange={setRange} currencyCode={currencyCode} /><LowStockPanel products={data.lowStockProducts} /></div><div className="dashboard-grid dashboard-grid-bottom"><RecentSales sales={data.recentSales} currencyCode={currencyCode} /><QuickActions /></div></>}
    {loading && !data && <div className="dashboard-loading"><RefreshCw size={18} className="spin-icon" /> Loading your local business data…</div>}
  </div>;
}
