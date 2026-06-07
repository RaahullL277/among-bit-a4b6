import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { ADMIN_URL, PARTNER_URL } from '../api';

export default function Nav({ content }) {
  const isPartner = content.audience === 'partner';
  const signInUrl = isPartner ? PARTNER_URL : ADMIN_URL;
  return (
    <header className="sticky top-0 z-30 border-b border-stone-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link to={isPartner ? '/partners' : '/'} className="flex items-center gap-2 font-bold text-stone-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white"><ShoppingBag size={16} /></span>
          {content.brand}
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-stone-600 md:flex">
          {content.nav.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-stone-900">{n.label}</a>
          ))}
          {/* Cross-link the two audiences. */}
          <Link to={isPartner ? '/' : '/partners'} className="hover:text-stone-900">
            {isPartner ? 'For merchants' : 'For partners'}
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <a href={signInUrl} className="text-sm font-medium text-stone-600 hover:text-stone-900">Sign in</a>
          <a href="#build" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">
            {isPartner ? 'Start a store' : 'Build your store'}
          </a>
        </div>
      </div>
    </header>
  );
}
