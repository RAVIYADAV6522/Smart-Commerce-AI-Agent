export function InputBox({ value, onChange, onSend, disabled }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="relative z-10 shrink-0 border-t border-slate-800 bg-slate-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the commerce agent…"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none ring-emerald-500/40 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-2 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
