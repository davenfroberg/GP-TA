import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../contexts/AuthContext";
import { buildThemeClasses } from "./theme";
import { ErrorBanner } from "./Banners";
import { PasswordRequirements } from "./PasswordRequirements";

export default function Register() {
  const isDark = useTheme();
  const navigate = useNavigate();
  const { signup, confirmSignup, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const themeClasses = buildThemeClasses(isDark);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !name || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const passwordRequirements = [
      { test: /\d/.test(password), message: "Password must contain at least 1 number." },
      { test: /[A-Z]/.test(password), message: "Password must contain at least 1 uppercase letter." },
      { test: /[a-z]/.test(password), message: "Password must contain at least 1 lowercase letter." },
      { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), message: "Password must contain at least 1 special character." },
      { test: password.length >= 8, message: "Password must be at least 8 characters long." },
    ];

    const failedRequirement = passwordRequirements.find(req => !req.test);
    if (failedRequirement) {
      setError(failedRequirement.message);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await signup(email, password, name);
      setSuccess(true);
    } catch (signupError) {
      console.error("Registration error:", signupError);
      setError(signupError instanceof Error ? signupError.message : "Failed to register. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await confirmSignup(email, verificationCode.trim());
      setConfirmed(true);
    } catch (confirmError) {
      console.error("Verification error:", confirmError);
      setError(confirmError instanceof Error ? confirmError.message : "Failed to verify. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`h-screen ${themeClasses.background} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-emerald-400/10 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_20%_20%,#a5b4fc_0,transparent_25%),radial-gradient(circle_at_80%_0%,#5eead4_0,transparent_20%),radial-gradient(circle_at_50%_100%,#a5b4fc_0,transparent_20%)]" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl">
            <div className={`p-8 rounded-3xl border ${themeClasses.frostedCard} transition-all duration-300`}>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden shadow-md mb-4">
                  <img src="/gpta_favicon.svg" alt="GP-TA Logo" className="w-full h-full" />
                </div>
                <h2 className={`text-3xl font-bold mt-1 ${themeClasses.label}`}>Let’s get you set up</h2>
                <p className={`text-sm mt-1 ${themeClasses.subtitle}`}>Create your account to start learning faster.</p>
              </div>

              {confirmed ? (
                <div className="space-y-5 text-center">
                  <p className={`text-sm ${themeClasses.label}`}>
                    You're all set! Sign in with your new account.
                  </p>
                  <Link
                    to="/login"
                    className={`inline-block w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${themeClasses.button} hover:scale-[1.02] transform cursor-pointer active:scale-95 shadow-sm text-center`}
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : success ? (
                <form onSubmit={handleConfirmSubmit} className="space-y-5">
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
                </form>
              ) : (
                <>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label htmlFor="email" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
                          Email
                        </label>
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          disabled={isLoading}
                          className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                            isLoading ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label htmlFor="name" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
                          Name
                        </label>
                        <input
                          id="name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="How should we address you?"
                          required
                          disabled={isLoading}
                          className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                            isLoading ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        />
                      </div>

                      <div className="relative">
                        <label htmlFor="password" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
                          Password
                        </label>
                        <input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={() => setIsPasswordFocused(true)}
                          onBlur={() => setIsPasswordFocused(false)}
                          placeholder="At least 8 characters"
                          required
                          disabled={isLoading}
                          className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                            isLoading ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        />
                        {isPasswordFocused && (
                          <PasswordRequirements password={password} themeClasses={themeClasses} />
                        )}
                      </div>

                      <div>
                        <label htmlFor="confirmPassword" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
                          Confirm Password
                        </label>
                        <input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your password"
                          required
                          disabled={isLoading}
                          className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                            isLoading ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <ErrorBanner message={error} themeClasses={themeClasses} />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !email || !name || !password || !confirmPassword}
                      className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                        isLoading || !email || !name || !password || !confirmPassword
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
                          Creating account...
                        </span>
                      ) : (
                        "Create account"
                      )}
                    </button>
                  </form>

                  <div className={`mt-6 text-center text-sm ${themeClasses.subtitle}`}>
                    Already have an account?{" "}
                    <Link to="/login" className={`font-medium ${themeClasses.link} transition-colors`}>
                      Sign in
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className={`mt-6 text-center text-xs ${themeClasses.subtitle}`}>
              By signing up, you agree to our{" "}
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
      </div>
    </div>
  );
}

