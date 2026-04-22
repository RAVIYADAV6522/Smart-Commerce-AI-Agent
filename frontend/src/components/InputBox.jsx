export function InputBox({ value, onChange, onSend, disabled }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="relative z-20 shrink-0 border-t border-white/30 bg-white/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-2xl dark:border-slate-700/50 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-3xl gap-3">
        <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white/90 p-0.5 shadow-inner shadow-slate-200/50 dark:border-slate-600 dark:bg-slate-900/90 dark:shadow-slate-900/50">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about products, budget, cart, or checkout…"
            disabled={disabled}
            className="w-full rounded-[14px] border-0 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:ring-0 disabled:opacity-50 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white shadow-[0_6px_0_0] shadow-violet-900/90 transition hover:translate-y-0.5 hover:shadow-[0_3px_0_0] hover:shadow-violet-900/90 active:translate-y-1.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none dark:from-cyan-500 dark:to-teal-500 dark:shadow-cyan-900 dark:hover:shadow-cyan-900 dark:text-slate-950"
        >
          Send
        </button>
      </div>
    </div>
  )
}
