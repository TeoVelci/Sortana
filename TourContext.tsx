
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// --- Types ---

export type TourId = 'dashboard' | 'dashboard_mobile' | 'browse' | 'account' | 'export' | 'magic_editor_mobile' | 'magic_editor_desktop';

export interface TourStep {
  targetId: string;
  title: string;
  content: string;
}

interface TourContextType {
  startTour: (tourId: TourId) => void;
  endTour: () => void;
  openWelcome: () => void;
  nextStep: () => void;
  prevStep: () => void;
  isOpen: boolean;
  isWelcomeOpen: boolean;
  currentStepIndex: number;
  totalSteps: number;
  activeTourId: TourId | null;
  activeStep: TourStep | null;
}

// --- Configuration (Optimized Flow) ---

const TOURS: Record<TourId, TourStep[]> = {
  dashboard: [
    {
      targetId: 'upload-zone',
      title: 'Upload Zone',
      content: 'Start here. Drag and drop your raw photos, videos, or entire folders. We support files up to 10GB.',
    },
    {
      targetId: 'smart-sort-toggle',
      title: 'Smart Ingest',
      content: 'Enable this to automatically sort incoming files into folders based on Date and Camera Model.',
    },
    {
      targetId: 'auto-organize-card',
      title: 'Auto-Organizer',
      content: 'Already have files uploaded? Use this AI tool to restructure your existing library instantly.',
    },
    {
      targetId: 'storage-card',
      title: 'Storage Monitor',
      content: 'Keep an eye on your cloud usage here. We\'ll alert you if you near your plan limit.',
    },
    {
      targetId: 'copilot-trigger',
      title: 'Sortana Copilot',
      content: 'Your AI Assistant is always here. Drag an image onto this button to ask questions about it.',
    }
  ],
  dashboard_mobile: [
    {
      targetId: 'upload-zone',
      title: 'Mobile Uploads',
      content: 'Tap here to select files from your Photo Library or device storage. We recommend choosing files directly from storage for massive 4K/HDR videos.',
    },
    {
      targetId: 'smart-sort-toggle',
      title: 'Smart Ingest',
      content: 'Leave this ON to let our AI sort your mobile uploads into neat folders based on Date and Camera Model.',
    },
    {
      targetId: 'auto-organize-card',
      title: 'Auto-Organizer',
      content: 'Have a messy library? Use this AI tool to restructure your existing cloud files instantly.',
    },
    {
      targetId: 'storage-card',
      title: 'Storage Monitor',
      content: 'Keep an eye on your cloud usage from your phone here.',
    }
  ],
  browse: [
    {
      targetId: 'browse-search',
      title: 'Semantic Search',
      content: 'Don\'t just search filenames. Type "Sunset", "Wedding Cake", or "Blue Dress" to find content using AI vision.',
    },
    {
      targetId: 'browse-breadcrumbs',
      title: 'Move Files',
      content: 'You can drag and drop files directly onto folder icons to move them, or drop them onto these breadcrumbs to pull them out of a subfolder!',
    },
    {
      targetId: 'browse-back-btn',
      title: 'Folder Navigation',
      content: 'Use this back arrow to instantly go up a level, or tap the Home button next to it to return to your main Projects.',
    },
    {
      targetId: 'browse-grid',
      title: 'Infinite Canvas',
      content: 'Double-click any item to preview it. Drag to select multiple items for bulk actions.',
    },
    {
      targetId: 'browse-stacking',
      title: 'Burst Stacking',
      content: 'Reduce clutter. Toggle this to automatically group similar "burst" shots into a single stack.',
    },
    {
      targetId: 'browse-cleanup',
      title: 'Smart Cleanup',
      content: 'Running out of space? Find duplicates and clean up burst shots instantly.',
    },
    {
      targetId: 'browse-cull',
      title: 'Speed Culling',
      content: 'Enter "Cull Mode" to rapidly review photos full-screen using keyboard shortcuts (1-5 for stars, P/X for flags).',
    },
    {
      targetId: 'browse-inspector',
      title: 'Metadata & Magic',
      content: 'View file details or access the Magic Editor to regenerate images using GenAI.',
    },
    {
      targetId: 'browse-export',
      title: 'Smart Export',
      content: 'Export your selected files with options to convert formats, rename sequences, or watermark images.',
    }
  ],
  account: [
    {
      targetId: 'account-plan',
      title: 'Your Subscription',
      content: 'View your current tier. You can upgrade here to unlock features like 4K Video Analysis and Unlimited Storage.',
    },
    {
      targetId: 'account-storage',
      title: 'Usage Quota',
      content: 'Track your exact storage usage. We never delete files if you accidentally go over.',
    },
    {
      targetId: 'account-debug',
      title: 'Debug Tools',
      content: 'Since this is a demo, you can simulate different subscription tiers here to test feature gating.',
    }
  ],
  export: [
    {
      targetId: 'export-file-settings',
      title: 'File Settings',
      content: 'Choose your naming convention and format. Pro users can bulk-convert RAW files to JPEG/PNG and rename sequences.',
    },
    {
      targetId: 'export-folder-structure',
      title: 'Folder Structure',
      content: 'Choose whether to preserve your existing folder hierarchy or flatten everything into a single folder.',
    },
    {
      targetId: 'export-direct-to-disk',
      title: 'Direct to Disk',
      content: 'If you are on Chrome or Edge, enable this to stream massive exports directly to your hard drive, preventing browser crashes.',
    },
    {
      targetId: 'export-watermark',
      title: 'Watermarking',
      content: 'Studio users can apply custom text watermarks to exported images to protect their work.',
    }
  ],
  magic_editor_mobile: [
    {
      targetId: 'magic-input-bar',
      title: 'Prompt',
      content: 'Type what you want to change in the image here.',
    },
    {
      targetId: 'magic-btn-generate',
      title: 'Generate',
      content: 'Tap the wand icon to apply your changes using AI.',
    },
    {
      targetId: 'magic-btn-reset',
      title: 'Reset Edit',
      content: 'Tap the undo icon to discard your generation and start over.',
    },
    {
      targetId: 'magic-btn-save',
      title: 'Save Copy',
      content: 'Tap the floppy disk to save your new edited image.',
    }
  ],
  magic_editor_desktop: [
    {
      targetId: 'magic-input-bar',
      title: 'Prompt',
      content: 'Type what you want to change in the image here.',
    },
    {
      targetId: 'magic-btn-generate',
      title: 'Generate',
      content: 'Click here to apply your changes using AI.',
    },
    {
      targetId: 'magic-btn-reset',
      title: 'Reset Edit',
      content: 'Click here to discard your generation and start over.',
    },
    {
      targetId: 'magic-btn-save',
      title: 'Save Copy',
      content: 'Click here to save your new edited image.',
    }
  ]
};

