import { ShieldCheck, Truck, Undo2, FileText } from 'lucide-react';

const ITEMS = [
  { icon: ShieldCheck, label: 'Secure checkout' },
  { icon: Truck, label: 'Fast delivery' },
  { icon: Undo2, label: 'Easy returns' },
  { icon: FileText, label: 'GST invoice' },
];

export default function TrustBar() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-white p-3 text-xs text-stone-600 sm:grid-cols-4">
      {ITEMS.map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center justify-center gap-1.5">
          <Icon size={15} className="text-stone-400" /> {label}
        </div>
      ))}
    </div>
  );
}
