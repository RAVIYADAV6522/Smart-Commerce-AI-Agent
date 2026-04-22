import { useTheme } from '../ThemeContext.jsx'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-amber-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-amber-300 dark:hover:bg-slate-800"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      aria-label={isDark ? 'Use light mode' : 'Use dark mode'}
    >
      <span className="text-lg leading-none" aria-hidden>
        {isDark ? '☀' : '☾'}
      </span>
    </button>
  )
}
