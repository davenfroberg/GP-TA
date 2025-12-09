import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../contexts/AuthContext";
import { buildThemeClasses } from "./theme";
import { EmailField, PasswordField } from "./Fields";
import { StatusBanner, ErrorBanner } from "./Banners";
import ForgotPasswordSection from "./ForgotPasswordSection";

export default function Login() {
  const isDark = useTheme();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resetStage, setResetStage] = useState<"request" | "code" | "password">("request");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const themeClasses = buildThemeClasses(isDark);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      await login(email, password);
    } catch (loginError) {
      console.error("Login error:", loginError);
      setError(loginError instanceof Error ? loginError.message : "Failed to login. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      await resetPassword({ username: email });
      setResetStage("code");
      setStatusMessage("Verification code sent. Enter the code to move to the password step.");
    } catch (resetError: any) {
      console.error("Forgot password error:", resetError);
      if (resetError.name === "UserNotFoundException") {
        setError("No account found with this email.");
      } else {
        setError(resetError.message || "Failed to send password reset email. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdvanceToPassword = () => {
    if (!confirmationCode.trim()) {
      setError("Please enter the verification code sent to your email.");
      return;
    }
    setError(null);
    setStatusMessage(null);
    setResetStage("password");
  };

  const handleConfirmReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !confirmationCode || !newPassword || !confirmPassword) {
      setError("Please provide your email, code, and new password details.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter them.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode,
        newPassword,
      });
      setStatusMessage("Password reset successful. You can now sign in with your new password.");
      setShowForgotPassword(false);
      setResetStage("request");
      setConfirmationCode("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
    } catch (confirmError: any) {
      console.error("Confirm reset password error:", confirmError);
      if (confirmError.name === "CodeMismatchException") {
        setError("Invalid confirmation code. Please check the code and try again.");
      } else if (confirmError.name === "ExpiredCodeException") {
        setError("The confirmation code has expired. Request a new code.");
      } else if (confirmError.name === "InvalidPasswordException") {
        setError("Password does not meet requirements. Try a stronger password.");
      } else {
        setError(confirmError.message || "Failed to reset password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`h-screen ${themeClasses.background} flex items-center justify-center p-4`}>
      <div className={`w-full max-w-md p-8 rounded-3xl ${themeClasses.frostedCard} transition-all duration-300`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden">
            <img src="/gpta_favicon.svg" alt="GP-TA Logo" className="w-full h-full" />
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${themeClasses.label}`}>Welcome to GP-TA</h1>
          <p className={`text-base ${themeClasses.subtitle}`}>Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!(showForgotPassword && resetStage === "password") && (
            <EmailField value={email} onChange={setEmail} disabled={isLoading} themeClasses={themeClasses} />
          )}

          {!showForgotPassword && (
            <PasswordField value={password} onChange={setPassword} disabled={isLoading} themeClasses={themeClasses} />
          )}

          <StatusBanner message={statusMessage} themeClasses={themeClasses} />
          <ErrorBanner message={error} themeClasses={themeClasses} />

          {!showForgotPassword && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setError(null);
                  setStatusMessage(null);
                  setResetStage("request");
                  setConfirmationCode("");
                  setNewPassword("");
                }}
                className={`text-sm ${themeClasses.link} transition-colors cursor-pointer`}
              >
                Forgot password?
              </button>
            </div>
          )}

          {showForgotPassword && (
            <ForgotPasswordSection
              resetStage={resetStage}
              isLoading={isLoading}
              themeClasses={themeClasses}
              confirmationCode={confirmationCode}
              setConfirmationCode={setConfirmationCode}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              onBack={() => {
                setShowForgotPassword(false);
                setError(null);
                setStatusMessage(null);
                setResetStage("request");
                setConfirmationCode("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              onSendCode={() => handleForgotPassword()}
              onAdvanceToPassword={handleAdvanceToPassword}
              onConfirmReset={() => handleConfirmReset()}
              canSendCode={!!email}
            />
          )}

          {!showForgotPassword && (
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                isLoading || !email || !password
                  ? `${themeClasses.button} opacity-50 cursor-not-allowed`
                  : `${themeClasses.button} hover:scale-[1.02] transform cursor-pointer active:scale-95`
              } shadow-sm`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          )}
        </form>

        <div className={`mt-6 text-center text-sm ${themeClasses.subtitle}`}>
          Don't have an account?{" "}
          <Link to="/register" className={`font-medium ${themeClasses.link} transition-colors`}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

