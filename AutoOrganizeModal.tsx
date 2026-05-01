
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from './AppContext';
import { proposeOrganization, FolderPlan, FileManifest, OrganizationStrategy } from './aiService';
import { useToast } from './ToastContext';

interface AutoOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OrganizeCandidate {
    id: string | null; // null for root
    name: string;
    count: number;
}

const AutoOrganizeModal: React.FC<AutoOrganizeModalProps> = ({ isOpen, onClose }) => {
  const { items, executeOrganizationPlan, user } = useApp();
  const { showToast } = useToast();

  const [step, setStep] = useState<'setup' | 'analyzing' | 'preview' | 'success'>('setup');
  const [strategy, setStrategy] = useState<OrganizationStrategy>('technical'); 
  const [plan, setPlan] = useState<FolderPlan[]>([]);
  
  // Selection State
  const [candidates, setCandidates] = useState<OrganizeCandidate[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [looseFiles, setLooseFiles] = useState<FileManifest[]>([]);

  // Ref to track if we have set the initial selection for this session
  // This prevents the dropdown from resetting when background items update
  const hasInitializedSelection = useRef(false);

  const isStudio = user.plan === 'Studio';

  // 1. Reset State on Open/Close
  useEffect(() => {
      if (isOpen) {
          setStep('setup');
          // Default to Technical
          setStrategy('technical');
          hasInitializedSelection.current = false; // Reset init flag on open
      }
  }, [isOpen]);

  // 2. Calculate Candidates & Set Initial Selection
  useEffect(() => {
    if (isOpen) {
        const newCandidates: OrganizeCandidate[] = [];
        
        // 1. Check Root (null parent)
        const rootFilesCount = items.filter(i => i.type === 'file' && (i.parentId || null) === null).length;
        if (rootFilesCount > 0) {
            newCandidates.push({ id: null, name: 'Main Library (Root)', count: rootFilesCount });
        }

        // 2. Check Folders
        const folders = items.filter(i => i.type === 'folder');
        folders.forEach(f => {
            // Count files directly inside this folder
            const count = items.filter(i => i.type === 'file' && (i.parentId || null) === (f.id || null)).length;
            if (count > 0) {
                newCandidates.push({ id: f.id, name: f.name, count });
            }
        });

        setCandidates(newCandidates);

        if (!hasInitializedSelection.current && newCandidates.length > 0) {
            const hasRoot = newCandidates.some(c => c.id === null);
            if (hasRoot) setSelectedTarget(null);
            else setSelectedTarget(newCandidates[0].id);
            hasInitializedSelection.current = true;
        } else if (newCandidates.length === 0 && !hasInitializedSelection.current) {
            setSelectedTarget(null);
        }
    }
  }, [isOpen, items]);

  // Update manifest when selection changes
  useEffect(() => {
      if (!isOpen || candidates.length === 0) {
          setLooseFiles([]);
          return;
      }

      // Filter files based on the selected target (root or specific folder)
      // Note: selectedTarget === null means Root
      const targetFiles = items.filter(i => i.type === 'file' && (i.parentId || null) === (selectedTarget || null));

      const manifest: FileManifest[] = targetFiles.map(f => ({
          id: f.id,
          name: f.name,
          date: f.dateAdded,
          type: f.fileType || 'doc',
          make: f.make,
          model: f.model
      }));
      setLooseFiles(manifest);

  }, [selectedTarget, candidates, items, isOpen]);


  const handleStartAnalysis = () => {
      if (looseFiles.length === 0) {
          showToast("No unorganized files found in selected location.", "info");
          return;
      }
      
      setStep('analyzing');
      
      proposeOrganization(looseFiles, strategy)
        .then(proposedPlan => {
            if (proposedPlan && proposedPlan.length > 0) {
                setPlan(proposedPlan);
                setStep('preview');
            } else {
                showToast("AI couldn't find a better structure.", "info");
                setStep('setup'); // Reset on failure
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Organization failed (or timed out). Try again.", "error");
            setStep('setup'); // Reset on failure
        });
  };

  const handleApply = () => {
      // Pass the selectedTarget as the parentId for new folders
      executeOrganizationPlan(plan, selectedTarget);
      setStep('success');
      setTimeout(() => {
          onClose();
          showToast("Library successfully organized!", "success");
      }, 1500);
  };

  const selectStrategy = (strat: OrganizationStrategy) => {
      if (strat === 'smart_event' && !isStudio) {
          showToast("Smart Events are exclusive to the Studio plan.", "error");
          return;
      }
      setStrategy(strat);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
        
        {/* Modal Card */}
        <div className="relative bg-white dark:bg-dark-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-gray-200 dark:border-dark-600">
            
            {/* --- SETUP STEP --- */}
            {step === 'setup' && (
                <div className="flex flex-col h-full">
                    <div className="p-8 pb-4 text-center">
                        <div className="w-16 h-16 bg-brand-purple/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fa-solid fa-wand-magic-sparkles text-3xl text-brand-purple"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Auto-Organize Library</h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            {candidates.length > 0 
                                ? `Ready to sort your files.` 
                                : "No unorganized files found."}
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-8 py-4">
                        
                        {/* Target Selection Dropdown (Only if multiple candidates) */}
                        {candidates.length > 1 && (
                            <div className="mb-6">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Organize Files In:</label>
                                <select 
                                    value={selectedTarget || ''} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSelectedTarget(val === '' ? null : val);
                                    }}
                                    className="w-full bg-gray-50 dark:bg-dark-900 border border-gray-200 dark:border-dark-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-purple focus:outline-none"
                                >
                                    {candidates.map(c => (
                                        <option key={c.id || 'root'} value={c.id || ''}>
                                            {c.name} ({c.count} files)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {candidates.length === 1 && (
                            <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-xl text-sm flex items-center gap-2 border border-blue-100 dark:border-blue-900/30">
                                <i className="fa-solid fa-folder-open"></i>
                                <span>Organizing <b>{candidates[0].count}</b> files in <b>{candidates[0].name}</b></span>
                            </div>
                        )}
                        
                        {candidates.length > 0 && (
                            <div className="space-y-4">
                                {/* Strategy Card: Technical */}
                                <div 
                                    onClick={() => selectStrategy('technical')}
                                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start gap-4 ${strategy === 'technical' ? 'border-brand-purple bg-brand-purple/5' : 'border-gray-200 dark:border-dark-600 hover:border-brand-purple/50'}`}
                                >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${strategy === 'technical' ? 'bg-brand-purple text-white' : 'bg-gray-100 dark:bg-dark-700 text-gray-500'}`}>
                                        <i className="fa-solid fa-camera-retro"></i>
                                    </div>
                                    <div>
                                        <h3 className={`font-bold ${strategy === 'technical' ? 'text-brand-purple' : 'text-gray-900 dark:text-white'}`}>Technical / Device</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Groups files by camera model first, then by date. Best for pro workflows.
                                        </p>
                                        <div className="mt-2 flex gap-2 text-xs text-gray-400 font-mono">
                                            <span>Result: Sony A7 IV / 2023-10-31</span>
                                        </div>
                                    </div>
                                    {strategy === 'technical' && <i className="fa-solid fa-check-circle text-brand-purple text-xl ml-auto mt-1"></i>}
                                </div>

                                {/* Strategy Card: Smart Events */}
                                <div 
                                    onClick={() => selectStrategy('smart_event')}
                                    className={`relative cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start gap-4 ${strategy === 'smart_event' ? 'border-brand-purple bg-brand-purple/5' : 'border-gray-200 dark:border-dark-600 hover:border-brand-purple/50'} ${!isStudio ? 'opacity-60 grayscale' : ''}`}
                                >
                                    {!isStudio && (
                                        <div className="absolute top-2 right-2 text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded text-[10px] font-bold border border-brand-purple/20 flex items-center gap-1">
                                            <i className="fa-solid fa-lock"></i> STUDIO
                                        </div>
                                    )}

                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${strategy === 'smart_event' ? 'bg-brand-purple text-white' : 'bg-gray-100 dark:bg-dark-700 text-gray-500'}`}>
                                        <i className="fa-regular fa-calendar-star"></i>
                                    </div>
                                    <div>
                                        <h3 className={`font-bold ${strategy === 'smart_event' ? 'text-brand-purple' : 'text-gray-900 dark:text-white'}`}>Smart Events</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Groups files by context and date. Best for memories, trips, and social events.
                                        </p>
                                        <div className="mt-2 flex gap-2 text-xs text-gray-400 font-mono">
                                            <span>Result: 2023-10-31_Halloween / Images</span>
                                        </div>
                                    </div>
                                    {strategy === 'smart_event' && <i className="fa-solid fa-check-circle text-brand-purple text-xl ml-auto mt-1"></i>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-8 border-t border-gray-200 dark:border-dark-600 flex justify-end gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-dark-700 rounded-xl transition-colors">
                            Cancel
                        </button>
                        <button 
                            onClick={handleStartAnalysis}
                            disabled={looseFiles.length === 0}
                            className="px-6 py-2.5 bg-brand-purple hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-brand-purple/20 font-bold transition-transform active:scale-95 flex items-center gap-2"
                        >
                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                            Start Analysis
                        </button>
                    </div>
                </div>
            )}

            {/* --- ANALYZING STEP --- */}
            {step === 'analyzing' && (
                <div className="flex flex-col items-center justify-center p-12 text-center h-96">
                    <div className="relative w-24 h-24 mb-6">
                        <div className="absolute inset-0 border-4 border-gray-200 dark:border-dark-600 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-brand-purple rounded-full border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <i className="fa-solid fa-wand-magic-sparkles text-2xl text-brand-purple animate-pulse"></i>
                        </div>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Organizing by {strategy === 'smart_event' ? 'Event' : 'Device'}...</h2>
                    <p className="text-gray-500 dark:text-gray-400 max-w-sm">Gemini is clustering your {looseFiles.length} files based on your selected strategy.</p>
                </div>
            )}

            {/* --- PREVIEW STEP --- */}
            {step === 'preview' && (
                <>
                    <div className="p-6 border-b border-gray-200 dark:border-dark-600 bg-gray-50 dark:bg-dark-800/50 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <i className="fa-solid fa-folder-tree text-brand-purple"></i>
                                Proposed Structure
                            </h2>
                            <p className="text-sm text-gray-500">Mode: {strategy === 'smart_event' ? 'Smart Events' : 'Technical'}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                            <i className="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-dark-900">
                        {/* Plan Tree View */}
                        <div className="space-y-4">
                            {plan.map((folder, idx) => (
                                <div key={idx} className="border border-gray-200 dark:border-dark-600 rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-dark-800 p-3 flex items-start gap-3 border-b border-gray-100 dark:border-dark-700">
                                        <i className="fa-regular fa-folder-open text-brand-purple mt-1"></i>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-900 dark:text-white">{folder.folderName}</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{folder.reasoning}</p>
                                        </div>
                                        <span className="text-xs bg-gray-200 dark:bg-dark-700 px-2 py-1 rounded-full text-gray-600 dark:text-gray-300">
                                            {folder.fileIds.length + (folder.subfolders?.reduce((acc, s) => acc + s.fileIds.length, 0) || 0)} files
                                        </span>
                                    </div>
                                    {/* Subfolders */}
                                    {folder.subfolders && folder.subfolders.length > 0 && (
                                        <div className="p-3 pl-8 bg-white dark:bg-dark-900 space-y-2">
                                            {folder.subfolders.map((sub, sIdx) => (
                                                <div key={sIdx} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                    <i className="fa-solid fa-turn-up rotate-90 text-gray-300"></i>
                                                    <i className="fa-regular fa-folder text-gray-400"></i>
                                                    <span>{sub.folderName}</span>
                                                    <span className="text-xs text-gray-400">({sub.fileIds.length})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-200 dark:border-dark-600 flex justify-end gap-3 bg-gray-50 dark:bg-dark-800">
                        <button 
                            onClick={() => setStep('setup')}
                            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-700 rounded-lg transition-colors font-medium flex items-center gap-2"
                        >
                            <i className="fa-solid fa-arrow-left"></i>
                            Back
                        </button>
                        <button 
                            onClick={handleApply}
                            className="px-6 py-2 bg-brand-purple hover:bg-purple-600 text-white rounded-lg shadow-lg shadow-brand-purple/20 font-bold transition-transform active:scale-95 flex items-center gap-2"
                        >
                            <i className="fa-solid fa-check"></i>
                            Confirm & Apply
                        </button>
                    </div>
                </>
            )}

            {/* --- SUCCESS STEP --- */}
            {step === 'success' && (
                <div className="flex flex-col items-center justify-center p-12 text-center h-96">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
                        <i className="fa-solid fa-check text-4xl text-green-500"></i>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Sorted!</h2>
                    <p className="text-gray-500 dark:text-gray-400">Your files have been magically organized.</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default AutoOrganizeModal;
