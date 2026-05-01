import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { useToast } from './ToastContext';
import { supabase } from './supabaseClient';

const Login: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email || !password) return;

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        showToast(error.message, 'error');
        setIsLoading(false);
    } else {
        showToast(`Welcome back!`, 'success');
        navigate('/dashboard');
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
    });
    if (error) showToast(error.message, 'error');
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Please enter your details to sign in.">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            <button type="button" onClick={handleGoogleLogin} className="flex items-center justify-center gap-3 w-full py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-surface-dark transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                Sign in with Google
            </button>


            <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-dark-800 px-2 text-gray-500">Or sign in with email</span>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        required
                    />
                </div>
            </div>

            <div className="flex justify-between items-center text-xs mt-2">
                <label className="flex items-center gap-2 cursor-pointer text-gray-500 hover:text-gray-900 dark:hover:text-white">
                    <input type="checkbox" className="rounded text-brand-purple focus:ring-brand-purple bg-gray-100 dark:bg-dark-900 border-gray-300 dark:border-gray-600" />
                    Remember me
                </label>
                <Link to="/forgot-password" className="text-brand-purple hover:underline font-medium">Forgot Password?</Link>
            </div>

            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-brand-purple hover:bg-purple-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-purple/20 mt-4 disabled:opacity-70 disabled:cursor-wait"
            >
                {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Sign In'}
            </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-8">
            Don't have an account? <Link to="/signup" className="text-brand-purple font-bold hover:underline">Sign up for free</Link>
        </p>
    </AuthLayout>
  );
};

export default Login;