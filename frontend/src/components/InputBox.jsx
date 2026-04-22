export function InputBox({ value, onChange, onSend, disabled }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="relative z-10 shrink-0 border-t border-slate-200/90 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-3xl gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about products, budget, cart, or checkout…"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-emerald-500/30 placeholder:text-slate-400 focus:border-emerald-500/60 focus:ring-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500/50"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          Send
        </button>
      </div>
    </div>
  )
}
