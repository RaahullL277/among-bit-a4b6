import { Check, Minus, X } from 'lucide-react';
import { Section, Eyebrow } from './ui';

// Render a cell value: true/false → icons; 'addon'/'plugin'/'partial' → muted note; else text.
function Cell({ v, highlight }) {
  if (v === true) return <Check size={18} className={highlight ? 'mx-auto text-indigo-600' : 'mx-auto text-emerald-500'} />;
  if (v === false) return <X size={16} className="mx-auto text-stone-300" />;
  const labels = { addon: 'Paid add-on', plugin: 'Via plugin', partial: 'Partial' };
  return <span className="block text-center text-xs text-stone-500">{labels[v] ?? v}</span>;
}

export default function ComparisonTable({ data }) {
  const { competitors, rows, title, subtitle } = data;
  return (
    <Section id="compare" className="!py-16">
      <div className="text-center">
        <Eyebrow>Compare</Eyebrow>
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-stone-500">{subtitle}</p>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-2/5 p-3 text-left font-medium text-stone-400">Capability</th>
              {competitors.map((c, i) => (
                <th
                  key={c}
                  className={`p-3 text-center font-semibold ${i === 0 ? 'rounded-t-xl bg-indigo-600 text-white' : 'text-stone-600'}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.feature} className={ri % 2 ? 'bg-stone-50/60' : ''}>
                <td className="p-3 text-left text-stone-700">{row.feature}</td>
                {row.values.map((v, ci) => (
                  <td key={ci} className={`p-3 ${ci === 0 ? 'bg-indigo-50/70' : ''}`}>
                    <Cell v={v} highlight={ci === 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-xs text-stone-400">
        Comparison reflects out-of-the-box capabilities; competitor features may be available via paid apps, plugins or higher plans.
      </p>
    </Section>
  );
}
