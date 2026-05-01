import React from 'react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-900 p-4">
      <div className="w-full max-w-5xl bg-white dark:bg-dark-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px] border border-gray-200 dark:border-dark-600">
        
        {/* Left Side (Visual) */}
        <div className="hidden md:flex flex-col justify-between w-1/2 p-8 bg-gradient-to-br from-blue-600 to-slate-900 relative overflow-hidden">
          {/* Background shapes */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 rounded-full bg-blue-400/20 blur-3xl"></div>
          
          <div className="relative z-10">
            <Link to="/" className="flex items-center gap-2 mb-8 group">
              <span className="text-4xl font-black tracking-tighter text-white drop-shadow-md">S</span>
            </Link>
            
            <h2 className="text-3xl font-bold text-white mb-4">Your media library,<br/>finally intelligent.</h2>
            <p className="text-blue-100 text-sm leading-relaxed max-w-sm">
              "Sortana saved me 15 hours on my last wedding shoot. The AI culling is practically magic."
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3">
             <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="User" className="w-10 h-10 rounded-full border-2 border-white/30" />
             <div>
                 <p className="text-white text-sm font-bold">Sarah Jenkins</p>
                 <p className="text-blue-200 text-xs">Wedding Photographer</p>
             </div>
          </div>
        </div>

        {/* Right Side (Form) */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative">
            <Link to="/" className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-xl"></i>
            </Link>
            
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{subtitle}</p>
            </div>

            {children}
        </div>

      </div>
    </div>
  );
};

export default AuthLayout;