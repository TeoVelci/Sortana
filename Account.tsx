
import React, { useState, useEffect } from 'react';
import { useApp } from './AppContext';
import { useToast } from './ToastContext';

const Account: React.FC = () => {
  const { user, storage, getStoragePercentage, formatSize, updateUser } = useApp();
  const { showToast } = useToast();

  const [usernameForm, setUsernameForm] = useState(user.username);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  // Keep local form in sync if external user updates (optional)
  useEffect(() => {
    setUsernameForm(user.username);
  }, [user.username]);

  const handleUsernameUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if(usernameForm) {
      updateUser({ username: usernameForm });
      showToast('Username updated successfully', 'success');
    }
  };

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
        showToast('Passwords do not match', 'error');
        return;
    }
    // Simulation
    showToast('Password changed successfully', 'success');
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  const storagePercent = getStoragePercentage();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-10">
      {/* Page Header */}
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Account Settings</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage your account details, subscription, and security preferences.</p>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left Column */}
        <div className="space-y-8">
          {/* CARD 1: Account Information */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-8 border border-gray-100 dark:border-dark-600 shadow-card dark:shadow-none">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 border-b border-gray-100 dark:border-dark-600 pb-2">Account Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Username</p>
                <p className="text-gray-900 dark:text-white font-medium">{user.username}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Email</p>
                <p className="text-gray-900 dark:text-white font-medium">{user.email}</p>
              </div>
            </div>
          </div>

          {/* CARD 2: Subscription & Usage */}
          <div id="account-plan" className="bg-white dark:bg-dark-800 rounded-xl p-8 border border-gray-100 dark:border-dark-600 shadow-card dark:shadow-none">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 border-b border-gray-100 dark:border-dark-600 pb-2">Subscription &amp; Usage</h2>
            <div className="flex justify-between items-center mb-6">
              <div className="flex flex-col items-start">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Plan</p>
                <p className="text-brand-purple dark:text-brand-purple font-bold text-lg">{user.plan}</p>
              </div>
              <button className="bg-brand-purple hover:bg-purple-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all shadow-sm">
                Manage Subscription
              </button>
            </div>
            <div id="account-storage">
              <div className="flex justify-between items-end mb-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">Storage Usage</p>
                <p className="text-xs text-brand-purple font-medium">{Math.round(storagePercent)}%</p>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-3 bg-gray-100 dark:bg-dark-700 rounded-full overflow-hidden border border-gray-200 dark:border-dark-600 relative">
                <div className="absolute top-0 left-0 h-full bg-brand-purple rounded-full transition-all duration-1000" style={{ width: `${storagePercent}%` }}></div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{formatSize(storage.usedBytes)} of {formatSize(storage.limitBytes)} used</p>
            </div>
          </div>

          {/* Developer Controls - Visible for testing */}
          <div id="account-debug" className="mt-8 pt-8 border-t border-gray-200 dark:border-white/10">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Developer Tools (Debug)</h3>
              <div className="flex items-center gap-4 bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-xl border border-yellow-200 dark:border-yellow-700/30">
                  <i className="fa-solid fa-bug text-yellow-600 dark:text-yellow-500"></i>
                  <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Simulate Plan Tier</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Test UI restrictions for different subscription levels.</p>
                  </div>
                  <select
                      value={user.plan}
                      onChange={(e) => updateUser({ plan: e.target.value })}
                      className="bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-sm px-3 py-2 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-yellow-500"
                  >
                      <option value="Free">Free</option>
                      <option value="Basic">Basic</option>
                      <option value="Pro">Pro</option>
                      <option value="Studio">Studio</option>
                  </select>
              </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          {/* CARD 3: Update Username */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-8 border border-gray-100 dark:border-dark-600 shadow-card dark:shadow-none">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 border-b border-gray-100 dark:border-dark-600 pb-2">Update Username</h2>
            <form onSubmit={handleUsernameUpdate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2" htmlFor="new-username">New Username</label>
                <input 
                  id="new-username"
                  type="text"
                  placeholder="Enter new username"
                  value={usernameForm}
                  onChange={(e) => setUsernameForm(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg p-3 text-gray-900 dark:text-white focus:outline-none focus:border-brand-purple dark:focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-colors placeholder-gray-400"
                />
              </div>
              <button type="submit" className="w-full bg-brand-purple hover:bg-purple-600 text-white font-semibold py-3 rounded-lg transition-all shadow-sm">
                Update Username
              </button>
            </form>
          </div>

          {/* CARD 4: Change Password */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-8 border border-gray-100 dark:border-dark-600 shadow-card dark:shadow-none">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 border-b border-gray-100 dark:border-dark-600 pb-2">Change Password</h2>
            <form onSubmit={handlePasswordUpdate} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2" htmlFor="current-password">Current Password</label>
                <input 
                  id="current-password"
                  type="password"
                  placeholder="Enter current password"
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg p-3 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2" htmlFor="new-password">New Password</label>
                <input 
                  id="new-password"
                  type="password"
                  placeholder="Enter new password"
                  value={passwordForm.new}
                  onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg p-3 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2" htmlFor="confirm-password">Confirm New Password</label>
                <input 
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg p-3 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-colors"
                />
              </div>

              {/* Password Strength Indicator (Visual Only) */}
              <div aria-label="Password strength" className="flex gap-2 pt-1">
                <div className="h-1.5 flex-1 bg-gray-200 dark:bg-dark-600 rounded-full"></div>
                <div className="h-1.5 flex-1 bg-gray-200 dark:bg-dark-600 rounded-full"></div>
                <div className="h-1.5 flex-1 bg-gray-200 dark:bg-dark-600 rounded-full"></div>
                <div className="h-1.5 flex-1 bg-gray-200 dark:bg-dark-600 rounded-full"></div>
                <div className="h-1.5 flex-1 bg-gray-200 dark:bg-dark-600 rounded-full"></div>
              </div>

              <button type="submit" className="w-full bg-brand-purple hover:bg-purple-600 text-white font-semibold py-3 rounded-lg transition-all shadow-sm mt-4">
                Change Password
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;
