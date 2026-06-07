import { Link } from 'react-router-dom';

export default function Footer({ content }) {
  const isPartner = content.audience === 'partner';
  return (
    <footer className="border-t border-stone-100 bg-stone-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-stone-500 sm:flex-row">
        <span>© {new Date().getFullYear()} {content.brand} · {content.domain}</span>
        <div className="flex items-center gap-5">
          <Link to={isPartner ? '/' : '/partners'} className="hover:text-stone-800">
            {isPartner ? 'For merchants' : 'For partners'}
          </Link>
          <a href="#features" className="hover:text-stone-800">Features</a>
          <a href="#build" className="hover:text-stone-800">Get started</a>
        </div>
      </div>
    </footer>
  );
}
