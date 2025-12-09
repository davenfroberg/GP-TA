import { type ThemeClasses } from "./theme";

export function StatusBanner({ message, themeClasses }: { message: string | null; themeClasses: ThemeClasses }) {
  if (!message) return null;

  return (
    <div
      className={`p-3 rounded-xl text-sm ${
        themeClasses.isDark
          ? "bg-green-500/20 border border-green-500/50 text-green-300"
          : "bg-green-50 border border-green-200 text-green-700"
      }`}
    >
      {message}
    </div>
  );
}

export function ErrorBanner({ message, themeClasses }: { message: string | null; themeClasses: ThemeClasses }) {
  if (!message) return null;

  return (
    <div
      className={`p-3 rounded-xl text-sm ${
        themeClasses.isDark
          ? "bg-red-500/20 border border-red-500/50 text-red-300"
          : "bg-red-50 border border-red-200 text-red-700"
      }`}
    >
      {message}
    </div>
  );
}

