import { Loader2 } from 'lucide-react';

// --- Money -----------------------------------------------------------------
export function formatMoney(minor, currency = 'INR') {
  const amount = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// --- Buttons ---------------------------------------------------------------
const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({ variant = 'primary', loading, children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

// --- Cards -----------------------------------------------------------------
export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// --- Form fields -----------------------------------------------------------
export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export function Input(props) {
  return <input className={inputClass} {...props} />;
}
export function Textarea(props) {
  return <textarea className={inputClass} rows={3} {...props} />;
}
export function Select({ children, ...props }) {
  return (
    <select className={inputClass} {...props}>
      {children}
    </select>
  );
}

// --- Status / feedback -----------------------------------------------------
const statusColors = {
  PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  FULFILLED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
  REFUNDED: 'bg-rose-100 text-rose-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  DRAFT: 'bg-slate-100 text-slate-600',
  ARCHIVED: 'bg-slate-200 text-slate-500',
  SUSPENDED: 'bg-rose-100 text-rose-700',
  ABANDONED: 'bg-amber-100 text-amber-700',
  CONVERTED: 'bg-blue-100 text-blue-700',
  RECOVERED: 'bg-emerald-100 text-emerald-700',
  SENT: 'bg-emerald-100 text-emerald-700',
  SKIPPED: 'bg-slate-200 text-slate-500',
  FAILED: 'bg-rose-100 text-rose-700',
  MANIFESTED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-700',
  OUT_FOR_DELIVERY: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  RTO: 'bg-rose-100 text-rose-700',
};

export function Badge({ children }) {
  const cls = statusColors[children] ?? 'bg-slate-100 text-slate-600';
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

const STOCK_DOT = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-500', RED: 'bg-rose-500' };

export function StockDot({ status, label }) {
  if (!status) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${STOCK_DOT[status] ?? 'bg-slate-300'}`} />
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {Icon && <Icon size={28} className="text-slate-300" />}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <p className="max-w-sm text-xs text-slate-500">{children}</p>}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{message}</div>
  );
}

// --- Modal -----------------------------------------------------------------
export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
