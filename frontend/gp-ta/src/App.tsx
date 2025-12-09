import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './config/amplify'; // Initialize Amplify
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PiazzaChat from './components/chat/PiazzaChat';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ProtectedRoute from './components/ProtectedRoute';
import TermsOfService from './components/static/TermsOfService';
import PrivacyPolicy from './components/static/PrivacyPolicy';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Login />
        }
      />

      <Route
        path="/register"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Register />
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <PiazzaChat />
          </ProtectedRoute>
        }
      />

      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
