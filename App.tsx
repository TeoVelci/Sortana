import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './Layout';
import Dashboard from './Dashboard';
import Browse from './Browse';
import Account from './Account';
import Pricing from './Pricing';
import LandingPage, { PublicNav, PublicFooter } from './LandingPage';
import Login from './Login';
import Signup from './Signup';
import ForgotPassword from './ForgotPassword';
import { AppProvider } from './AppContext';
import { ToastProvider } from './ToastContext';
import { TourProvider } from './TourContext';
import { AuthProvider, useAuth } from './AuthContext';

// --- Route Guard Component ---
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-background-dark text-white">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// --- Public Layout Wrapper ---
const PublicLayout: React.FC<{ children: React.ReactElement }> = ({ children }) => {
    // Force dark mode for public pages (like Pricing) to match the Landing Page aesthetic
    // Wrapping in a div with "dark" class enables the dark: variants in child components
    return (
        <div className="dark">
            <div className="bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark min-h-screen flex flex-col font-sans antialiased">
                <PublicNav />
                <main className="flex-1 pt-16">
                    {children}
                </main>
                <PublicFooter />
            </div>
        </div>
    );
};

// --- Main App Content (Inner) ---
const AppContent: React.FC = () => {
    const { session } = useAuth();

    return (
        <Routes>
            {/* PUBLIC ROUTES (No Layout) */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* HYBRID ROUTE: Pricing (Public or Protected View) */}
            <Route path="/pricing" element={
                session ? (
                    <Layout><Pricing /></Layout>
                ) : (
                    <PublicLayout><Pricing /></PublicLayout>
                )
            } />

            {/* PROTECTED ROUTES (Wrapped in Layout) */}
            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <Layout><Dashboard /></Layout>
                </ProtectedRoute>
            } />
            <Route path="/browse" element={
                <ProtectedRoute>
                    <Layout><Browse /></Layout>
                </ProtectedRoute>
            } />
            <Route path="/account" element={
                <ProtectedRoute>
                    <Layout><Account /></Layout>
                </ProtectedRoute>
            } />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppProvider>
          <HashRouter>
            <TourProvider>
               <AppContent />
            </TourProvider>
          </HashRouter>
        </AppProvider>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
