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

function sumCartValue(items) {
  if (!Array.isArray(items) || items.length === 0) return 0
  return items.reduce((s, p) => s + (typeof p.price === 'number' ? p.price : 0), 0)
}

function CartPanel({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null
  const total = sumCartValue(items)
  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-600/60 dark:bg-slate-950/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Your cart ({items.length} {items.length === 1 ? 'item' : 'items'})
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
        {items.map((p, i) => (
          <li
            key={`${i}-${p.id}`}
            className="flex justify-between gap-2 border-b border-slate-200/90 pb-1 last:border-0 dark:border-slate-800/80"
          >
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400/90">
              {formatPrice(p.price)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
        Subtotal:{' '}
        <span className="text-emerald-600 dark:text-emerald-400">{formatPrice(total)}</span>
      </p>
    </div>
  )
}

function OrderPanel({ order }) {
  if (!order || !order.id) return null
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : []
  return (
    <div className="mt-3 rounded-2xl border border-emerald-200/90 bg-emerald-50/90 p-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-500/80">
        Order placed
      </p>
      <p className="mt-1 text-sm text-slate-900 dark:text-white">Order {order.id}</p>
      {lineItems.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {lineItems.map((li) => (
            <li key={String(li.id) + (li.name || '')} className="flex justify-between gap-2">
              <span className="truncate">{li.name}</span>
              <span className="shrink-0 text-emerald-600 dark:text-emerald-400/90">
                {formatPrice(li.price)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {typeof order.subtotal === 'number' && (
        <p className="mt-2 text-sm text-slate-900 dark:text-white">
          Total: <span className="text-emerald-600 dark:text-emerald-400">{formatPrice(order.subtotal)}</span>
          {order.currency ? ` ${order.currency}` : ''}
        </p>
      )}
    </div>
  )
}

function ProductCards({ products, onAddToCart, busy }) {
  if (!Array.isArray(products) || products.length === 0) return null

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {products.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-md shadow-slate-200/40 backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80 dark:shadow-black/20"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
          {typeof p.category === 'string' && p.category.trim() !== '' && (
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {p.category}
            </p>
          )}
          <p className="mt-1 text-lg font-medium text-emerald-600 dark:text-emerald-400">
            {formatPrice(p.price)}
          </p>
          {typeof p.highlights === 'string' && p.highlights.trim() !== '' && (
            <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-500">
              {p.highlights}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onAddToCart(p.id)}
            className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-950 dark:hover:bg-emerald-400"
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
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain bg-slate-100/50 px-4 py-6 pb-8 dark:bg-transparent sm:px-6 [scroll-padding-bottom:1.5rem]"
    >
      {messages.length === 0 && (
        <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300/90 bg-white/60 px-5 py-8 text-center dark:border-slate-600/50 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            What are you shopping for?
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Try “phone under 20k”, “LED TV”, “Samsung washing machine”, or add items with{' '}
            <span className="font-mono text-slate-600 dark:text-slate-300">add product 1 to cart</span>.
          </p>
        </div>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white shadow-indigo-900/10 dark:shadow-indigo-950/30'
                : 'border border-slate-200/90 bg-white text-slate-800 shadow-slate-200/30 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-black/20'
            }`}
          >
            {m.role === 'user' ? (
              m.text
            ) : (
              <>
                <pre className="whitespace-pre-wrap font-sans text-sm text-inherit">
                  {responseSummary(m.data)}
                </pre>
                <CartPanel items={m.data?.cart} />
                <OrderPanel order={m.data?.order} />
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
