import { type ThemeClasses } from "./theme";

export type ForgotPasswordProps = {
  resetStage: "request" | "code" | "password";
  isLoading: boolean;
  themeClasses: ThemeClasses;
  confirmationCode: string;
  setConfirmationCode: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  onBack: () => void;
  onSendCode: () => void;
  onAdvanceToPassword: () => void;
  onConfirmReset: () => void;
  canSendCode: boolean;
};

export function ForgotPasswordSection({
  resetStage,
  isLoading,
  themeClasses,
  confirmationCode,
  setConfirmationCode,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  onBack,
  onSendCode,
  onAdvanceToPassword,
  onConfirmReset,
  canSendCode,
}: ForgotPasswordProps) {
  return (
    <div className="space-y-3">
      {resetStage !== "password" && (
        <p className={`text-sm ${themeClasses.subtitle}`}>
          Enter your email address and we'll send you a verification code to reset your password.
        </p>
      )}
      <button type="button" onClick={onBack} className={`text-sm ${themeClasses.link} transition-colors cursor-pointer`}>
        ← Back to sign in
      </button>
      {resetStage === "request" && (
        <button
          type="button"
          onClick={onSendCode}
          disabled={isLoading || !canSendCode}
          className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
            isLoading || !canSendCode
              ? `${themeClasses.button} opacity-50 cursor-not-allowed`
              : `${themeClasses.button} hover:scale-[1.02] transform cursor-pointer active:scale-95`
          } shadow-sm`}
        >
          {isLoading ? "Sending..." : "Send code"}
        </button>
      )}

      {resetStage === "code" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="confirmationCode" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
              Verification code
            </label>
            <input
              id="confirmationCode"
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="Enter the code from email"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>
          <button
            type="button"
            onClick={onAdvanceToPassword}
            disabled={isLoading || !confirmationCode}
            className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
              isLoading || !confirmationCode
                ? `${themeClasses.button} opacity-50 cursor-not-allowed`
                : `${themeClasses.button} hover:scale-[1.02] transform cursor-pointer active:scale-95`
            } shadow-sm`}
          >
            {isLoading ? "Checking..." : "Submit"}
          </button>
        </div>
      )}

      {resetStage === "password" && (
        <div className="space-y-3">
          <div className={`text-sm ${themeClasses.subtitle}`}>Enter and confirm your new password.</div>
          <div>
            <label htmlFor="newPassword" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter a new password"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter the new password"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>
          <button
            type="button"
            onClick={onConfirmReset}
            disabled={isLoading || !confirmationCode || !newPassword || !confirmPassword}
            className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
              isLoading || !confirmationCode || !newPassword || !confirmPassword
                ? `${themeClasses.button} opacity-50 cursor-not-allowed`
                : `${themeClasses.button} hover:scale-[1.02] transform cursor-pointer active:scale-95`
            } shadow-sm`}
          >
            {isLoading ? "Submitting..." : "Reset password"}
          </button>
        </div>
      )}
    </div>
  );
}

export default ForgotPasswordSection;

