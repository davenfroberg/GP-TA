import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../contexts/AuthContext";
import { buildThemeClasses } from "./theme";
import { StatusBanner, ErrorBanner } from "./Banners";

export default function Register() {
  const isDark = useTheme();
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await signup(email, password, name);
      setSuccess(true);
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1000);
    } catch (signupError) {
      console.error("Registration error:", signupError);
      setError(signupError instanceof Error ? signupError.message : "Failed to register. Please try again.");
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
          <h1 className={`text-3xl font-bold mb-2 ${themeClasses.label}`}>Create an Account</h1>
          <p className={`text-base ${themeClasses.subtitle}`}>Sign up to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>

          <div>
            <label htmlFor="name" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>

          <div>
            <label htmlFor="password" className={`block text-sm font-medium mb-2 ${themeClasses.label}`}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
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
              placeholder="Confirm your password"
              required
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-xl text-sm transition-all ${themeClasses.input} ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            />
          </div>

          <ErrorBanner message={error} themeClasses={themeClasses} />
          <StatusBanner message={success ? "Account created successfully! Redirecting to login..." : null} themeClasses={themeClasses} />

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
              "Sign up"
            )}
          </button>
        </form>

        <div className={`mt-6 text-center text-sm ${themeClasses.subtitle}`}>
          Already have an account?{" "}
          <Link to="/login" className={`font-medium ${themeClasses.link} transition-colors`}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

