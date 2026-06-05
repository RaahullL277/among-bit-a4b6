import { useRef, useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { api } from '../api';

const SUGGESTIONS = [
  "What's our GMV this month?",
  'Who are the top merchants?',
  'Which merchants are suspended?',
  'Show recent platform activity',
];

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);
  const endRef = useRef(null);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await api.assistant(next);
      setProvider(res.provider);
      setMessages([...next, { role: 'assistant', content: res.reply, toolsUsed: res.toolsUsed }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="text-indigo-400" size={20} />
        <h1 className="text-xl font-semibold">Support assistant</h1>
        {provider && (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
            {provider === 'claude' ? 'Claude' : 'rules'}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-5">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-slate-400">
            <p>Ask about the platform — GMV, merchants, top performers, suspensions, or recent staff activity.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
              }`}
            >
              {m.content}
              {m.toolsUsed?.length > 0 && (
                <div className="mt-1 text-[10px] text-slate-400">via {m.toolsUsed.join(', ')}</div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-slate-500">Thinking…</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the platform…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm"
        />
        <button
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Send size={15} /> Send
        </button>
      </form>
    </div>
  );
}
