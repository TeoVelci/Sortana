import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { useToast } from './ToastContext';
import { supabase } from './supabaseClient';

const ForgotPassword: React.FC = () => {
  const { showToast } = useToast();
  
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email) return;

    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
        showToast(error.message, 'error');
        setIsLoading(false);
    } else {
        setIsLoading(false);
        setIsSent(true);
        showToast('Reset link sent!', 'success');
    }
  };

  if (isSent) {
      return (
        <AuthLayout title="Check your email" subtitle={`We sent a reset link to ${email}`}>
            <div className="flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                    <i className="fa-regular fa-envelope text-2xl text-green-500"></i>
                </div>
                <p className="text-sm text-gray-500 mb-8">
                    Click the link in the email to reset your password. If you don't see it, check your spam folder.
                </p>
                <Link to="/login" className="text-brand-purple font-bold hover:underline flex items-center gap-2">
                    <i className="fa-solid fa-arrow-left"></i> Back to Login
                </Link>
            </div>
        </AuthLayout>
      );
  }

  return (
    <AuthLayout title="Forgot Password?" subtitle="No worries, we'll send you reset instructions.">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-dark-600 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        required
                    />
                </div>
            </div>

            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-brand-purple hover:bg-purple-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-purple/20 mt-4 disabled:opacity-70 disabled:cursor-wait"
            >
                {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Send Reset Link'}
            </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-8">
            <Link to="/login" className="text-gray-600 dark:text-gray-400 hover:text-brand-purple flex items-center justify-center gap-2 transition-colors">
                <i className="fa-solid fa-arrow-left"></i> Back to Login
            </Link>
        </p>
    </AuthLayout>
  );
};

export default ForgotPassword;