import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { api, STORE_ID } from './api';

const CONV_KEY = `support.conv.${STORE_ID}`;

export default function ChatWidget() {
  const [config, setConfig] = useState(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role:'user'|'bot', text}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const convId = useRef(localStorage.getItem(CONV_KEY) || null);
  const endRef = useRef(null);

  useEffect(() => {
    api.supportConfig(STORE_ID).then(setConfig).catch(() => setConfig({ enabled: false }));
  }, []);

  useEffect(() => {
    if (open && config?.enabled && messages.length === 0) {
      setMessages([{ role: 'bot', text: config.greeting }]);
    }
  }, [open, config, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!config?.enabled) return null;

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.supportChat(STORE_ID, { conversationId: convId.current, message: text });
      convId.current = res.conversationId;
      localStorage.setItem(CONV_KEY, res.conversationId);
      setMessages((m) => [...m, { role: 'bot', text: res.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: `Sorry, something went wrong: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between bg-stone-900 px-4 py-3 text-white">
            <span className="text-sm font-medium">{config.displayName}</span>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-800'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-stone-400">typing…</div>}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-stone-200 p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about products or your order…"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none"
            />
            <button disabled={loading || !input.trim()} className="rounded-lg bg-stone-900 px-3 text-white disabled:opacity-50">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg hover:bg-stone-700"
        aria-label="Chat"
      >
        {open ? <X size={20} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
