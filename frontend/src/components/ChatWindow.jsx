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
    <div className="mt-3 rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/90 to-cyan-50/40 p-3 dark:border-violet-500/20 dark:from-slate-900/80 dark:to-slate-900/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600/80 dark:text-violet-300/90">
        Your cart ({items.length} {items.length === 1 ? 'item' : 'items'})
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
        {items.map((p, i) => (
          <li
            key={`${i}-${p.id}`}
            className="flex justify-between gap-2 border-b border-violet-200/40 pb-1 last:border-0 dark:border-slate-700/80"
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
    <div className="mt-3 rounded-2xl border border-emerald-300/50 bg-gradient-to-br from-emerald-50/95 to-cyan-50/50 p-3 dark:border-emerald-500/30 dark:from-emerald-950/50 dark:to-slate-900/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400/90">
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
          className="card-3d group rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-[0_12px_40px_-12px_rgba(109,40,217,0.2)] dark:border-slate-600/50 dark:from-slate-800/95 dark:to-slate-900/90 dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
          {typeof p.category === 'string' && p.category.trim() !== '' && (
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-violet-500/80 dark:text-violet-300/80">
              {p.category}
            </p>
          )}
          <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatPrice(p.price)}
          </p>
          {typeof p.highlights === 'string' && p.highlights.trim() !== '' && (
            <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
              {p.highlights}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onAddToCart(p.id)}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_5px_0_0] shadow-emerald-800 transition hover:translate-y-0.5 hover:shadow-[0_3px_0_0] hover:shadow-emerald-800 active:translate-y-1.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:from-teal-500 dark:to-cyan-500 dark:text-slate-950 dark:shadow-cyan-900 dark:hover:shadow-cyan-900"
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
      className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain px-4 py-6 pb-8 [scroll-padding-bottom:1.5rem] sm:px-6"
    >
      {messages.length === 0 && (
        <div className="mx-auto w-full max-w-md pt-2">
          <div className="rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 p-[2px] shadow-[0_20px_60px_-12px_rgba(109,40,217,0.35)]">
            <div className="card-3d empty-hero relative rounded-[14px] px-5 py-8 text-center">
              <p className="text-base font-semibold text-slate-800 dark:text-white">
                What are you shopping for?
              </p>
              <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Try <span className="font-medium text-violet-600 dark:text-violet-300">“phone under 20k”</span>,{' '}
                <span className="font-medium text-cyan-600 dark:text-cyan-300">“LED TV”</span>, or{' '}
                <span className="font-medium text-amber-600 dark:text-amber-300">“Samsung washing machine”</span>
                — or add with{' '}
                <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 dark:bg-slate-800 dark:text-cyan-200">
                  add product 1 to cart
                </code>
                .
              </p>
            </div>
          </div>
        </div>
      )}
      {messages.map((m, i) => (
        <div
          key={m.id}
          style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
          className={`message-animate flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed transition-transform duration-200 ${
              m.role === 'user'
                ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-[0_12px_32px_-8px_rgba(109,40,217,0.5)] [transform:perspective(800px)] hover:-translate-y-0.5'
                : 'border border-slate-200/80 bg-white/90 text-slate-800 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] [transform:perspective(1000px)] dark:border-slate-600/50 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.45)]'
            } `}
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
