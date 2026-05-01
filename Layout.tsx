
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './AppContext';
import Copilot from './Copilot';
import { useToast } from './ToastContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, storage, getStoragePercentage, formatSize, logout, undo, redo, canUndo, canRedo, historyDescription, syncQueue, setCurrentFolderId } = useApp();
  const { showToast } = useToast();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const location = useLocation();
  const navigate = useNavigate();

  // Network Status Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize Dark Mode - Default to Dark for Obsidian Theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('color-theme');
    // Default to dark mode if not specified, to match landing page
    if (savedTheme === 'dark' || !savedTheme) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Global Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) {
            redo();
            showToast('Redo', 'info');
          }
        } else {
          if (canUndo) {
            undo();
            showToast(`Undoing: ${historyDescription || 'Action'}`, 'info');
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, historyDescription, showToast]);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isActive = (path: string) => location.pathname === path;

  const storagePercent = getStoragePercentage();

  // Sync Status
  const pendingSync = syncQueue.length;
  const syncStatus = !isOnline ? 'offline' : pendingSync > 0 ? 'syncing' : 'synced';

  return (
    <div className="font-sans antialiased min-h-screen flex flex-col lg:h-screen lg:overflow-hidden bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark">
      {/* --- Header (Glass) --- */}
      <header className="bg-white/80 dark:bg-background-dark/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 h-16 flex items-center justify-between px-6 shrink-0 z-50 transition-colors duration-200 sticky top-0 lg:relative">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-3 h-full group">
          <span className="text-3xl font-black tracking-tighter text-primary">S</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500 dark:text-gray-400">
          <Link className={`hover:text-gray-900 dark:hover:text-white transition-colors ${isActive('/pricing') ? 'text-primary dark:text-primary' : ''}`} to="/pricing">Pricing</Link>
          <Link className={`text-gray-900 dark:text-white relative ${isActive('/dashboard') ? "after:content-[''] after:absolute after:-bottom-5 after:left-0 after:w-full after:h-0.5 after:bg-primary after:shadow-[0_0_10px_rgba(99,102,241,0.5)]" : ""}`} to="/dashboard">Dashboard</Link>
          <Link
            onClick={() => setCurrentFolderId(null)}
            className={`hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer ${isActive('/browse') ? 'text-primary dark:text-primary' : ''}`}
            to="/browse"
          >
            Organized Files
          </Link>
          <Link className={`hover:text-gray-900 dark:hover:text-white transition-colors ${isActive('/account') ? 'text-primary dark:text-primary' : ''}`} to="/account">Account</Link>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-4">

          {/* NETWORK / SYNC STATUS BADGE */}
          <div className={`hidden sm:flex items-center gap-2 px-2 py-1 rounded-full text-xs font-bold border transition-colors ${syncStatus === 'offline' ? 'bg-gray-200 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' :
              syncStatus === 'syncing' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30' :
                'text-green-500 border-transparent'
            }`}>
            {syncStatus === 'offline' && (
              <>
                <i className="fa-solid fa-wifi-slash"></i>
                <span>Offline</span>
              </>
            )}
            {syncStatus === 'syncing' && (
              <>
                <i className="fa-solid fa-arrows-rotate fa-spin"></i>
                <span>Syncing ({pendingSync})</span>
              </>
            )}
            {syncStatus === 'synced' && (
              <i className="fa-solid fa-cloud-check text-sm" title="All changes synced"></i>
            )}
          </div>

          {/* UNDO / REDO BUTTONS */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-dark-800 rounded-lg p-1 border border-gray-200 dark:border-white/5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${!canUndo ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-dark-600 hover:shadow-sm'}`}
              title={`Undo ${historyDescription ? `: ${historyDescription}` : ''} (Ctrl+Z)`}
            >
              <i className="fa-solid fa-rotate-left text-xs"></i>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${!canRedo ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-dark-600 hover:shadow-sm'}`}
              title="Redo (Ctrl+Shift+Z)"
            >
              <i className="fa-solid fa-rotate-right text-xs"></i>
            </button>
          </div>

          <div className="hidden lg:flex flex-col items-end min-w-[140px]">
            <div className="text-xs text-gray-600 dark:text-gray-300 flex justify-between w-full mb-1">
              <span>{user.plan}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-dark-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full shadow-[0_0_5px_rgba(99,102,241,0.5)]" style={{ width: `${storagePercent}%` }}></div>
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatSize(storage.usedBytes)} / {formatSize(storage.limitBytes)}</span>
          </div>

          <div className="hidden md:flex items-center gap-2 group relative">
            <Link to="/account" className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-dark-700 flex items-center justify-center overflow-hidden border border-transparent hover:border-primary transition-colors">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <i className="fa-solid fa-user"></i>
                )}
              </div>
              <span className="hidden sm:inline text-sm font-medium">{user.username}</span>
            </Link>

            {/* Simple Dropdown for Logout */}
            <div className="absolute right-0 top-full mt-2 w-32 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all transform origin-top-right z-50">
              <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-white/5 first:rounded-t-lg last:rounded-b-lg">
                Log Out
              </button>
            </div>
          </div>

          <button onClick={toggleTheme} className="flex items-center justify-center bg-gray-100 dark:bg-dark-700 rounded-full w-8 h-8 border border-gray-300 dark:border-white/10 text-yellow-500 hover:bg-white dark:hover:bg-dark-600 transition-colors">
            <i className={`fa-solid ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-xs`}></i>
          </button>

          <button onClick={toggleMobileMenu} className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2">
            <i className="fa-solid fa-bars text-xl"></i>
          </button>
        </div>
      </header>

      {/* --- Mobile Menu Overlay --- */}
      <div className={`fixed inset-0 z-[60] bg-white dark:bg-background-dark transform transition-transform duration-300 ease-in-out md:hidden flex flex-col pt-20 px-6 ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <button onClick={toggleMobileMenu} className="absolute top-5 right-6 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2">
          <i className="fa-solid fa-xmark text-2xl"></i>
        </button>
        <nav className="flex flex-col gap-6 text-lg font-medium text-gray-900 dark:text-white mt-4">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-white/10">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-dark-700 flex items-center justify-center">
              <i className="fa-solid fa-user"></i>
            </div>
            <div>
              <p>{user.username}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.plan}</p>
            </div>
          </div>
          <Link to="/dashboard" onClick={toggleMobileMenu} className="flex items-center gap-3 text-primary"><i className="fa-solid fa-border-all w-6 text-center"></i> Dashboard</Link>
          <Link to="/browse" onClick={() => { toggleMobileMenu(); setCurrentFolderId(null); }} className="flex items-center gap-3 hover:text-primary transition-colors"><i className="fa-solid fa-folder-tree w-6 text-center"></i> Organized Files</Link>
          <Link to="/pricing" onClick={toggleMobileMenu} className="flex items-center gap-3 hover:text-primary transition-colors"><i className="fa-solid fa-tag w-6 text-center"></i> Pricing</Link>
          <Link to="/account" onClick={toggleMobileMenu} className="flex items-center gap-3 hover:text-primary transition-colors"><i className="fa-solid fa-gear w-6 text-center"></i> Account Settings</Link>
          <button onClick={handleLogout} className="flex items-center gap-3 text-red-500 mt-4"><i className="fa-solid fa-right-from-bracket w-6 text-center"></i> Log Out</button>
        </nav>
      </div>

      {/* --- Main Content Layout --- */}
      <div className="flex flex-col lg:flex-1 lg:overflow-hidden lg:flex-row">
        {/* Sidebar (Glass) */}
        <aside className="w-full lg:w-64 bg-white dark:bg-surface-dark lg:flex-shrink-0 flex flex-col border-b lg:border-r border-gray-200 dark:border-white/5 py-6 hidden md:flex transition-colors duration-200">
          <div className="px-3">
            <div className="mb-6 border-b border-gray-200 dark:border-white/10 pb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Storage</span>
                <span>{Math.round(storagePercent)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-primary to-indigo-400 h-full rounded-full transition-all duration-1000" style={{ width: `${storagePercent}%` }}></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{formatSize(storage.usedBytes)} of {formatSize(storage.limitBytes)} Used</p>
            </div>
          </div>
          <nav className="flex-1 space-y-2 px-3">
            <Link className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-transparent transition-all group ${isActive('/dashboard') ? 'text-gray-900 dark:text-white border-gray-200 dark:border-white/10 shadow-sm bg-gray-100 dark:bg-white/5' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'}`} to="/dashboard">
              <i className={`fa-solid fa-border-all w-5 text-center ${isActive('/dashboard') ? 'text-primary' : 'group-hover:text-gray-700 dark:group-hover:text-gray-200'}`}></i>
              <span className="font-medium">Dashboard</span>
            </Link>
            <Link
              id="nav-browse"
              onClick={() => setCurrentFolderId(null)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-transparent transition-all group ${isActive('/browse') ? 'text-gray-900 dark:text-white border-gray-200 dark:border-white/10 shadow-sm bg-gray-100 dark:bg-white/5' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'}`} to="/browse"
            >
              <i className={`fa-solid fa-folder-tree w-5 text-center ${isActive('/browse') ? 'text-primary' : 'group-hover:text-gray-700 dark:group-hover:text-gray-200'}`}></i>
              <span className="font-medium">Organized Files</span>
            </Link>
            <Link className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-transparent transition-all group ${isActive('/account') ? 'text-gray-900 dark:text-white border-gray-200 dark:border-white/10 shadow-sm bg-gray-100 dark:bg-white/5' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'}`} to="/account">
              <i className={`fa-solid fa-gear w-5 text-center ${isActive('/account') ? 'text-primary' : 'group-hover:text-gray-700 dark:group-hover:text-gray-200'}`}></i>
              <span className="font-medium">Settings</span>
            </Link>
          </nav>
        </aside>

        {/* Main View Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative h-auto">
          {children}

          <footer className="mt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500 pb-2">
            <p>© 2025 Sortana AI. All Rights Reserved.</p>
            <div className="flex gap-4 mt-2 md:mt-0">
              <Link className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" to="/terms">Terms of Service</Link>
              <Link className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" to="/privacy">Privacy Policy</Link>
            </div>
          </footer>
        </main>
      </div>

      {/* --- Global Components --- */}
      <Copilot />

    </div>
  );
};

export default Layout;
