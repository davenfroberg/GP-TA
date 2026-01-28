import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import { useTheme } from "../../hooks/useTheme";
import { useAuth, VerificationRequiredError } from "../../contexts/AuthContext";
import { buildThemeClasses } from "./theme";
import { EmailField, PasswordField } from "./Fields";
import { StatusBanner, ErrorBanner } from "./Banners";
import ForgotPasswordSection from "./ForgotPasswordSection";

export default function Login() {
  const isDark = useTheme();
  const navigate = useNavigate();
  const { login, confirmSignup, resendVerificationCode, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resetStage, setResetStage] = useState<"request" | "code" | "password">("request");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
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
    } catch (loginError: any) {
      console.error("Login error:", loginError);
      console.error("Login error type:", typeof loginError);
      console.error("Login error constructor:", loginError?.constructor?.name);
      console.error("Login error instanceof VerificationRequiredError:", loginError instanceof VerificationRequiredError);
      console.error("Login error name:", loginError?.name);
      console.error("Login error message:", loginError?.message);

      // Check if this is a verification required error
      const errorMessage = loginError?.message || '';
      const isVerificationError = loginError instanceof VerificationRequiredError ||
                                  loginError?.name === 'VerificationRequiredError' ||
                                  errorMessage.includes('verify your email address') ||
                                  errorMessage.includes('verification code has been sent');

      console.log('isVerificationError:', isVerificationError);
      console.log('errorMessage:', errorMessage);

      if (isVerificationError) {
        console.log('Setting showVerification to true');
        setShowVerification(true);
        setStatusMessage(errorMessage || 'Please verify your email address. A verification code has been sent.');
        setError(null);
      } else {
        setError(loginError instanceof Error ? loginError.message : "Failed to login. Please try again.");
      }
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

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      await confirmSignup(email, verificationCode.trim());
      setStatusMessage("Account verified! You can now sign in.");
      setShowVerification(false);
      setVerificationCode("");
    } catch (verifyError) {
      console.error("Verification error:", verifyError);
      setError(verifyError instanceof Error ? verifyError.message : "Failed to verify. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      await resendVerificationCode(email);
      setStatusMessage("A new verification code has been sent to your email.");
    } catch (resendError) {
      console.error("Resend code error:", resendError);
      setError(resendError instanceof Error ? resendError.message : "Failed to resend code. Please try again.");
    } finally {
      setIsLoading(false);
    }
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
    <div className={`h-screen ${themeClasses.background} relative overflow-hidden flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-emerald-400/10 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_20%_20%,#a5b4fc_0,transparent_25%),radial-gradient(circle_at_80%_0%,#5eead4_0,transparent_20%),radial-gradient(circle_at_50%_100%,#a5b4fc_0,transparent_20%)]" />

      <div className="relative z-10 w-full max-w-md">
        <div className={`p-8 rounded-3xl ${themeClasses.frostedCard} transition-all duration-300`}>
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 overflow-hidden">
              <img src="/gpta_favicon.svg" alt="GP-TA Logo" className="w-full h-full" />
            </div>
            <h1 className={`text-3xl font-bold mb-2 ${themeClasses.label}`}>GP-TA</h1>
            <p className={`text-base ${themeClasses.subtitle}`}>Sign in or create an account</p>
          </div>

          {showVerification ? (
            <form onSubmit={handleVerifySubmit} className="space-y-5">
              <p className={`text-sm text-center ${themeClasses.label}`}>
                Check your inbox at <span className="font-medium">{email}</span> for a 6-digit verification code. Enter it below.
              </p>
              <div>
                <label htmlFor="verificationCode" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
                  Verification code
                </label>
                <input
                  id="verificationCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  disabled={isLoading}
                  className={`w-full px-4 py-3 rounded-xl text-sm text-center tracking-[0.5em] transition-all ${themeClasses.input} ${
                    isLoading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                />
              </div>
              <StatusBanner message={statusMessage} themeClasses={themeClasses} />
              <ErrorBanner message={error} themeClasses={themeClasses} />
              <button
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                  isLoading || verificationCode.length !== 6
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
                    Verifying...
                  </span>
                ) : (
                  "Verify"
                )}
              </button>
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className={`text-sm ${themeClasses.link} transition-colors ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVerification(false);
                    setVerificationCode("");
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className={`text-sm ${themeClasses.link} transition-colors cursor-pointer`}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
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
          )}

          <div className={`mt-6 text-center text-sm ${themeClasses.subtitle}`}>
            Don't have an account?{" "}
            <Link to="/register" className={`font-medium ${themeClasses.link} transition-colors`}>
              Sign up
            </Link>
          </div>
        </div>

      <div className={`mt-6 text-center text-xs ${themeClasses.subtitle}`}>
        By using GP-TA you agree to our{" "}
        <Link to="/terms" className={`underline ${themeClasses.link}`}>
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className={`underline ${themeClasses.link}`}>
          Privacy Policy
        </Link>
        .
      </div>
      </div>
    </div>
  );
}

