import { type ThemeClasses } from "./theme";

interface PasswordRequirementsProps {
  password: string;
  themeClasses: ThemeClasses;
}

export function PasswordRequirements({ password, themeClasses }: PasswordRequirementsProps) {
  const requirements = [
    {
      text: "Contains at least 1 number",
      met: /\d/.test(password),
    },
    {
      text: "Contains at least 1 uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      text: "Contains at least 1 lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      text: "Contains at least 1 special character",
      met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    },
    {
      text: "Contains at least 8 characters total",
      met: password.length >= 8,
    },
  ];

  const bgClass = themeClasses.isDark 
    ? "bg-slate-800 border-slate-700" 
    : "bg-white border-gray-200";

  return (
    <div className={`absolute top-full left-0 right-0 mt-2 p-3 rounded-lg border shadow-xl z-50 ${bgClass} text-sm backdrop-blur-none`}>
      <div className="space-y-1.5">
        {requirements.map((req, index) => (
          <div key={index} className="flex items-center gap-2">
            {req.met ? (
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className={req.met ? `${themeClasses.label} opacity-90` : `${themeClasses.subtitle}`}>
              {req.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
