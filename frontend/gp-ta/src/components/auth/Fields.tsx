import { type ThemeClasses } from "./theme";

type CommonFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  themeClasses: ThemeClasses;
};

export function EmailField({ value, onChange, disabled, themeClasses }: CommonFieldProps) {
  return (
    <div>
      <label htmlFor="email" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
        Email
      </label>
      <input
        id="email"
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your email"
        required
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}

export function PasswordField({ value, onChange, disabled, themeClasses }: CommonFieldProps) {
  return (
    <div>
      <label htmlFor="password" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
        Password
      </label>
      <input
        id="password"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your password"
        required
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}

