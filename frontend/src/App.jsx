import { useCallback, useState } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { InputBox } from './components/InputBox'
import { ThemeToggle } from './components/ThemeToggle.jsx'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000'

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const sendQuery = useCallback(async (query, options = {}) => {
    const { clearInput = true } = options
    const trimmed = query.trim()
    if (!trimmed || busy) return

    const userMsg = { id: nextId(), role: 'user', text: trimmed }
    setMessages((prev) => [...prev, userMsg])
    if (clearInput) setInput('')
    setBusy(true)

    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: trimmed }),
      })

      const data = await res.json().catch(() => ({
        message: 'Invalid response from server',
      }))

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            data: data?.error ? { message: data.error } : data,
          },
        ])
        return
      }

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', data },
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          data: { message: `Network error: ${msg}` },
        },
      ])
    } finally {
      setBusy(false)
    }
  }, [busy])

  const handleSend = () => sendQuery(input)

  const handleAddToCart = (productId) => {
    sendQuery(`Add product ${productId} to my cart`, { clearInput: false })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="app-bg-mesh" />
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="orb orb-c hidden sm:block" />
      </div>

      <header className="relative z-20 shrink-0 border-b border-white/40 bg-white/70 px-4 py-4 shadow-lg shadow-violet-500/5 backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-950/70 dark:shadow-violet-900/20 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 bg-clip-text text-xl font-bold tracking-tight text-transparent drop-shadow-sm dark:from-violet-300 dark:via-fuchsia-300 dark:to-cyan-200">
              Smart Commerce
            </h1>
            <p className="truncate text-xs text-slate-600 dark:text-slate-400">
              AI shopping • phones, laptops & home tech
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {busy && (
              <span
                className="hidden items-center text-xs font-medium text-violet-600 dark:text-cyan-300/90 sm:inline-flex"
                aria-live="polite"
              >
                Thinking
                <span className="thinking-dots ml-0.5" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ChatWindow
        messages={messages}
        onAddToCart={handleAddToCart}
        busy={busy}
      />

      <InputBox
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={busy}
      />
    </div>
  )
}
