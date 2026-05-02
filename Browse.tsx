
import React, { useState, useEffect, useCallback, useRef, MouseEvent as ReactMouseEvent, CSSProperties } from 'react';
import { useApp, FileSystemItem } from './AppContext';
import { useToast } from './ToastContext';
import MagicEditor from './MagicEditor';
import ExportModal from './ExportModal';
import CleanupModal from './CleanupModal';

const Browse: React.FC = () => {
  const { 
      items, 
      viewState, 
      setViewState,
      renameItem, 
      deleteItem, 
      updateItemMetadata, 
      analyzeVideoItem,
      getFileObject,
      bulkDeleteItems, 
      bulkUpdateMetadata, 
      bulkAddTags, 
      addGeneratedFile, 
      retryUpload,
      formatSize,
      user,
      currentFolderId,
      setCurrentFolderId
  } = useApp();
  
  const { showToast } = useToast();
  
  // Navigation State Logic (Dynamic Breadcrumbs)
  const breadcrumbs = React.useMemo(() => {
      const crumbs: {id: string | null, name: string}[] = [];
      let curr = currentFolderId;
      
      // Safety break to prevent infinite loops if data is corrupted
      let safeBreak = 0;
      while (curr && safeBreak < 20) {
          const folder = items.find(i => i.id === curr);
          if (folder) {
              crumbs.unshift({ id: folder.id, name: folder.name });
              curr = folder.parentId || null;
          } else {
              break;
          }
          safeBreak++;
      }
      return [{ id: null, name: 'Projects' }, ...crumbs];
  }, [currentFolderId, items]);

  // Use Global View State instead of local state
  const { searchQuery, filterRating, filterFlag, isStackingEnabled } = viewState;

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // CRITICAL: We use a Ref to track selectedIds so event listeners (closures) always see the fresh state.
  const selectedIdsRef = useRef(selectedIds);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Sync Ref with State
  useEffect(() => {
      selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  // Inspector State - DEFAULT CLOSED to keep UI clean
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Magic Editor State
  const [editingItem, setEditingItem] = useState<FileSystemItem | null>(null);
  
  // Export Modal State
  const [isExportOpen, setIsExportOpen] = useState(false);
  
  // Cleanup Modal State
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);

  // Culling State
  const [isCulling, setIsCulling] = useState(false);
  const [cullingIndex, setCullingIndex] = useState(0);
  const [cullingContextItems, setCullingContextItems] = useState<FileSystemItem[] | null>(null);

  // --- NEW: Comparison State ---
  const [isComparing, setIsComparing] = useState(false);
  // Shared Transform for Synchronized Zoom
  const [compareTransform, setCompareTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Bulk Tag Input State (Bottom Bar)
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState('');

  // Inspector Input State
  const [inspectorTagValue, setInspectorTagValue] = useState('');

  // Plan Checks
  const isProOrAbove = ['Pro', 'Studio'].includes(user.plan);
  const isStudio = user.plan === 'Studio';

  // --- Helpers: Search & Match Logic ---

  const getMatchSnippet = useCallback((item: FileSystemItem, query: string) => {
      if (!query) return null;
      const q = query.toLowerCase();

      // 1. Moments (Priority for video)
      if (item.videoMetadata?.moments) {
          const moment = item.videoMetadata.moments.find(m => m.description.toLowerCase().includes(q));
          if (moment) return { type: 'moment', text: moment.description, timestamp: moment.timestamp };
      }

      // 2. Video Summary
      if (item.videoMetadata?.summary?.toLowerCase().includes(q)) {
          return { type: 'context', text: item.videoMetadata.summary };
      }

      // 3. AI Description
      if (item.description?.toLowerCase().includes(q)) {
          return { type: 'context', text: item.description };
      }

      // 4. Tags
      const tag = item.tags?.find(t => t.toLowerCase().includes(q));
      if (tag) return { type: 'tag', text: tag };

      // 5. Explicit Name Match (fallback, usually obvious)
      if (item.name.toLowerCase().includes(q)) {
          // No need to show snippet for name match usually, but we can if we want consistency
          return null; 
      }

      return null;
  }, []);

  // --- Computed Lists ---

  const currentItems = items.filter(item => {
    // 0. Soft Delete Check
    if (item.syncStatus === 'deleted') return false;

    // 1. Parent/Folder Scope
    const inFolder = (item.parentId || null) === (currentFolderId || null);
    
    // 2. Search Scope (Deep Context Search)
    const q = searchQuery ? searchQuery.toLowerCase() : '';
    const matchesSearch = searchQuery ? (
        item.name.toLowerCase().includes(q) || 
        (item.tags && item.tags.some(t => t.toLowerCase().includes(q))) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.videoMetadata?.title && item.videoMetadata.title.toLowerCase().includes(q)) ||
        (item.videoMetadata?.summary && item.videoMetadata.summary.toLowerCase().includes(q)) ||
        (item.videoMetadata?.moments && item.videoMetadata.moments.some(m => m.description.toLowerCase().includes(q)))
    ) : true;
    
    // 3. Filters (Only apply to files)
    let matchesFilter = true;
    if (item.type === 'file') {
        // Rating Check
        if (filterRating > 0 && (item.rating || 0) < filterRating) matchesFilter = false;
        
        // Flag Check
        if (filterFlag !== 'all') {
            if (filterFlag === 'picked' && item.flag !== 'picked') matchesFilter = false;
            if (filterFlag === 'rejected' && item.flag !== 'rejected') matchesFilter = false;
            if (filterFlag === 'unflagged' && item.flag) matchesFilter = false;
        }

        // 4. Stacking Logic
        if (isStackingEnabled && item.groupId && !item.isStackTop) {
            // If stacking enabled, HIDE non-top items of bursts
            // UNLESS searching - if searching, we might want to show all matches
            if (!searchQuery) matchesFilter = false; 
        }
    }

    if (searchQuery) return matchesSearch && matchesFilter;
    return inFolder && (item.type === 'folder' || matchesFilter);
  });

  // Items eligible for Culling (Images only)
  // If we are in "Burst Mode" (cullingContextItems is set), use that.
  const activeCullingList = cullingContextItems || currentItems.filter(i => i.type === 'file' && i.fileType === 'image');
  
  // Current Item in Culling View
  const activeCullingItem = activeCullingList[cullingIndex];

  // Derived Selection
  const selectedItems = items.filter(i => selectedIds.has(i.id));
  const activeItem = selectedItems.length === 1 ? selectedItems[0] : null;

  // --- Handlers: Navigation & Selection ---

  const navigateTo = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    setViewState({ searchQuery: '' }); // Clear search on nav
    // Clear selection on navigation
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, [setCurrentFolderId, setViewState, setSelectedIds, setLastSelectedId]);

  const handleItemClick = useCallback((e: ReactMouseEvent, item: FileSystemItem) => {
    // Functional update to avoid stale selectedIds in useCallback if we were to just use state
    setSelectedIds(prev => {
        let newSelected = new Set(prev);
        if (e.metaKey || e.ctrlKey) {
            // Toggle Selection
            if (newSelected.has(item.id)) {
                newSelected.delete(item.id);
            } else {
                newSelected.add(item.id);
                setLastSelectedId(item.id);
            }
        } else if (e.shiftKey && lastSelectedId) {
            // Range Selection logic needs index, which is harder in callback unless we ref items
            // For simplicity in virtualization, shift-select might be limited or require ref to currentItems
             const lastIdx = currentItems.findIndex(i => i.id === lastSelectedId);
             const currIdx = currentItems.findIndex(i => i.id === item.id);
             
             if (lastIdx !== -1 && currIdx !== -1) {
                 const start = Math.min(lastIdx, currIdx);
                 const end = Math.max(lastIdx, currIdx);
                 const range = currentItems.slice(start, end + 1);
                 range.forEach(i => newSelected.add(i.id));
             }
        } else {
            // Single Select
            newSelected = new Set([item.id]);
            setLastSelectedId(item.id);
        }
        return newSelected;
    });
  }, [currentItems, lastSelectedId]);

  const handleItemDoubleClick = useCallback((e: ReactMouseEvent, item: FileSystemItem) => {
    if (item.type === 'folder') {
        navigateTo(item.id);
    } else if (item.fileType === 'image') {
        
        // CHECK FOR STACK
        if (item.groupId && item.isStackTop && isStackingEnabled) {
            // ENTER BURST MODE (Cull only this stack)
            const burstItems = items.filter(i => i.groupId === item.groupId && i.syncStatus !== 'deleted').sort((a,b) => (a.dateTaken || 0) - (b.dateTaken || 0));
            setCullingContextItems(burstItems);
            setCullingIndex(0);
            setIsCulling(true);
            showToast(`Reviewing burst of ${burstItems.length} photos`, 'info');
            return;
        }

        const idx = activeCullingList.findIndex(i => i.id === item.id);
        if (idx !== -1) {
            setCullingIndex(idx);
            setIsCulling(true);
            setCullingContextItems(null); // Normal culling mode
        }
    }
  }, [items, isStackingEnabled, activeCullingList, showToast, navigateTo]); // Added navigateTo dependency

  const toggleSelectAll = () => {
    if (selectedIds.size === currentItems.length && currentItems.length > 0) {
        setSelectedIds(new Set());
    } else {
        const allIds = new Set(currentItems.map(i => i.id));
        setSelectedIds(allIds);
    }
  };

  const handleDragStart = useCallback((e: React.DragEvent, item: FileSystemItem) => {
      // Set Data Transfer for Copilot or other drop targets
      e.dataTransfer.setData('application/sortana-item-id', item.id);
      e.dataTransfer.effectAllowed = 'copy';
      
      const dragPreview = document.createElement('div');
      dragPreview.innerText = item.name;
      dragPreview.style.background = '#333';
      dragPreview.style.color = 'white';
      dragPreview.style.padding = '8px';
      dragPreview.style.borderRadius = '4px';
      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(dragPreview, 0, 0);
      setTimeout(() => document.body.removeChild(dragPreview), 0);
  }, []);

  // --- Handlers: Bulk Actions ---

  const handleBulkRate = (rating: number) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkUpdateMetadata(ids, { rating });
    showToast(`Rated ${ids.length} items ${rating} stars`, 'success');
  };

  // --- ROBUST DELETE HANDLER ---
  // Using useCallback but reading from Ref ensures we always see current state
  // and avoid stale closures in event listeners.
  // REMOVED window.confirm to avoid blocking and focus issues. Relies on Undo.
  const performDelete = useCallback((e?: React.MouseEvent | KeyboardEvent) => {
      // Force stop propagation to ensure no other handlers (like grid clear) interfere
      if (e) {
          e.stopPropagation();
          e.preventDefault();
      }

      const ids = Array.from(selectedIdsRef.current);
      if (ids.length === 0) return;
      
      bulkDeleteItems(ids);
      setSelectedIds(new Set());
      showToast(`Deleted ${ids.length} items (Ctrl+Z to Undo)`, 'info');
      
  }, [bulkDeleteItems, showToast]);

  // Keyboard Shortcuts Handler - UPDATED to use Ref
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (isCulling) return; // Let Culling view handle its own keys

      if (e.key === 'Delete' || e.key === 'Backspace') {
          // Check Ref directly
          if (selectedIdsRef.current.size > 0) {
              performDelete(e);
          }
      }
    };
    
    // Bind to document
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [performDelete, isCulling]); // Dependency on stable performDelete

  const handleBulkTagSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!bulkTagValue.trim()) return;
      const ids = Array.from(selectedIds);
      bulkAddTags(ids, bulkTagValue.trim());
      setBulkTagValue('');
      setShowBulkTagInput(false);
      showToast(`Added tag "${bulkTagValue}" to ${ids.length} items`, 'success');
  };

  const handleTagClick = useCallback((tag: string) => {
      setViewState({ searchQuery: tag });
      showToast(`Filtered by tag: ${tag}`, 'info');
  }, [setViewState, showToast]);

  // --- Handlers: Video AI ---
  const handleAnalyzeVideo = useCallback(async (id: string) => {
      // Studio Plan Gate for Video Analysis
      if (!isStudio) {
          showToast("Video Intelligence is a Studio feature.", "error");
          return;
      }

      const file = getFileObject(id);
      if (!file) {
          showToast("Video file missing from memory (reload page and re-upload to analyze)", "error");
          return;
      }

      showToast("Deep Video Analysis started...", "info");
      try {
          await analyzeVideoItem(id);
          showToast("Video analysis complete!", "success");
      } catch (e) {
          showToast("Analysis failed. Try again.", "error");
      }
  }, [isStudio, getFileObject, analyzeVideoItem, showToast]);

  // --- Handlers: Comparison Mode (Synchronized Zoom) ---
  
  const handleStartComparison = () => {
      if (selectedIds.size < 2) return;
      setCompareTransform({ x: 0, y: 0, scale: 1 });
      setIsComparing(true);
      showToast("Compare Mode: Scroll to zoom, Drag to pan (Synced)", "info");
  };

  const handleCompareWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      // Zoom Logic
      const delta = -e.deltaY * 0.001;
      const newScale = Math.min(Math.max(1, compareTransform.scale + delta), 5);
      setCompareTransform(prev => ({ ...prev, scale: newScale }));
  };

  const handleCompareMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCompareMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;
      
      setCompareTransform(prev => ({
          ...prev,
          x: prev.x + deltaX,
          y: prev.y + deltaY
      }));
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCompareMouseUp = () => {
      isDraggingRef.current = false;
  };


  // --- Handlers: Magic Editor ---

  const openMagicEditor = (item: FileSystemItem) => {
      // Basic/Free Plan Gate for Magic Editor
      if (!isProOrAbove) {
          showToast("Magic Editor is a Pro feature.", "error");
          return;
      }

      const canEdit = (item.fileType === 'image' && item.previewUrl) || 
                      (item.fileType === 'video' && item.proxyS3Key);

      if (canEdit) {
          setEditingItem(item);
      } else if (item.fileType === 'video' && !item.proxyS3Key) {
          showToast('Generating video proxy for editor... please wait.', 'info');
          // Trigger proxy generation if it wasn't already
          (useApp as any)().generateVideoProxy(item.id);
      } else {
          showToast('Magic Editor only supports images and processed videos', 'error');
      }
  };

  const handleMagicSave = async (blob: Blob, newName: string) => {
      if (editingItem) {
          const file = new File([blob], newName, { type: blob.type });
          try {
              await addGeneratedFile(file, editingItem.parentId, editingItem.tags || []);
              showToast('Image saved to library', 'success');
          } catch (e: any) {
              showToast(e.message || "Failed to save (Quota limit?)", "error");
          }
      }
  };

  // --- Handlers: Inspector Panel ---

  const handleInspectorTagAdd = (e: React.FormEvent) => {
      e.preventDefault();
      if (!inspectorTagValue.trim()) return;
      
      const ids = Array.from(selectedIds);
      if (ids.length > 0) {
          bulkAddTags(ids, inspectorTagValue.trim());
          setInspectorTagValue('');
      }
  };

  const handleRemoveTag = (tag: string) => {
      if (activeItem) {
          const newTags = (activeItem.tags || []).filter(t => t !== tag);
          updateItemMetadata(activeItem.id, { tags: newTags });
      }
  };


  // --- Culling Handlers (Existing) ---
  const startCulling = () => {
    if (activeCullingList.length > 0) {
      setCullingContextItems(null); // Default to current view
      setIsCulling(true);
      const firstUnrated = activeCullingList.findIndex(i => !i.rating && !i.flag);
      setCullingIndex(firstUnrated !== -1 ? firstUnrated : 0);
      showToast('Entered Culling Mode', 'info');
    } else {
      showToast("No images matched your filters to cull.", 'error');
    }
  };

  const handleCullingAction = useCallback((action: string) => {
    if (!activeCullingItem) return;

    switch(action) {
      case 'next':
        setCullingIndex(prev => Math.min(prev + 1, activeCullingList.length - 1));
        break;
      case 'prev':
        setCullingIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'pick': {
        const newPickState = activeCullingItem.flag === 'picked' ? null : 'picked';
        updateItemMetadata(activeCullingItem.id, { flag: newPickState });
        showToast(newPickState === 'picked' ? 'Marked as Picked' : 'Flag removed', newPickState === 'picked' ? 'success' : 'info');
        break;
      }
      case 'reject': {
        const newRejectState = activeCullingItem.flag === 'rejected' ? null : 'rejected';
        updateItemMetadata(activeCullingItem.id, { flag: newRejectState });
        showToast(newRejectState === 'rejected' ? 'Marked as Rejected' : 'Flag removed', newRejectState === 'rejected' ? 'error' : 'info');
        break;
      }
      case '0': 
        updateItemMetadata(activeCullingItem.id, { rating: 0 }); 
        showToast('Rating cleared', 'info');
        break;
      case '1': case '2': case '3': case '4': case '5': {
        const rating = parseInt(action);
        updateItemMetadata(activeCullingItem.id, { rating });
        showToast(`Rated ${rating} Stars`, 'success');
        break;
      }
    }
  }, [activeCullingItem, activeCullingList.length, updateItemMetadata, showToast]);

  useEffect(() => {
    if (!isCulling) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      switch(e.key) {
        case 'ArrowRight': handleCullingAction('next'); break;
        case 'ArrowLeft': handleCullingAction('prev'); break;
        case 'Escape': 
            setIsCulling(false); 
            setCullingContextItems(null); // Clear context
            break;
        case 'p': case 'P': handleCullingAction('pick'); break;
        case 'x': case 'X': handleCullingAction('reject'); break;
        case '1': handleCullingAction('1'); break;
        case '2': handleCullingAction('2'); break;
        case '3': handleCullingAction('3'); break;
        case '4': handleCullingAction('4'); break;
        case '5': handleCullingAction('5'); break;
        case '0': handleCullingAction('0'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCulling, handleCullingAction]);

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-xl dark:shadow-none border border-gray-200 dark:border-white/5 min-h-full flex flex-col relative overflow-hidden h-full">
      
      {/* --- Toolbar --- */}
      <div className="p-6 md:p-8 border-b border-gray-200 dark:border-white/10 flex flex-col xl:flex-row xl:items-center justify-between gap-4 z-20 shrink-0">
        
        {/* Left: Breadcrumbs & Stats */}
        <div>
          <nav className="text-xs text-gray-500 mb-2 flex items-center space-x-1 overflow-x-auto">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="material-icons-outlined text-[10px]">chevron_right</span>}
                <button 
                  onClick={() => navigateTo(crumb.id)}
                  className={`cursor-pointer whitespace-nowrap ${idx === breadcrumbs.length - 1 ? 'text-primary font-medium' : 'hover:text-primary'}`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {/* NEW LOCATION FOR HOME BUTTON */}
            <button 
                onClick={() => navigateTo(null)} 
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors shrink-0"
                title="Go to Projects Root"
            >
                <i className="fa-solid fa-house"></i>
            </button>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
              {breadcrumbs[breadcrumbs.length - 1].name}
            </h2>
             {/* Select All Toggle */}
             {currentItems.length > 0 && (
                 <button 
                    onClick={toggleSelectAll}
                    className="text-xs font-medium text-primary hover:underline ml-2 shrink-0"
                 >
                    {selectedIds.size === currentItems.length ? 'Deselect All' : 'Select All'}
                 </button>
             )}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          
          {/* Stacking Toggle */}
          <button 
             id="browse-stacking"
             onClick={() => setViewState({ isStackingEnabled: !isStackingEnabled })}
             className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${isStackingEnabled ? 'bg-indigo-50 dark:bg-primary/20 border-primary text-primary' : 'bg-transparent border-gray-200 dark:border-white/10 text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
             title="Group Burst Shots"
          >
             <i className="fa-solid fa-layer-group"></i>
             <span className="hidden sm:inline">Stacking</span>
          </button>

          {/* Filters */}
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-dark-900/50 p-1 rounded-xl border border-transparent dark:border-white/10">
             <select 
               value={filterRating} 
               onChange={(e) => setViewState({ filterRating: Number(e.target.value) })}
               className="bg-transparent text-sm border-none text-gray-700 dark:text-gray-300 focus:ring-0 cursor-pointer py-1.5 pl-2 pr-8"
             >
               <option value="0">Any Rating</option>
               <option value="1">1+ Stars</option>
               <option value="2">2+ Stars</option>
               <option value="3">3+ Stars</option>
               <option value="4">4+ Stars</option>
               <option value="5">5 Stars</option>
             </select>
             <div className="w-px h-4 bg-gray-300 dark:bg-white/10"></div>
             <select 
               value={filterFlag} 
               onChange={(e) => setViewState({ filterFlag: e.target.value as any })}
               className="bg-transparent text-sm border-none text-gray-700 dark:text-gray-300 focus:ring-0 cursor-pointer py-1.5 pl-2 pr-8"
             >
               <option value="all">All Flags</option>
               <option value="picked">Picked (P)</option>
               <option value="rejected">Rejected (X)</option>
               <option value="unflagged">Unflagged</option>
             </select>
          </div>

          {/* Search */}
          <div id="browse-search" className="relative group w-full sm:w-auto">
            <input 
              value={searchQuery}
              onChange={(e) => setViewState({ searchQuery: e.target.value })}
              className="bg-gray-100 dark:bg-dark-900/50 border border-transparent dark:border-white/10 dark:focus:border-primary text-sm rounded-xl py-2.5 pl-10 pr-4 w-full sm:w-48 text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder-gray-500" 
              placeholder="Search..." 
              type="text"
            />
            <span className="material-icons-outlined absolute left-3 top-2.5 text-gray-500 group-focus-within:text-primary transition-colors">search</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 w-full sm:w-auto">
            {/* CLEANUP BUTTON - NEW */}
            <button 
                id="browse-cleanup"
                onClick={() => setIsCleanupOpen(true)}
                className="p-2.5 rounded-xl border transition-colors bg-white dark:bg-dark-800 text-gray-500 hover:text-gray-900 dark:hover:text-white border-gray-200 dark:border-white/10"
                title="Cleanup Duplicates"
            >
                <i className="fa-solid fa-broom text-lg"></i>
            </button>

            {/* EXPORT BUTTON - UPDATED */}
            <button 
                id="browse-export"
                onClick={() => setIsExportOpen(true)}
                className="p-2.5 rounded-xl border transition-colors bg-white dark:bg-dark-800 text-gray-500 hover:text-gray-900 dark:hover:text-white border-gray-200 dark:border-white/10"
                title="Export Files"
            >
                <i className="fa-solid fa-file-export text-lg"></i>
            </button>

            <button 
              id="browse-cull"
              onClick={startCulling}
              disabled={activeCullingList.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 rounded-xl hover:bg-primary/10 hover:border-primary transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-icons-outlined text-lg mr-2 text-primary group-hover:text-white transition-colors">auto_fix_high</span>
              Cull
            </button>
            <button 
              id="browse-inspector"
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className={`p-2.5 rounded-xl border transition-colors ${isInspectorOpen ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-dark-800 text-gray-500 border-gray-200 dark:border-white/10'}`}
            >
              <i className="fa-solid fa-circle-info text-lg"></i>
            </button>
          </div>
        </div>
      </div>

      {/* --- Main Content Split View --- */}
      <div className="flex-1 flex overflow-hidden relative">
          
          {/* Virtualized Items Grid */}
          <div 
             id="browse-grid"
             className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar"
             onClick={() => { /* clicking empty space */ setSelectedIds(new Set()) }}
          >
            {currentItems.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 auto-rows-max">
                    {currentItems.map((item, index) => {
                        const isSelected = selectedIds.has(item.id);
                        const matchSnippet = searchQuery ? getMatchSnippet(item, searchQuery) : null;
                        const isStack = item.groupId && item.isStackTop && isStackingEnabled;
                        const stackCount = isStack ? items.filter(i => i.groupId === item.groupId && i.syncStatus !== 'deleted').length : 0;

                        return (
                            <div 
                                key={item.id}
                                className={`group cursor-pointer relative flex flex-col transition-transform duration-200 ${isSelected ? 'scale-95' : 'hover:scale-[1.02]'}`}
                                onClick={(e) => { e.stopPropagation(); handleItemClick(e, item); }}
                                onDoubleClick={(e) => { e.stopPropagation(); handleItemDoubleClick(e, item); }}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                            >
                                {/* STACK EFFECT UNDERLAY */}
                                {isStack && (
                                    <div className="absolute top-1 left-2 w-[calc(100%-16px)] aspect-square bg-gray-300 dark:bg-dark-800 rounded-2xl border border-white/10 rotate-2 z-0"></div>
                                )}
                                {isStack && stackCount > 2 && (
                                        <div className="absolute top-2 left-3 w-[calc(100%-24px)] aspect-square bg-gray-400 dark:bg-dark-700 rounded-2xl border border-white/10 -rotate-1 z-0"></div>
                                )}

                                {/* Square Box */}
                                <div className={`w-full aspect-square bg-gray-100 dark:bg-dark-900 rounded-2xl flex items-center justify-center p-1 mb-3 border transition-all relative overflow-hidden shrink-0 z-10 ${isSelected ? 'border-primary ring-2 ring-primary/50' : 'border-transparent dark:border-white/10 hover:border-primary/50'}`}>
                                
                                {/* Selection Checkmark */}
                                <div className={`absolute top-2 left-2 z-30 transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'bg-black/30 border-white hover:bg-black/50'}`}>
                                        {isSelected && <i className="fa-solid fa-check text-white text-xs"></i>}
                                    </div>
                                </div>

                                {/* SYNC STATUS BADGE (DIRTY STATE) */}
                                {item.syncStatus !== 'synced' && (
                                    <div className="absolute top-2 right-10 z-30 flex items-center gap-1.5" title={`Status: ${item.syncStatus}`}>
                                        {item.syncStatus === 'error' ? (
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    if (item.description === 'Proxy failed.' || item.description === 'Proxy timed out.') {
                                                        generateVideoProxy(item.id);
                                                    } else if (retryUpload) {
                                                        retryUpload(item.id); 
                                                    }
                                                }}
                                                className="bg-red-500 text-white p-1 rounded-md hover:bg-red-600 transition-colors flex items-center gap-1 shadow-lg"
                                                title={item.description === 'Proxy failed.' || item.description === 'Proxy timed out.' ? "Proxy failed. Click to retry." : "Upload failed. Click to retry."}
                                            >
                                                <i className="fa-solid fa-rotate-right text-[10px]"></i>
                                                <span className="text-[9px] font-bold">RETRY</span>
                                            </button>
                                        ) : (
                                            <i className="fa-solid fa-cloud-arrow-up text-gray-400 dark:text-gray-500 animate-bounce"></i>
                                        )}
                                    </div>
                                )}

                                {/* STACK BADGE */}
                                {isStack && (
                                    <div className="absolute top-2 right-2 z-30 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-0.5 rounded-md border border-white/20 shadow-lg">
                                        {stackCount}
                                    </div>
                                )}

                                {/* Metadata Overlays (Only if NOT a stack badge location) */}
                                {item.type === 'file' && !isStack && (
                                    <>
                                        <div className="absolute top-2 right-2 flex gap-1 z-20">
                                            {item.isAnalyzing && (
                                            <div className="flex items-center gap-1 bg-white/90 dark:bg-black/70 px-2 py-0.5 rounded-full backdrop-blur-sm border border-primary/30 shadow-sm">
                                                <i className="fa-solid fa-circle-notch fa-spin text-primary text-[10px]"></i>
                                                <span className="text-[10px] font-medium text-primary">AI</span>
                                            </div>
                                            )}
                                            {item.flag === 'picked' && <span className="material-icons-outlined text-green-500 bg-white dark:bg-black/50 rounded-full p-0.5 text-sm">flag</span>}
                                            {item.flag === 'rejected' && <span className="material-icons-outlined text-red-500 bg-white dark:bg-black/50 rounded-full p-0.5 text-sm">block</span>}
                                        </div>
                                        <div className="absolute bottom-2 left-2 z-20">
                                            {item.rating && item.rating > 0 ? <StarRating rating={item.rating} /> : null}
                                        </div>
                                    </>
                                )}
                                
                                {/* MATCH SNIPPET OVERLAY */}
                                {matchSnippet && (
                                    <div className="absolute bottom-12 left-2 right-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-black/80 backdrop-blur-md text-white text-[10px] p-2 rounded-lg border border-primary/30 shadow-neon-strong flex items-start gap-2">
                                            <i className={`fa-solid ${matchSnippet.type === 'moment' ? 'fa-clapperboard text-pink-400' : matchSnippet.type === 'tag' ? 'fa-tag text-blue-400' : 'fa-align-left text-primary'} mt-0.5`}></i>
                                            <div className="overflow-hidden">
                                                {matchSnippet.timestamp && <span className="font-mono bg-white/20 px-1 rounded mr-1 text-[9px]">{matchSnippet.timestamp}</span>}
                                                <span className="truncate block font-medium" title={matchSnippet.text}>{matchSnippet.text}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Content Preview */}
                                <div className="w-full h-full flex items-center justify-center">
                                    {item.type === 'folder' && (
                                    <i className="fa-solid fa-folder text-6xl text-gray-400 group-hover:text-primary transition-colors"></i>
                                    )}
                                    {item.type === 'file' && (item.fileType === 'image' || item.fileType === 'raw') && (
                                    (item.thumbnailUrl || item.previewUrl) ? 
                                    <img 
                                        src={item.thumbnailUrl || item.previewUrl} 
                                        alt={item.name} 
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            const parent = e.currentTarget.parentElement;
                                            if (parent) {
                                                parent.classList.add('bg-gray-200','dark:bg-dark-800');
                                                const warning = document.createElement('div');
                                                warning.className = 'flex flex-col items-center gap-1 text-gray-400';
                                                warning.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-xl"></i><span class="text-[8px] font-bold">PREVIEW ERROR</span>';
                                                parent.appendChild(warning);
                                            }
                                        }}
                                    /> :
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="material-icons-outlined text-5xl text-gray-500">
                                            {item.fileType === 'raw' ? 'camera' : 'image'}
                                        </span>
                                        {item.fileType === 'raw' && <span className="text-[10px] uppercase font-bold text-gray-500">RAW</span>}
                                    </div>
                                    )}
                                    
                                    {item.type === 'file' && item.fileType === 'video' && (
                                    <div className="relative w-full h-full flex items-center justify-center bg-black">
                                        {(item.proxyS3Key || item.s3Key) ? (
                                            <video 
                                                src={getPublicUrl(item.proxyS3Key || item.s3Key!)}
                                                poster={item.thumbnailUrl || item.previewUrl || undefined}
                                                className="w-full h-full object-contain"
                                                muted
                                                loop
                                                playsInline
                                                onMouseOver={(e) => { e.currentTarget.play().catch(() => {}); }}
                                                onMouseOut={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2">
                                                <i className="fa-solid fa-film text-4xl text-gray-600 animate-pulse"></i>
                                                <span className="text-[8px] text-gray-500 font-bold uppercase">
                                                    {item.syncStatus === 'uploading' ? 'Uploading...' : 
                                                    item.description === 'Upload failed.' ? 'Upload Failed' :
                                                    (item.description === 'Proxy failed.' || item.description === 'Proxy timed out.') ? 'Proxy Failed' : 
                                                    'Processing Proxy'}
                                                </span>
                                            </div>
                                        )}
                                        <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <i className="fa-solid fa-play text-[8px]"></i>
                                            VIDEO
                                        </span>
                                    </div>
                                    )}
                                    {item.type === 'file' && item.fileType === 'doc' && (
                                    <div className="flex flex-col items-center gap-2">
                                            <span className="material-icons-outlined text-5xl text-gray-500">description</span>
                                    </div>
                                    )}
                                </div>
                                </div>

                                {/* Text Info */}
                                <div className="text-center px-1">
                                <h3 className={`text-sm font-medium truncate transition-colors ${isSelected ? 'text-primary' : 'text-gray-700 dark:text-gray-200 group-hover:text-primary'}`}>
                                    {item.name}
                                </h3>
                                <div className="flex flex-wrap justify-center gap-1 mt-1 min-h-[1.25rem]">
                                    {isStack ? (
                                        <span className="text-[10px] bg-gray-200 dark:bg-dark-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-bold">
                                            Burst Stack
                                        </span>
                                    ) : (
                                        item.isAnalyzing ? (
                                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full animate-pulse font-medium">
                                                {item.analysisStatus || 'Analyzing...'}
                                            </span>
                                        ) : (
                                            item.tags?.slice(0, 3).map((tag, i) => (
                                            <span 
                                                key={i} 
                                                onClick={(e) => { e.stopPropagation(); handleTagClick(tag); }}
                                                className="text-[10px] bg-gray-200 dark:bg-dark-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full hover:bg-primary hover:text-white transition-colors cursor-pointer"
                                            >
                                                {tag}
                                            </span>
                                            ))
                                        )
                                    )}
                                </div>
                                </div>
                            </div>
                        );
                    })}
                </div>) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <span className="material-icons-outlined text-6xl mb-4 text-gray-300 dark:text-zinc-700">filter_none</span>
                    <p className="text-lg">No items match your filters.</p>
                    <button onClick={() => { setViewState({ searchQuery: '', filterRating: 0, filterFlag: 'all' }); }} className="mt-4 text-primary hover:underline">
                    Clear all filters
                    </button>
                </div>
            )}
          </div>

          {/* Inspector Sidebar */}
          <aside className={`bg-white dark:bg-surface-dark border-l border-gray-200 dark:border-white/10 transition-all duration-300 ease-in-out flex flex-col z-30 shadow-2xl ${isInspectorOpen ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0 overflow-hidden border-none'}`}>
              {/* ... Same content, could add Stack info if selected ... */}
              <div className="p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-dark-800/50">
                  <span className="font-bold text-sm text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                      {selectedItems.length === 0 ? 'Project Info' : selectedItems.length === 1 ? 'Details' : 'Selection Info'}
                  </span>
                  <button onClick={() => setIsInspectorOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                      <i className="fa-solid fa-xmark"></i>
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                   {/* ... (Existing Inspector Content) ... */}
                   {activeItem && activeItem.groupId && activeItem.isStackTop && isStackingEnabled && (
                       <div className="mb-6 p-4 bg-indigo-50 dark:bg-primary/10 rounded-xl border border-indigo-100 dark:border-primary/20">
                           <div className="flex items-center gap-3 mb-2">
                               <i className="fa-solid fa-layer-group text-primary text-xl"></i>
                               <div>
                                   <h4 className="font-bold text-gray-900 dark:text-white">Burst Stack</h4>
                                   <p className="text-xs text-gray-500 dark:text-gray-400">
                                       {items.filter(i => i.groupId === activeItem.groupId && i.syncStatus !== 'deleted').length} photos grouped
                                   </p>
                               </div>
                           </div>
                           <button 
                               onClick={(e) => handleItemDoubleClick(e as any, activeItem)} 
                               className="w-full mt-2 py-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-white/10 rounded-lg text-xs font-bold text-primary hover:bg-gray-50 dark:hover:bg-dark-700"
                           >
                               Open Burst Review
                           </button>
                       </div>
                   )}
                   
                   {/* ... (Rest of existing inspector content) ... */}
                   {selectedItems.length === 0 && (
                      <div className="flex flex-col gap-6">
                          <div className="flex flex-col items-center p-6 bg-gray-50 dark:bg-dark-700/30 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/10">
                               <span className="material-icons-outlined text-5xl text-gray-400 mb-2">folder_open</span>
                               <h3 className="font-medium text-gray-900 dark:text-white">{breadcrumbs[breadcrumbs.length - 1].name}</h3>
                               <p className="text-xs text-gray-500">Current Project</p>
                          </div>
                          
                          <div className="space-y-4">
                              <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">Total Items</span>
                                  <span className="font-medium text-gray-900 dark:text-white">{currentItems.length}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">Total Size</span>
                                  <span className="font-medium text-gray-900 dark:text-white">
                                      {formatSize(currentItems.reduce((acc, i) => acc + i.size, 0))}
                                  </span>
                              </div>
                          </div>
                      </div>
                   )}

                   {/* MULTI SELECTION VIEW */}
                   {selectedItems.length > 1 && (
                       <div className="flex flex-col gap-6 text-center pt-10">
                            <div className="w-20 h-20 bg-gray-100 dark:bg-dark-700 rounded-full flex items-center justify-center mx-auto text-gray-400">
                                <span className="material-icons-outlined text-4xl">filter_none</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedItems.length} items selected</h3>
                                <p className="text-sm text-gray-500">{formatSize(selectedItems.reduce((acc, i) => acc + i.size, 0))}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => handleBulkRate(5)} className="py-3 bg-gray-100 dark:bg-dark-700 rounded-xl font-bold hover:bg-yellow-100 dark:hover:bg-yellow-900/20 hover:text-yellow-600 transition-colors">
                                    <i className="fa-solid fa-star text-yellow-400 mr-2"></i> Rate 5
                                </button>
                                <button onClick={() => handleBulkRate(0)} className="py-3 bg-gray-100 dark:bg-dark-700 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors">
                                    <i className="fa-regular fa-star mr-2"></i> Clear
                                </button>
                            </div>

                            <button 
                                onClick={(e) => performDelete(e)}
                                className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fa-solid fa-trash"></i>
                                Delete {selectedItems.length} Items
                            </button>
                       </div>
                   )}
                   
                   {activeItem && !activeItem.groupId && (
                       // Standard Detail View for single non-stack item
                       <div className="flex flex-col gap-6">
                            {/* ... (Standard Image/Video Preview logic from prev) ... */}
                            <div className="aspect-square bg-gray-100 dark:bg-dark-900 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 flex items-center justify-center relative group">
                              {/* IMAGE PREVIEW */}
                              {activeItem.fileType === 'image' && activeItem.previewUrl && (
                                  <img src={activeItem.previewUrl} className="w-full h-full object-contain" />
                              )}
                              {/* VIDEO PREVIEW */}
                              {activeItem.fileType === 'video' && activeItem.previewUrl && (
                                  <video 
                                    src={activeItem.previewUrl} 
                                    className="w-full h-full object-contain" 
                                    controls 
                                  />
                              )}
                            </div>
                            
                            {/* VIDEO AI ANALYSIS BUTTON */}
                            {activeItem.fileType === 'video' && (
                                <button
                                    onClick={() => handleAnalyzeVideo(activeItem.id)}
                                    disabled={activeItem.isAnalyzing || !isStudio}
                                    className={`w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md ${activeItem.isAnalyzing 
                                        ? 'bg-gray-100 text-gray-400 cursor-wait' 
                                        : !isStudio 
                                            ? 'bg-gray-100 dark:bg-dark-700 text-gray-500 cursor-not-allowed opacity-75'
                                            : 'bg-primary text-white hover:bg-primary-hover shadow-primary/20'}`}
                                >
                                    {activeItem.isAnalyzing ? (
                                        <>
                                            <i className="fa-solid fa-circle-notch fa-spin"></i>
                                            {activeItem.analysisStatus || 'Analyzing...'}
                                        </>
                                    ) : (
                                        <>
                                            {!isStudio && <i className="fa-solid fa-lock text-xs"></i>}
                                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                                            Deep Analyze Video
                                        </>
                                    )}
                                </button>
                            )}

                            <div className="space-y-3">
                               <div>
                                   <label className="text-xs font-bold text-gray-500 uppercase">File Name</label>
                                   <input 
                                     type="text" 
                                     value={activeItem.name}
                                     onChange={(e) => renameItem(activeItem.id, e.target.value)}
                                     className="w-full bg-transparent border-b border-gray-300 dark:border-white/20 focus:border-primary outline-none py-1 text-sm text-gray-900 dark:text-white transition-colors"
                                   />
                               </div>
                               <div className="grid grid-cols-2 gap-4">
                                   <div>
                                       <p className="text-xs font-bold text-gray-500 uppercase">Size</p>
                                       <p className="text-sm text-gray-900 dark:text-white">{formatSize(activeItem.size)}</p>
                                   </div>
                                   <div>
                                       <p className="text-xs font-bold text-gray-500 uppercase">Date</p>
                                       <p className="text-sm text-gray-900 dark:text-white">{new Date(activeItem.dateAdded).toLocaleDateString()}</p>
                                   </div>
                               </div>
                               
                               {/* Sync Info */}
                               <div className="pt-2 border-t border-gray-200 dark:border-white/5">
                                   <p className="text-xs font-bold text-gray-500 uppercase mb-1">Sync Status</p>
                                   <div className="flex items-center gap-2 text-xs">
                                        <i className={`fa-solid ${activeItem.syncStatus === 'synced' ? 'fa-cloud-check text-green-500' : 'fa-cloud-arrow-up text-orange-400'}`}></i>
                                        <span className={activeItem.syncStatus === 'synced' ? 'text-green-500' : 'text-orange-400 font-medium'}>
                                            {activeItem.syncStatus.charAt(0).toUpperCase() + activeItem.syncStatus.slice(1)}
                                        </span>
                                   </div>
                               </div>

                               {/* DELETE BUTTON FOR SINGLE ITEM */}
                               <div className="pt-4 border-t border-gray-200 dark:border-white/5">
                                    <button 
                                        onClick={(e) => {
                                            if (e) { e.stopPropagation(); e.preventDefault(); }
                                            deleteItem(activeItem.id);
                                            setSelectedIds(new Set());
                                            setIsInspectorOpen(false);
                                            showToast('Item deleted (Ctrl+Z to Undo)', 'info');
                                        }}
                                        className="w-full py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <i className="fa-solid fa-trash"></i>
                                        Delete File
                                    </button>
                               </div>
                          </div>
                       </div>
                   )}
              </div>
          </aside>
      </div>

      {/* --- Floating Bottom Bar --- */}
      {!isInspectorOpen && selectedIds.size > 0 && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 shadow-2xl rounded-2xl p-2 z-40 flex items-center gap-2 animate-in slide-in-from-bottom-5 duration-300 max-w-[90vw] overflow-x-auto">
              <div className="px-4 text-sm font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-white/10 pr-4 mr-1 whitespace-nowrap">
                  {selectedIds.size} Selected
              </div>
              
              {/* NEW: Compare Button (Visible only if 2+ items selected) */}
              {selectedIds.size > 1 && (
                  <>
                    <button 
                        onClick={handleStartComparison}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-50 dark:bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-white rounded-xl transition-colors whitespace-nowrap"
                    >
                        <i className="fa-solid fa-code-compare transform rotate-90"></i>
                        Compare
                    </button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-white/10"></div>
                  </>
              )}

              <div className="flex gap-1 px-2">
                  <button onClick={() => handleBulkRate(1)} className="p-2 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"><span className="material-icons-outlined text-lg">star</span></button>
                  <button onClick={() => handleBulkRate(5)} className="p-2 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors flex"><span className="material-icons-outlined text-lg">star</span><span className="text-xs font-bold ml-0.5">5</span></button>
              </div>
              <div className="w-px h-6 bg-gray-200 dark:bg-white/10"></div>
              <div className="relative">
                {showBulkTagInput ? (
                    <form onSubmit={handleBulkTagSubmit} className="flex items-center gap-1">
                        <input 
                            autoFocus
                            type="text" 
                            className="w-32 bg-gray-100 dark:bg-dark-900 border-none rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary"
                            placeholder="Add tag..."
                            value={bulkTagValue}
                            onChange={(e) => setBulkTagValue(e.target.value)}
                            onBlur={() => !bulkTagValue && setShowBulkTagInput(false)}
                        />
                        <button type="submit" className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover"><span className="material-icons-outlined text-sm">check</span></button>
                    </form>
                ) : (
                    <button onClick={() => setShowBulkTagInput(true)} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-xl transition-colors whitespace-nowrap">
                        <span className="material-icons-outlined text-lg">local_offer</span>
                        Tag
                    </button>
                )}
              </div>
              <div className="w-px h-6 bg-gray-200 dark:bg-white/10"></div>
              <button 
                  onClick={(e) => performDelete(e)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors whitespace-nowrap"
              >
                  <span className="material-icons-outlined text-lg">delete</span>
                  Delete
              </button>
              <div className="w-px h-6 bg-gray-200 dark:bg-white/10"></div>
              <button onClick={() => setSelectedIds(new Set())} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors">
                  <span className="material-icons-outlined">close</span>
              </button>
          </div>
      )}

      {/* --- COMPARISON MODE OVERLAY --- */}
      {isComparing && (
          <div className="fixed inset-0 z-[100] bg-dark-900 flex flex-col animate-in fade-in duration-200">
               {/* Header */}
               <div className="h-16 px-6 bg-dark-800 border-b border-white/10 flex items-center justify-between shrink-0">
                   <div className="flex items-center gap-4">
                       <h2 className="text-lg font-bold text-white flex items-center gap-2">
                           <i className="fa-solid fa-code-compare text-primary"></i>
                           Comparison Mode
                       </h2>
                       <div className="h-6 w-px bg-white/10"></div>
                       <p className="text-xs text-gray-400 flex items-center gap-2">
                           <i className="fa-solid fa-mouse text-gray-500"></i>
                           Scroll to Zoom, Drag to Pan (Synchronized)
                       </p>
                   </div>
                   <div className="flex items-center gap-4">
                       <button 
                           onClick={() => setCompareTransform({ x: 0, y: 0, scale: 1 })}
                           className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
                       >
                           Reset View
                       </button>
                       <button 
                           onClick={() => setIsComparing(false)}
                           className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                       >
                           <i className="fa-solid fa-xmark"></i>
                       </button>
                   </div>
               </div>

               {/* Main Grid Canvas */}
               <div 
                   className="flex-1 overflow-hidden relative bg-black select-none cursor-move"
                   onWheel={handleCompareWheel}
                   onMouseDown={handleCompareMouseDown}
                   onMouseMove={handleCompareMouseMove}
                   onMouseUp={handleCompareMouseUp}
                   onMouseLeave={handleCompareMouseUp}
               >
                   <div className={`w-full h-full grid gap-1 p-1 ${
                       selectedItems.length === 2 ? 'grid-cols-2' : 
                       selectedItems.length === 3 ? 'grid-cols-3' : 
                       'grid-cols-2 grid-rows-2'
                   }`}>
                       {selectedItems.slice(0, 4).map((item) => (
                           <div key={item.id} className="relative overflow-hidden bg-dark-800 border border-white/10 group">
                               {/* Image Container with Transform */}
                               <div className="w-full h-full flex items-center justify-center">
                                   <div 
                                       style={{ 
                                           transform: `translate(${compareTransform.x}px, ${compareTransform.y}px) scale(${compareTransform.scale})`,
                                           transition: isDraggingRef.current ? 'none' : 'transform 0.1s ease-out',
                                           width: '100%',
                                           height: '100%'
                                       }}
                                       className="flex items-center justify-center"
                                   >
                                       <img 
                                           src={item.previewUrl} 
                                           alt={item.name} 
                                           className="max-w-full max-h-full object-contain pointer-events-none" 
                                           draggable={false}
                                       />
                                   </div>
                               </div>

                               {/* Individual Overlay Controls */}
                               <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                   <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs font-bold text-white shadow-lg">
                                       {item.name}
                                   </div>
                                   {/* Status Badge */}
                                   <div className="flex gap-2">
                                        {item.flag === 'picked' && <span className="bg-green-500 text-white px-2 py-1 rounded text-xs font-bold shadow-lg">PICKED</span>}
                                        {item.flag === 'rejected' && <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold shadow-lg">REJECTED</span>}
                                   </div>
                               </div>

                               {/* Bottom Toolbar per Image */}
                               <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-md rounded-xl p-2 border border-white/10 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
                                   <div className="flex items-center gap-0.5 border-r border-white/20 pr-3 mr-1">
                                        {[1,2,3,4,5].map(star => (
                                            <button 
                                                key={star}
                                                onClick={() => updateItemMetadata(item.id, { rating: star })}
                                                className={`text-sm hover:scale-110 transition-transform ${item.rating && item.rating >= star ? 'text-yellow-400' : 'text-gray-600'}`}
                                            >
                                                <i className={`fa-${item.rating && item.rating >= star ? 'solid' : 'regular'} fa-star`}></i>
                                            </button>
                                        ))}
                                   </div>
                                   <button 
                                       onClick={() => updateItemMetadata(item.id, { flag: item.flag === 'picked' ? null : 'picked' })}
                                       className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${item.flag === 'picked' ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}
                                   >
                                       <i className="fa-solid fa-flag"></i>
                                   </button>
                                   <button 
                                       onClick={() => updateItemMetadata(item.id, { flag: item.flag === 'rejected' ? null : 'rejected' })}
                                       className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${item.flag === 'rejected' ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}
                                   >
                                       <i className="fa-solid fa-xmark"></i>
                                   </button>
                               </div>

                           </div>
                       ))}
                   </div>
               </div>
          </div>
      )}

      {/* --- CULLING MODE MODAL --- */}
      {isCulling && activeCullingItem && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-200">
             
             {/* Header - CHANGED: Relative position, dark background, shrink-0 */}
             <div className="w-full p-4 flex justify-between items-center bg-dark-900 border-b border-white/10 z-20 shrink-0 text-white">
                <div>
                    <div className="flex items-center gap-2">
                        {cullingContextItems && (
                            <span className="bg-primary/20 text-primary border border-primary/50 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Burst Mode</span>
                        )}
                        <h3 className="text-lg font-bold truncate max-w-[200px] md:max-w-md">{activeCullingItem.name}</h3>
                    </div>
                    <p className="text-xs text-gray-400">{cullingIndex + 1} of {activeCullingList.length}</p>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => openMagicEditor(activeCullingItem)}
                        className={`px-3 py-1.5 rounded-full transition-colors flex items-center gap-2 text-sm font-bold shadow-neon ${!isProOrAbove ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-75' : 'bg-primary hover:bg-primary-hover'}`}
                    >
                         {!isProOrAbove ? <i className="fa-solid fa-lock text-xs"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                         <span className="hidden md:inline">Magic Edit</span>
                    </button>
                    <button onClick={() => { setIsCulling(false); setCullingContextItems(null); }} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors">
                        <span className="material-icons-outlined">close</span>
                    </button>
                </div>
            </div>

            {/* Main Canvas - CHANGED: Flex-1 to fill space, min-h-0 to contain image, relative for nav */}
            <div className="flex-1 w-full min-h-0 flex items-center justify-center p-6 relative bg-black/50 overflow-hidden">
                 {/* Nav Left - CHANGED: Z-index 30, background for visibility */}
                 <div 
                    className="absolute inset-y-0 left-0 w-24 cursor-pointer z-30 group flex items-center justify-start pl-4 outline-none"
                    onClick={(e) => { e.stopPropagation(); handleCullingAction('prev'); }}
                >
                    <span className="p-3 rounded-full bg-black/20 group-hover:bg-white/20 backdrop-blur-sm transition-all border border-transparent group-hover:border-white/10">
                        <span className="material-icons-outlined text-4xl text-white/50 group-hover:text-white transition-colors">chevron_left</span>
                    </span>
                </div>
                
                 {/* Nav Right - CHANGED: Z-index 30 */}
                <div 
                    className="absolute inset-y-0 right-0 w-24 cursor-pointer z-30 group flex items-center justify-end pr-4 outline-none"
                    onClick={(e) => { e.stopPropagation(); handleCullingAction('next'); }}
                >
                     <span className="p-3 rounded-full bg-black/20 group-hover:bg-white/20 backdrop-blur-sm transition-all border border-transparent group-hover:border-white/10">
                        <span className="material-icons-outlined text-4xl text-white/50 group-hover:text-white transition-colors">chevron_right</span>
                     </span>
                </div>
                
                {activeCullingItem.fileType === 'video' ? (
                    <video 
                        src={activeCullingItem.proxyS3Key ? `/api/file-view?key=${encodeURIComponent(activeCullingItem.proxyS3Key)}` : activeCullingItem.previewUrl} 
                        controls
                        autoPlay
                        loop
                        muted
                        className="max-w-full max-h-full object-contain shadow-2xl z-10"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                ) : (
                    <img 
                        src={activeCullingItem.previewUrl} 
                        alt={activeCullingItem.name} 
                        className="max-w-full max-h-full object-contain shadow-2xl z-10"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                )}
                
                {/* Visual Feedback Overlays */}
                {activeCullingItem.flag === 'picked' && (
                    <div className="absolute top-20 right-10 flex flex-col items-center animate-pulse z-20 pointer-events-none">
                         <span className="material-icons-outlined text-8xl text-green-500 drop-shadow-lg">flag</span>
                         <span className="text-green-400 font-bold uppercase tracking-widest text-xl drop-shadow-lg">Picked</span>
                    </div>
                )}
                 {activeCullingItem.flag === 'rejected' && (
                    <div className="absolute top-20 right-10 flex flex-col items-center animate-pulse z-20 pointer-events-none">
                         <span className="material-icons-outlined text-8xl text-red-500 drop-shadow-lg">block</span>
                         <span className="text-red-400 font-bold uppercase tracking-widest text-xl drop-shadow-lg">Rejected</span>
                    </div>
                )}
            </div>
            
            {/* Footer Bar - CHANGED: Shrink-0, dark background */}
            <div className="w-full bg-dark-900 border-t border-dark-600 p-6 flex flex-col md:flex-row justify-between items-center gap-4 z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center">
                         <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Rating</span>
                         <StarRating 
                            rating={activeCullingItem.rating || 0} 
                            onChange={(r) => {
                                updateItemMetadata(activeCullingItem.id, { rating: r });
                                showToast(`Rated ${r} Stars`, 'success');
                            }} 
                         />
                    </div>
                    <div className="w-px h-10 bg-dark-700 mx-2"></div>
                    <div className="flex gap-2">
                         <button onClick={() => handleCullingAction('pick')} className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border transition-all ${activeCullingItem.flag === 'picked' ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-dark-800 border-dark-600 text-gray-400 hover:bg-dark-700'}`}>
                            <span className="material-icons-outlined text-xl">flag</span>
                            <span className="text-[10px] font-bold mt-1">PICK (P)</span>
                        </button>
                         <button onClick={() => handleCullingAction('reject')} className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border transition-all ${activeCullingItem.flag === 'rejected' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-dark-800 border-dark-600 text-gray-400 hover:bg-dark-700'}`}>
                            <span className="material-icons-outlined text-xl">block</span>
                            <span className="text-[10px] font-bold mt-1">REJECT (X)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* --- MAGIC EDITOR MODAL --- */}
      {editingItem && (
          <MagicEditor 
              item={editingItem} 
              onClose={() => setEditingItem(null)} 
              onSave={handleMagicSave} 
          />
      )}

      {/* --- EXPORT MODAL --- */}
      <ExportModal 
          isOpen={isExportOpen} 
          onClose={() => setIsExportOpen(false)}
          selectedItems={Array.from(selectedIds).map(id => items.find(i => i.id === id)!).filter(Boolean)}
      />

      {/* --- CLEANUP MODAL --- */}
      <CleanupModal
          isOpen={isCleanupOpen}
          onClose={() => setIsCleanupOpen(false)}
      />

    </div>
  );
};

export default Browse;