// --- Context ---

const TourContext = createContext<TourContextType | undefined>(undefined);

export const TourProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [activeTourId, setActiveTourId] = useState<TourId | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // Spotlight State
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  
  const location = useLocation();
  const stepTimeoutRef = useRef<number | null>(null);

  // Helper to check completion status
  const getTourStatus = () => {
      try {
          return JSON.parse(localStorage.getItem('sortana_tours') || '{}');
      } catch { return {}; }
  };

  const setTourCompleted = React.useCallback((id: TourId) => {
      const status = getTourStatus();
      status[id] = true;
      localStorage.setItem('sortana_tours', JSON.stringify(status));
  }, []);

  const endTour = React.useCallback(() => {
    setIsOpen(false);
    setActiveTourId(null);
    setSpotlightStyle({ opacity: 0 }); // Fade out
  }, []);

  const startTour = React.useCallback((tourId: TourId) => {
    setIsWelcomeOpen(false);
    setActiveTourId(tourId);
    setCurrentStepIndex(0);
    setIsOpen(true);
    setTourCompleted(tourId);
  }, [setTourCompleted]);

  const openWelcome = React.useCallback(() => setIsWelcomeOpen(true), []);

  const nextStep = React.useCallback(() => {
    if (!activeTourId) return;
    const steps = TOURS[activeTourId];
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      endTour();
    }
  }, [activeTourId, currentStepIndex, endTour]);

  const prevStep = React.useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  // --- Auto Trigger Logic ---
  useEffect(() => {
     const timer = setTimeout(() => {
         const status = getTourStatus();
         const path = location.pathname;

         const isMobile = window.innerWidth < 768;

         if (path === '/dashboard') {
             if (isMobile && !status.dashboard_mobile) {
                 startTour('dashboard_mobile');
             } else if (!isMobile && !status.dashboard) {
                 setIsWelcomeOpen(true);
             }
         } else if (path === '/browse' && !status.browse) {
             startTour('browse');
         } else if (path === '/account' && !status.account) {
             startTour('account');
         }
     }, 1000);

     return () => clearTimeout(timer);
  }, [location.pathname, startTour]);

  // --- Update Position Logic ---
  useEffect(() => {
    if (!isOpen || !activeTourId) return;

    const updatePosition = () => {
        const steps = TOURS[activeTourId];
        const step = steps[currentStepIndex];
        if (!step) return;

        const el = document.getElementById(step.targetId);
        
        if (el) {
            // 2. Wait slightly for scroll (though observer is better, timeout works for simple tours)
            // We calculate immediately but might need to re-calc if scroll happens
            const rect = el.getBoundingClientRect();
            
            // 3. Spotlight Dimensions (with padding)
            const padding = 8;
            setSpotlightStyle({
                top: rect.top - padding,
                left: rect.left - padding,
                width: rect.width + (padding * 2),
                height: rect.height + (padding * 2),
                opacity: 1
            });

            // 4. Smart Tooltip Positioning
            // Determine quadrant
            const spaceTop = rect.top;
            const spaceBottom = window.innerHeight - rect.bottom;
            const spaceLeft = rect.left;
            const spaceRight = window.innerWidth - rect.right;

            const tooltipWidth = 320;
            const tooltipHeight = 200; // approx
            const gap = 20;

            let top: number;
            let left: number;
            const transform = '';

            // Prefer Bottom, then Top, then Right, then Left
            if (spaceBottom > tooltipHeight + gap) {
                // Place Bottom
                top = rect.bottom + gap + padding;
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            } else if (spaceTop > tooltipHeight + gap) {
                // Place Top
                top = rect.top - gap - padding - 180; // approximate height adjustment
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
            } else if (spaceRight > tooltipWidth + gap) {
                // Place Right
                top = rect.top + (rect.height / 2) - 100;
                left = rect.right + gap + padding;
            } else {
                // Place Left
                top = rect.top + (rect.height / 2) - 100;
                left = rect.left - gap - padding - tooltipWidth;
            }

            // Screen Boundaries
            if (left < 10) left = 10;
            if (left + tooltipWidth > window.innerWidth) left = window.innerWidth - tooltipWidth - 10;

            setTooltipStyle({
                top,
                left,
                transform
            });
            
            // Fade in text after glide starts
            setIsTooltipVisible(false);
            if (stepTimeoutRef.current) clearTimeout(stepTimeoutRef.current);
            // window.setTimeout returns a number in browser environment
            stepTimeoutRef.current = window.setTimeout(() => setIsTooltipVisible(true), 300);

        } else {
            // Element not found (e.g. mobile menu hidden), skip step automatically
            console.warn(`Tour target ${step.targetId} missing, skipping.`);
            if (currentStepIndex < steps.length - 1) {
                setCurrentStepIndex(prev => prev + 1);
            } else {
                endTour();
            }
        }
    };

    // Initial call
    requestAnimationFrame(updatePosition);

    // Listeners
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, currentStepIndex, activeTourId, endTour]);

  // --- Scroll to active step exactly ONCE when it changes ---
  useEffect(() => {
      if (!isOpen || !activeTourId) return;
      const steps = TOURS[activeTourId];
      const step = steps[currentStepIndex];
      if (!step) return;

      const timer = setTimeout(() => {
          const el = document.getElementById(step.targetId);
          if (el) {
              const rect = el.getBoundingClientRect();
              const isMobile = window.innerWidth < 768;
              
              // Only smooth scroll if element is significantly outside viewport to prevent jitter
              const isFullyVisible = (
                  rect.top >= 0 &&
                  rect.left >= 0 &&
                  rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                  rect.right <= (window.innerWidth || document.documentElement.clientWidth)
              );

              if (!isFullyVisible) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: isMobile ? 'nearest' : 'center' });
              }
          }
      }, 50); // slight delay to let DOM settle (like opening menus)

      return () => clearTimeout(timer);
  }, [isOpen, currentStepIndex, activeTourId]);

  // Keyboard Nav
  useEffect(() => {
      if (!isOpen) return;
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
          if (e.key === 'ArrowLeft') prevStep();
          if (e.key === 'Escape') endTour();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, nextStep, prevStep, endTour]);

  const activeStep = activeTourId ? TOURS[activeTourId][currentStepIndex] : null;

  return (
    <TourContext.Provider value={{ startTour, endTour, openWelcome, nextStep, prevStep, isOpen, isWelcomeOpen, currentStepIndex, totalSteps: activeTourId ? TOURS[activeTourId].length : 0, activeTourId, activeStep }}>
      {children}

      {/* --- WELCOME MODAL (Static) --- */}
      {isWelcomeOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-500">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
              <div className="relative bg-white dark:bg-dark-800 rounded-2xl shadow-2xl p-8 max-w-md text-center border border-white/10 transform transition-all scale-100">
                  <div className="w-16 h-16 bg-brand-purple/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <span className="material-symbols-outlined text-3xl text-brand-purple">waving_hand</span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Welcome to Sortana AI!</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                      Your intelligent media library is ready. Let's get you sorted in seconds. Would you like a quick tour of the Dashboard?
                  </p>
                  <div className="flex flex-col gap-3">
                      <button 
                          onClick={() => startTour('dashboard')}
                          className="w-full py-3 px-6 bg-brand-purple hover:bg-purple-600 text-white font-bold rounded-xl shadow-lg shadow-brand-purple/25 transition-all active:scale-95"
                      >
                          Start Quick Tour
                      </button>
                      <button 
                          onClick={() => { setIsWelcomeOpen(false); setTourCompleted('dashboard'); }}
                          className="w-full py-3 px-6 text-gray-500 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                      >
                          Skip for now
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- CINEMATIC TOUR OVERLAY --- */}
      {isOpen && activeStep && (
          <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
              
              {/* 1. The GLIDING SPOTLIGHT */}
              {/* We use a massive box-shadow to create the darkness around the hole */}
              <div 
                  className="absolute rounded-xl transition-all duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] z-10"
                  style={{
                      ...spotlightStyle,
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)', // The Overlay
                      border: '2px solid rgba(99, 102, 241, 0.5)' // The Active Ring
                  }}
              />

              {/* 2. The FLOATING TOOLTIP */}
              {/* Positioned absolutely, tethered to the spotlight via JS calculation */}
              <div 
                  className={`absolute w-[320px] bg-white dark:bg-dark-800 rounded-2xl p-6 shadow-2xl border border-white/10 flex flex-col gap-4 pointer-events-auto transition-all duration-300 z-20 ${isTooltipVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
                  style={tooltipStyle}
              >
                  <div className="flex justify-between items-start">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{activeStep.title}</h3>
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-dark-700 px-2 py-1 rounded-full">
                          {currentStepIndex + 1} / {TOURS[activeTourId!].length}
                      </span>
                  </div>
                  
                  <p className="text-sm text-gray-500 dark:text-gray-300 leading-relaxed">
                      {activeStep.content}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-100 dark:border-dark-700">
                      <button 
                          onClick={endTour}
                          className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      >
                          Skip
                      </button>
                      <div className="flex gap-2">
                           {currentStepIndex > 0 && (
                               <button 
                                  onClick={prevStep}
                                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors dark:text-white"
                               >
                                   Back
                               </button>
                           )}
                           <button 
                              onClick={nextStep}
                              className="px-4 py-1.5 rounded-lg bg-brand-purple text-white text-sm font-bold shadow-md hover:bg-purple-600 transition-colors"
                           >
                               {currentStepIndex === TOURS[activeTourId!].length - 1 ? 'Finish' : 'Next'}
                           </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

    </TourContext.Provider>
  );
};

export const useTour = () => {
  const context = useContext(TourContext);
  if (context === undefined) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};
