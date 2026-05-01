import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container - Fixed to bottom right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[300px] flex items-center gap-3 px-4 py-3.5 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 backdrop-blur-md border transition-all duration-300 animate-[slideIn_0.3s_ease-out] ${
              toast.type === 'success' 
                ? 'bg-white/95 dark:bg-dark-800/95 border-green-500/30' 
                : toast.type === 'error'
                ? 'bg-white/95 dark:bg-dark-800/95 border-red-500/30'
                : 'bg-white/95 dark:bg-dark-800/95 border-brand-purple/30'
            }`}
          >
            {/* Icon */}
            <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
               toast.type === 'success' ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' :
               toast.type === 'error' ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' :
               'bg-purple-100 text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple'
            }`}>
              <i className={`fa-solid ${
                toast.type === 'success' ? 'fa-check' : 
                toast.type === 'error' ? 'fa-exclamation' : 'fa-info'
              } text-xs`}></i>
            </div>

            {/* Content */}
            <p className="text-sm font-medium text-gray-900 dark:text-white flex-1">{toast.message}</p>

            {/* Dismiss */}
            <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
