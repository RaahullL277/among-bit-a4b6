import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import { MERCHANT, PARTNER } from './content';

// ecompartner.imagine.bo serves the partner site at "/"; ecom.imagine.bo serves
// merchants. In dev (or a single deployment), both are reachable by route too.
const host = typeof window !== 'undefined' ? window.location.hostname : '';
const PARTNER_HOST = /(^|\.)ecompartner\./i.test(host) || /partner/i.test(host);

function useDocMeta(content) {
  const loc = useLocation();
  useEffect(() => {
    document.title = `${content.brand} — ${content.hero.title}`;
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', content.hero.subtitle);
  }, [content, loc.pathname]);
}

function MerchantSite() { useDocMeta(MERCHANT); return <Landing content={MERCHANT} />; }
function PartnerSite() { useDocMeta(PARTNER); return <Landing content={PARTNER} />; }

export default function App() {
  return (
    <Routes>
      {/* Host decides the home route; explicit paths always work for cross-linking. */}
      <Route path="/" element={PARTNER_HOST ? <PartnerSite /> : <MerchantSite />} />
      <Route path="/merchants" element={<MerchantSite />} />
      <Route path="/partners" element={<PartnerSite />} />
      <Route path="/partner" element={<Navigate to="/partners" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
