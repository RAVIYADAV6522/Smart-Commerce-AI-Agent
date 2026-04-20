import { useEffect, useRef } from 'react'

function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function responseSummary(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data
  if (typeof data.message === 'string') return data.message
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function ProductCards({ products, onAddToCart, busy }) {
  if (!Array.isArray(products) || products.length === 0) return null

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {products.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-4 shadow-lg shadow-black/20 backdrop-blur-sm"
        >
          <p className="text-sm font-semibold text-white">{p.name}</p>
          <p className="mt-1 text-lg font-medium text-emerald-400">
            {formatPrice(p.price)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAddToCart(p.id)}
            className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to Cart
          </button>
        </div>
      ))}
    </div>
  )
}

export function ChatWindow({ messages, onAddToCart, busy }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain px-4 py-6 pb-8 sm:px-6 [scroll-padding-bottom:1.5rem]"
    >
      {messages.length === 0 && (
        <p className="text-center text-sm text-slate-500">
          Ask for products, add items to your cart, or place an order.
        </p>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-700/80 bg-slate-900/90 text-slate-100'
            }`}
          >
            {m.role === 'user' ? (
              m.text
            ) : (
              <>
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {responseSummary(m.data)}
                </pre>
                <ProductCards
                  products={m.data?.products}
                  onAddToCart={onAddToCart}
                  busy={busy}
                />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
