
import React, { useState, useEffect, useMemo } from 'react';
import { useApp, FileSystemItem } from './AppContext';
import { useToast } from './ToastContext';

interface CleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DuplicateGroup {
  id: string;
  type: 'exact' | 'burst';
  items: FileSystemItem[];
  keepId: string | null; // ID of the file to keep
}

const CleanupModal: React.FC<CleanupModalProps> = ({ isOpen, onClose }) => {
  const { items, user, bulkDeleteItems, formatSize } = useApp();
  const { showToast } = useToast();
  
  const [step, setStep] = useState<'intro' | 'scanning' | 'review' | 'success'>('intro');
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  // Plan Check
  const isPro = ['Pro', 'Studio'].includes(user.plan);
  const isBasic = user.plan === 'Basic';
  const isFree = user.plan === 'Free';

  // Reset on open
  useEffect(() => {
      if (isOpen) {
          setStep('intro');
          setGroups([]);
          setSelectedGroups(new Set());
      }
  }, [isOpen]);

  const scanFiles = () => {
      setStep('scanning');
      
      // Simulate processing time for UX
      setTimeout(() => {
          const files = items.filter(i => i.type === 'file');
          const newGroups: DuplicateGroup[] = [];

          // 1. EXACT DUPLICATES (Name + Size match)
          // Available for Basic, Pro, Studio
          if (!isFree) {
            const map = new Map<string, FileSystemItem[]>();
            files.forEach(f => {
                const key = `${f.name}|${f.size}`;
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(f);
            });

            map.forEach((group, key) => {
                if (group.length > 1) {
                    newGroups.push({
                        id: `exact-${key}`,
                        type: 'exact',
                        items: group,
                        keepId: group[0].id // Default keep first found
                    });
                }
            });
          }

          // 2. BURST SHOTS (Time proximity < 1s)
          // Available for Pro, Studio
          if (isPro) {
              const images = files.filter(f => f.fileType === 'image').sort((a,b) => (a.dateTaken || 0) - (b.dateTaken || 0));
              let currentBurst: FileSystemItem[] = [];

              for (let i = 0; i < images.length; i++) {
                  const curr = images[i];
                  const prev = currentBurst[currentBurst.length - 1];

                  if (!prev) {
                      currentBurst.push(curr);
                  } else {
                      const timeDiff = Math.abs((curr.dateTaken || 0) - (prev.dateTaken || 0));
                      // Check if same folder and taken within 1s
                      if (timeDiff < 1000 && (curr.parentId || null) === (prev.parentId || null)) {
                          currentBurst.push(curr);
                      } else {
                          // End of burst
                          if (currentBurst.length >= 3) { // Min 3 for a burst
                              newGroups.push({
                                  id: `burst-${currentBurst[0].id}`,
                                  type: 'burst',
                                  items: [...currentBurst],
                                  keepId: determineBestPhoto(currentBurst)
                              });
                          }
                          currentBurst = [curr];
                      }
                  }
              }
              // Check trailing
              if (currentBurst.length >= 3) {
                   newGroups.push({
                        id: `burst-${currentBurst[0].id}`,
                        type: 'burst',
                        items: [...currentBurst],
                        keepId: determineBestPhoto(currentBurst)
                   });
              }
          }

          setGroups(newGroups);
          // Auto-select all groups by default
          setSelectedGroups(new Set(newGroups.map(g => g.id)));
          setStep('review');

      }, 2000);
  };

  const determineBestPhoto = (burst: FileSystemItem[]): string => {
      // Heuristic: Prefer "Picked" flag, then Rating, then File Size (quality proxy)
      const picked = burst.find(i => i.flag === 'picked');
      if (picked) return picked.id;

      const rated = [...burst].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      if ((rated[0].rating || 0) > 0) return rated[0].id;

      const largest = [...burst].sort((a, b) => b.size - a.size);
      return largest[0].id;
  };

  const toggleGroup = (id: string) => {
      const newSet = new Set(selectedGroups);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedGroups(newSet);
  };

  const setKeepId = (groupId: string, itemId: string) => {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, keepId: itemId } : g));
  };

  const handleCleanup = () => {
      const idsToDelete: string[] = [];
      let savedBytes = 0;

      groups.forEach(g => {
          if (selectedGroups.has(g.id)) {
              g.items.forEach(i => {
                  if (i.id !== g.keepId) {
                      idsToDelete.push(i.id);
                      savedBytes += i.size;
                  }
              });
          }
      });

      if (idsToDelete.length > 0) {
          bulkDeleteItems(idsToDelete);
          showToast(`Cleaned up ${idsToDelete.length} files. Saved ${formatSize(savedBytes)}.`, 'success');
          setStep('success');
      } else {
          onClose();
      }
  };

  const calculateTotalSavings = () => {
      let total = 0;
      groups.forEach(g => {
          if (selectedGroups.has(g.id)) {
             const itemsToDelete = g.items.filter(i => i.id !== g.keepId);
             total += itemsToDelete.reduce((acc, i) => acc + i.size, 0);
          }
      });
      return formatSize(total);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}></div>
        <div className="relative bg-white dark:bg-dark-900 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-dark-700">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-purple/10 flex items-center justify-center">
                        <i className="fa-solid fa-broom text-brand-purple"></i>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Smart Cleanup</h2>
                        <p className="text-xs text-gray-500">Free up space by removing duplicates and clutter.</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                    <i className="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
                
                {/* STEP 1: INTRO */}
                {step === 'intro' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                         <div className="grid grid-cols-2 gap-4 max-w-md w-full">
                             <div className={`p-4 rounded-xl border-2 ${isBasic || isPro ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-dark-700 grayscale opacity-60'}`}>
                                 <i className="fa-solid fa-clone text-2xl text-primary mb-2"></i>
                                 <h3 className="font-bold text-gray-900 dark:text-white">Exact Duplicates</h3>
                                 <p className="text-xs text-gray-500 mt-1">Find identical files saved in different folders.</p>
                                 {!isBasic && !isPro && <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded mt-2 inline-block">BASIC+</span>}
                             </div>
                             <div className={`p-4 rounded-xl border-2 ${isPro ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-dark-700 grayscale opacity-60'}`}>
                                 <i className="fa-solid fa-layer-group text-2xl text-primary mb-2"></i>
                                 <h3 className="font-bold text-gray-900 dark:text-white">Burst Cleanup</h3>
                                 <p className="text-xs text-gray-500 mt-1">AI picks the best shot from bursts and groups.</p>
                                 {!isPro && <span className="text-[10px] font-bold bg-brand-purple/10 text-brand-purple px-2 py-0.5 rounded mt-2 inline-block">PRO</span>}
                             </div>
                         </div>
                         
                         {isFree ? (
                             <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 p-4 rounded-xl max-w-md">
                                 <p className="text-sm text-yellow-800 dark:text-yellow-500 font-medium">Upgrade to Basic or Pro to use Smart Cleanup.</p>
                             </div>
                         ) : (
                             <button onClick={scanFiles} className="px-8 py-3 bg-brand-purple hover:bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-brand-purple/20 transition-transform active:scale-95 flex items-center gap-2">
                                 <i className="fa-solid fa-magnifying-glass"></i>
                                 Start Scan
                             </button>
                         )}
                    </div>
                )}

                {/* STEP 2: SCANNING */}
                {step === 'scanning' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8">
                        <div className="w-16 h-16 border-4 border-gray-200 dark:border-dark-700 border-t-brand-purple rounded-full animate-spin mb-6"></div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Scanning Library...</h3>
                        <p className="text-gray-500">Analyzing file signatures and metadata.</p>
                    </div>
                )}

                {/* STEP 3: REVIEW */}
                {step === 'review' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {groups.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                                    <i className="fa-solid fa-check text-2xl text-green-500"></i>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Library is Clean!</h3>
                                <p className="text-gray-500">No duplicates or large bursts found.</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-gray-700 dark:text-gray-300">Found {groups.length} Groups</h3>
                                    <div className="text-sm">
                                        Potential Savings: <span className="font-bold text-green-500">{calculateTotalSavings()}</span>
                                    </div>
                                </div>
                                
                                {groups.map(group => (
                                    <div key={group.id} className={`border rounded-xl overflow-hidden transition-all ${selectedGroups.has(group.id) ? 'border-brand-purple/50 bg-brand-purple/5' : 'border-gray-200 dark:border-dark-700 opacity-60'}`}>
                                        <div className="p-3 border-b border-gray-100 dark:border-dark-700 flex items-center gap-3 bg-white/50 dark:bg-dark-800/50">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedGroups.has(group.id)} 
                                                onChange={() => toggleGroup(group.id)}
                                                className="w-4 h-4 rounded text-brand-purple focus:ring-brand-purple"
                                            />
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${group.type === 'exact' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                                {group.type === 'exact' ? 'Duplicate' : 'Burst'}
                                            </span>
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                                                {group.items[0].name}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {group.items.length} files
                                            </span>
                                        </div>
                                        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                            {group.items.map(item => (
                                                <div 
                                                    key={item.id} 
                                                    onClick={() => setKeepId(group.id, item.id)}
                                                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${group.keepId === item.id ? 'border-green-500 ring-2 ring-green-500/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                >
                                                    <img src={item.previewUrl} className="w-full h-full object-contain" />
                                                    {group.keepId === item.id && (
                                                        <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                                            KEEP
                                                        </div>
                                                    )}
                                                    {group.keepId !== item.id && (
                                                        <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                                                            <i className="fa-solid fa-trash text-red-500 text-lg drop-shadow-md"></i>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 4: SUCCESS */}
                {step === 'success' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
                            <i className="fa-solid fa-sparkles text-4xl text-green-500"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Space Reclaimed!</h2>
                        <p className="text-gray-500 mb-6">Your library is lighter and cleaner.</p>
                        <button onClick={onClose} className="px-6 py-2 bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 text-gray-900 dark:text-white rounded-xl font-medium">
                            Close
                        </button>
                    </div>
                )}

            </div>

            {/* Footer */}
            {step === 'review' && groups.length > 0 && (
                <div className="p-6 border-t border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-dark-700 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleCleanup}
                        className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-transform active:scale-95 flex items-center gap-2"
                    >
                        <i className="fa-solid fa-trash"></i>
                        Delete Selected ({calculateTotalSavings()})
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};

export default CleanupModal;
