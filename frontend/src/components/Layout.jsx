import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  Package,
  Wand2,
  ShoppingCart,
  ShoppingBasket,
  Truck,
  Undo2,
  Users,
  Plug,
  Puzzle,
  Bell,
  MessageSquare,
  Star,
  Boxes,
  Tag,
  Gift,
  Sparkles,
  Send,
  Bot,
  Repeat,
  Palette,
  Search,
  Image,
  Megaphone,
  TrendingDown,
  Activity,
  UserCog,
  ScrollText,
  Settings,
  LogOut,
  ShoppingBag,
  FileText,
  Scale,
  DownloadCloud,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// `perm` (when set) hides the item unless the current actor holds it.
const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/stores', label: 'Stores', icon: Store },
  { to: '/import', label: 'Import / Migrate', icon: DownloadCloud, perm: 'products:write' },
  { to: '/design', label: 'Design', icon: Palette },
  { to: '/seo', label: 'SEO & Speed', icon: Search },
  { to: '/images', label: 'Images', icon: Image },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/quick-list', label: 'Quick List', icon: Wand2 },
  { to: '/pricing', label: 'Pricing', icon: TrendingDown },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/bundles', label: 'Bundles', icon: Boxes },
  { to: '/discounts', label: 'Discounts', icon: Tag },
  { to: '/stock', label: 'Stock', icon: Activity },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/carts', label: 'Carts', icon: ShoppingBasket },
  { to: '/shipments', label: 'Shipments', icon: Truck },
  { to: '/returns', label: 'Returns', icon: Undo2 },
  { to: '/invoicing', label: 'Invoicing', icon: FileText },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/cohorts', label: 'Cohorts', icon: Sparkles },
  { to: '/automation', label: 'Automation', icon: Send, perm: 'notifications:write' },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/shopability', label: 'AI Shopping', icon: Bot },
  { to: '/loyalty', label: 'Loyalty', icon: Gift },
  { to: '/subscriptions', label: 'Subscriptions', icon: Repeat },
  { to: '/integrations', label: 'Integrations', icon: Plug, perm: 'integrations:write' },
  { to: '/apps', label: 'Apps', icon: Puzzle },
  { to: '/notifications', label: 'Notifications', icon: Bell, perm: 'notifications:write' },
  { to: '/support', label: 'Support', icon: MessageSquare },
  { to: '/team', label: 'Team', icon: UserCog, perm: 'members:manage' },
  { to: '/legal', label: 'Legal', icon: Scale },
  { to: '/audit', label: 'Audit log', icon: ScrollText, perm: 'members:manage' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'apikeys:manage' },
];

function StoreSwitcher() {
  const { stores, selectedId, selectStore } = useStores();
  if (!stores.length) return null;
  return (
    <select
      value={selectedId}
      onChange={(e) => selectStore(e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-500"
    >
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export default function Layout() {
  const { signOut, me, can, actingClient } = useAuth();
  const items = nav.filter((n) => !n.perm || can(n.perm));

  return (
    <div className="flex min-h-full">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ShoppingBag size={17} />
          </div>
          <span className="font-semibold text-slate-900">Merchant</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          {me && (
            <div className="mb-2 px-3">
              <div className="truncate text-xs font-medium text-slate-700">{me.email ?? 'API key'}</div>
              <div className="text-xs text-slate-400">{me.role}</div>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {actingClient && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-6 py-1.5 text-xs font-medium text-white">
            Managing <span className="font-semibold">{actingClient.name}</span> as a partner — changes apply to the client's store.
          </div>
        )}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">Active store</div>
          <StoreSwitcher />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
