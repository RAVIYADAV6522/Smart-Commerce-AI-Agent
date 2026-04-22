import { useTheme } from '../ThemeContext.jsx'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/80 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 shadow-md shadow-amber-500/20 transition-transform duration-200 hover:scale-105 hover:shadow-lg active:scale-95 dark:border-cyan-500/30 dark:from-slate-800 dark:to-slate-900 dark:text-cyan-300 dark:shadow-cyan-500/10"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      aria-label={isDark ? 'Use light mode' : 'Use dark mode'}
    >
      <span
        className="text-lg leading-none transition-transform duration-300 group-hover:rotate-12"
        aria-hidden
      >
        {isDark ? '☀' : '☾'}
      </span>
    </button>
  )
}
