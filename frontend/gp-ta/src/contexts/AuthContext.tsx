import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { signIn, signOut, signUp, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<any | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setIsChecking(true);
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();

      if (currentUser && session.tokens) {
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      // User is not authenticated
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsChecking(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const output = await signIn({ username: email, password });

      // Check if sign in is complete
      if (output.isSignedIn) {
        const currentUser = await getCurrentUser();
        const session = await fetchAuthSession();

        if (currentUser && session.tokens) {
          setUser(currentUser);
          setIsAuthenticated(true);
        }
      } else {
        // Additional authentication steps required (MFA, etc.)
        throw new Error('Additional authentication steps required.');
      }
    } catch (error: any) {
      // Handle specific Cognito errors
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Incorrect email or password.');
      } else if (error.name === 'UserNotConfirmedException') {
        throw new Error('Please confirm your email address before signing in.');
      } else if (error.name === 'UserNotFoundException') {
        throw new Error('No account found with this email.');
      } else if (error.name === 'InvalidParameterException') {
        throw new Error('Invalid email or password format.');
      } else {
        throw new Error(error.message || 'Failed to sign in. Please try again.');
      }
    }
  };


  const signup = async (email: string, password: string, name: string) => {
    try {
      // Sign up with Cognito
      const { userId } = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name,
          },
          autoSignIn: {
            enabled: false, // Don't auto sign in, user needs to confirm email first
          },
        },
      });

      // Call backend API to create user entry in DynamoDB
      const apiUrl = import.meta.env.VITE_USERS_API_URL || import.meta.env.VITE_REGISTER_API_URL || '';
      if (apiUrl) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              name,
              userId,
            }),
          });

          if (!response.ok) {
            console.error('Failed to create user in DynamoDB:', await response.text());
            // Don't throw here - Cognito signup succeeded, DynamoDB is secondary
          }
        } catch (apiError) {
          console.error('Error calling registration API:', apiError);
          // Don't throw here - Cognito signup succeeded, DynamoDB is secondary
        }
      }

      // Return success - user will need to confirm email before signing in
    } catch (error: any) {
      // Handle specific Cognito errors
      if (error.name === 'UsernameExistsException') {
        throw new Error('An account with this email already exists.');
      } else if (error.name === 'InvalidPasswordException') {
        throw new Error('Password does not meet requirements.');
      } else if (error.name === 'InvalidParameterException') {
        throw new Error('Invalid email or password format.');
      } else {
        throw new Error(error.message || 'Failed to create account. Please try again.');
      }
    }
  };

  const logout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      // Still clear local state even if signOut fails
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      document.title = 'GP-TA';
    }
  };

  // Show loading state while checking auth
  if (isChecking) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, signup, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

