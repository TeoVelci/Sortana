import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { useToast } from './ToastContext';
import { supabase } from './supabaseClient';

const Signup: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email || !password || !name) return;

    setIsLoading(true);

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: name,
            },
        },
    });

    if (error) {
        showToast(error.message, 'error');
        setIsLoading(false);
    } else {
        showToast('Account created! Please check your email to verify.', 'success');
        navigate('/login');
    }
  };

  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
    });
    if (error) showToast(error.message, 'error');
  };

  return (
    <AuthLayout title="Create an account" subtitle="Start organizing your media intelligently today.">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            <button type="button" onClick={handleGoogleSignup} className="flex items-center justify-center gap-3 w-full py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-surface-dark transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                Sign up with Google
            </button>

            <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-dark-800 px-2 text-gray-500">Or continue with email</span>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        required
                    />
                </div>
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
                        placeholder="Create a strong password"
                        className="w-full bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        required
                    />
                </div>
            </div>

            <div className="text-xs text-gray-500 mt-2 leading-relaxed">
                By creating an account, you agree to our <span className="text-brand-purple cursor-pointer">Terms of Service</span> and <span className="text-brand-purple cursor-pointer">Privacy Policy</span>.
            </div>

            <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-brand-purple hover:bg-purple-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-purple/20 mt-2 disabled:opacity-70 disabled:cursor-wait"
            >
                {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : 'Create Account'}
            </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-8">
            Already have an account? <Link to="/login" className="text-brand-purple font-bold hover:underline">Log in</Link>
        </p>
    </AuthLayout>
  );
};

export default Signup;