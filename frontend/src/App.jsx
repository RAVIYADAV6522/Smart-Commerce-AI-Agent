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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-slate-200/90 bg-gradient-to-b from-white to-slate-50/95 px-4 py-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-950/95 dark:shadow-none sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              Smart Commerce
            </h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              AI shopping assistant — phones, laptops & home electronics
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {busy && (
              <span className="hidden text-xs font-medium text-emerald-600 dark:text-emerald-400/90 sm:inline">
                Thinking…
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
