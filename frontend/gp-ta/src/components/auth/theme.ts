export function buildThemeClasses(isDark: boolean) {
  return {
    isDark,
    background: isDark
      ? "bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white"
      : "bg-gradient-to-b from-blue-50 via-white to-blue-100 text-gray-900",
    frostedCard: isDark
      ? "bg-white/10 border border-white/20 text-white backdrop-blur-sm shadow-2xl"
      : "bg-white/80 border border-gray-300/40 text-gray-900 backdrop-blur-md shadow-2xl",
    input: isDark
      ? "bg-slate-700 border border-white/20 placeholder-white/60 text-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
      : "bg-white border border-gray-300 placeholder-gray-400 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
    button: isDark
      ? "bg-slate-600 hover:bg-slate-500 border border-white/20 text-white"
      : "bg-black hover:bg-black/80 text-white",
    label: isDark ? "text-white" : "text-gray-700",
    link: isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-500 hover:text-blue-700",
    subtitle: isDark ? "text-white/70" : "text-gray-600",
  };
}

export type ThemeClasses = ReturnType<typeof buildThemeClasses>;

