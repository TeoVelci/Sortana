
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { generateTagsForBatch, FolderPlan, analyzeVideo, VideoAnalysisResult, QuotaExceededError, processFileForDisplay, BatchItem, extractDetailedMetadata, getFriendlyCameraName, analyzeVideoMetadata } from './aiService';
import { saveFileToDB, getFileFromDB, deleteFileFromDB } from './dbService';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';
import { getPresignedUrl, uploadFileToS3, downloadFileFromS3 } from './storageService';
import { fetchItems, upsertItem, deleteItemFromDB as deleteItemFromSupabase, fetchUserProfile } from './supabaseService';

// --- Types ---

export interface User {
  username: string;
// ... (rest of the file)
  email: string;
  plan: string;
  avatarUrl?: string;
}

export interface StorageStats {
  usedBytes: number;
  limitBytes: number;
}

export interface VideoMetadata {
    title?: string;
    summary?: string;
    moments?: { timestamp: string, description: string }[];
}

export interface FileSystemItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  fileType?: 'image' | 'video' | 'raw' | 'doc';
  size: number;
  previewUrl?: string;
  thumbnailUrl?: string;
  tags?: string[];
  description?: string;
  videoMetadata?: VideoMetadata;
  proxyS3Key?: string;
  parentId: string | null; // null for root
  dateAdded: number;
  // Metadata for Culling & Stacking
  dateTaken?: number; // Capture timestamp
  groupId?: string;   // ID shared by burst items
  isStackTop?: boolean; // Is this the representative of the stack?
  rating?: number; // 0 to 5
  flag?: 'picked' | 'rejected' | null;
  // Dimensions
  width?: number;
  height?: number;
  // AI Status
  isAnalyzing?: boolean;
  // Technical Metadata
  make?: string;
  model?: string;
  // Sync Status
  syncStatus: 'synced' | 'uploading' | 'error' | 'deleted';
  s3Key?: string;
}

export interface Activity {
  id: string;
  projectId: string; // Maps to a folder name usually
  projectName: string;
  timestamp: number;
}

// Global View State for Filters
export interface ViewState {
  searchQuery: string;
  filterRating: number;
  filterFlag: 'picked' | 'rejected' | 'unflagged' | 'all';
  isStackingEnabled: boolean; // Toggle for Burst Mode
}

// --- History / Undo Types ---
interface HistoryAction {
    description: string;
    undo: () => void;
    redo: () => void;
}

interface AppContextType {
  user: User;
  isAuthenticated: boolean;
  storage: StorageStats;
  items: FileSystemItem[];
  recentActivity: Activity[];
  viewState: ViewState;
  
  // Navigation State
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;

  // Auth Actions
  login: (email: string) => void;
  logout: () => void;
  
  // Actions
  updateUser: (updates: Partial<User>) => void;
  uploadFiles: (files: File[], projectTag: string, useSmartSort?: boolean) => Promise<void>;
  createFolder: (name: string) => void;
  addGeneratedFile: (file: File, parentId: string | null, tags: string[]) => Promise<void>;
  renameItem: (id: string, newName: string) => void;
  deleteItem: (id: string) => void;
  updateItemMetadata: (id: string, updates: Partial<FileSystemItem>) => void;
  executeOrganizationPlan: (plan: FolderPlan[], targetParentId?: string | null) => void;
  analyzeVideoItem: (id: string) => Promise<void>;
  generateVideoProxy: (id: string) => Promise<void>;
  
  // View Actions
  setViewState: (updates: Partial<ViewState>) => void;
  resetFilters: () => void;

  // Bulk Actions
  bulkDeleteItems: (ids: string[]) => void;
  bulkUpdateMetadata: (ids: string[], updates: Partial<FileSystemItem>) => void;
  bulkAddTags: (ids: string[], tag: string) => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  historyDescription?: string; // Description of the next undo action

  // Helpers
  formatSize: (bytes: number) => string;
  getStoragePercentage: () => number;
  getFileObject: (id: string) => File | undefined; // Helper to retrieve File object if available in memory
  retryUpload: (id: string) => Promise<void>;
  
  // Queue Status
  queueStatus: 'idle' | 'processing' | 'paused';
  syncQueue: FileSystemItem[];
}

// --- Initial Mock Data ---

const INITIAL_USER: User = {
  username: 'New User',
  email: 'user@sortana.ai',
  plan: 'Free' // Start on Free Tier
};

const PLAN_LIMITS: Record<string, number> = {
  'Free': 2 * 1024 * 1024 * 1024,       // 2 GB
  'Basic': 50 * 1024 * 1024 * 1024,     // 50 GB
  'Pro': 1024 * 1024 * 1024 * 1024,     // 1 TB
  'Studio': 5 * 1024 * 1024 * 1024 * 1024 // 5 TB
};

const INITIAL_STORAGE: StorageStats = {
  usedBytes: 0,
  limitBytes: PLAN_LIMITS['Free']
};

// CLEAN SLATE: No ghost data
const INITIAL_ITEMS: FileSystemItem[] = [];
const INITIAL_ACTIVITY: Activity[] = [];

// VERSIONING to clear old data
const SORTANA_DB_VERSION = '1.3';

// --- Helper: LocalStorage Loader ---
const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage`, e);
    return fallback;
  }
};

// --- Context ---

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  
  // Initialize State from LocalStorage
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!session);
  
  const [user, setUser] = useState<User>(INITIAL_USER);
  const [storage, setStorage] = useState<StorageStats>(() => loadState('sortana_storage', INITIAL_STORAGE));
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const itemsRef = useRef<FileSystemItem[]>([]);
  
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [recentActivity, setRecentActivity] = useState<Activity[]>(() => loadState('sortana_activity', INITIAL_ACTIVITY));
  
  // Global Navigation State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Sync Auth State & Fetch Data
  useEffect(() => {
    setIsAuthenticated(!!session);
    if (session?.user?.email) {
        // Fetch Profile from Supabase
        fetchUserProfile().then(profile => {
            if (profile) {
                setUser(prev => ({ ...prev, ...profile }));
            } else {
                setUser(prev => ({
                    ...prev,
                    email: session.user.email!,
                    username: session.user.email!.split('@')[0]
                }));
            }
        });

        // Fetch Items from Supabase
        fetchItems().then(fetchedItems => {
            // If the app crashed or was reloaded while items were 'uploading',
            // they are permanently stuck. Reset them to 'error' state.
            let needsDbUpdate = false;
            const cleanedItems = fetchedItems.map(item => {
                if (item.syncStatus === 'uploading') {
                    needsDbUpdate = true;
                    const updatedItem = { ...item, syncStatus: 'error' as const, description: 'Upload interrupted.' };
                    upsertItem(updatedItem); // Persist the reset status
                    return updatedItem;
                }
                return item;
            });
            setItems(cleanedItems);
        });
    } else {
        // Clear items on logout
        setItems([]);
    }
  }, [session]);

  // Poll for updates if any item is generating a proxy
  useEffect(() => {
    const isGenerating = items.some(item => item.description === 'Generating proxy...');
    if (!isGenerating || !session) return;

    const intervalId = setInterval(() => {
      fetchItems().then(fetchedItems => {
        setItems(fetchedItems);
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(intervalId);
  }, [items, session]);

  // File Cache now stores actual File objects, populated on upload or rehydration from DB
  const [fileCache, setFileCache] = useState<Map<string, File>>(new Map());

  const [viewState, setViewStateLocal] = useState<ViewState>({
    searchQuery: '',
    filterRating: 0,
    filterFlag: 'all',
    isStackingEnabled: true
  });

  // --- Undo/Redo Stacks ---
  const [past, setPast] = useState<HistoryAction[]>([]);
  const [future, setFuture] = useState<HistoryAction[]>([]);

  // --- AI Processing Queue State ---
  const [analysisQueue, setAnalysisQueue] = useState<BatchItem[]>([]);
  const [videoMetadataQueue, setVideoMetadataQueue] = useState<{ id: string, rawMetadata: string, useSmartSort: boolean, rootFolderId: string }[]>([]);
  const [isProcessingVideoQueue, setIsProcessingVideoQueue] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [queuePausedUntil, setQueuePausedUntil] = useState<number>(0);

  // Computed Queue Status
  const queueStatus = queuePausedUntil > Date.now() ? 'paused' : (isProcessingQueue || analysisQueue.length > 0) ? 'processing' : 'idle';
  const syncQueue = items.filter(i => i.syncStatus === 'uploading');

  // Persistence Effects (Metadata)
  // Note: We don't persist auth state manually anymore as Supabase handles it
  // Note: User and Items are now persisted in Supabase
  useEffect(() => localStorage.setItem('sortana_storage', JSON.stringify(storage)), [storage]);
  useEffect(() => localStorage.setItem('sortana_activity', JSON.stringify(recentActivity)), [recentActivity]);

  // --- GHOST DATA CLEARER ---
  useEffect(() => {
     const storedVersion = localStorage.getItem('sortana_version');
     if (storedVersion !== SORTANA_DB_VERSION) {
         console.log("Sortana: Detected old data version. Wiping ghost data.");
         setItems([]);
         setRecentActivity([]);
         // Reset User to default (Free) on version bump
         setUser(INITIAL_USER); 
         localStorage.removeItem('sortana_items');
         localStorage.removeItem('sortana_activity');
         localStorage.setItem('sortana_version', SORTANA_DB_VERSION);
     }
  }, []);

  // --- REACTIVE STORAGE CALCULATION ---
  useEffect(() => {
    const totalBytes = items.reduce((acc, item) => acc + item.size, 0);
    
    // Dynamic Limit based on Plan
    const currentLimit = PLAN_LIMITS[user.plan] || PLAN_LIMITS['Free'];

    setStorage({
        usedBytes: totalBytes,
        limitBytes: currentLimit
    });
  }, [items, user.plan]);

  // --- DB REHYDRATION EFFECT ---
  const hasRehydrated = useRef(false);
  useEffect(() => {
      const rehydrateFiles = async () => {
          if (items.length === 0 || hasRehydrated.current) return;
          
          console.debug("Rehydrating files...");
          const newCache = new Map<string, File>();
          let hasUpdates = false;

          const updatedItems = await Promise.all(items.map(async (item) => {
              const newItem = { ...item };
              let itemChanged = false;

              // Reset stuck uploads
              if (newItem.syncStatus === 'uploading') {
                  // Check if it's a recent upload that might still be in progress
                  // For now, we move it to error so the user can retry, since memory File is lost
                  newItem.syncStatus = 'error';
                  newItem.description = 'Upload interrupted.';
                  itemChanged = true;
              }

              if (newItem.type === 'file') {
                  const isBlob = newItem.previewUrl?.startsWith('blob:');
                  const isThumbBlob = newItem.thumbnailUrl?.startsWith('blob:');
                  
                  // 1. Check if we have an S3 Key -> Use Signed URL Redirect
                  // If it's a blob URL from a previous session, it's invalid, so replace it.
                  if (newItem.s3Key && (!newItem.previewUrl || isBlob)) {
                      // For non-raw images, we can use the original as preview if no specific preview exists
                      if (newItem.fileType !== 'raw') {
                          newItem.previewUrl = getPublicUrl(newItem.s3Key);
                          itemChanged = true;
                      } else {
                          // For RAW files, if the preview is a dead blob, we should try to re-generate it 
                          // if we have the file in IndexedDB (handled in step 2)
                      }
                  }
                  
                  if (newItem.s3Key && (!newItem.thumbnailUrl || isThumbBlob)) {
                      // Fallback to previewUrl if thumbnailUrl is missing, or use s3Key if not raw
                      if (newItem.previewUrl && !newItem.previewUrl.startsWith('blob:')) {
                          newItem.thumbnailUrl = newItem.previewUrl;
                          itemChanged = true;
                      } else if (newItem.fileType !== 'raw') {
                          newItem.thumbnailUrl = getPublicUrl(newItem.s3Key);
                          itemChanged = true;
                      }
                  }

                  // 2. Fallback to IndexedDB (Legacy/Offline)
                  if ((!newItem.previewUrl || isBlob) || (!newItem.thumbnailUrl || isThumbBlob)) {
                      try {
                          const blob = await getFileFromDB(newItem.id);
                          if (blob) {
                              const file = new File([blob], newItem.name, { type: blob.type });
                              newCache.set(newItem.id, file);
                              
                              // Re-generate both if needed
                              if (!newItem.previewUrl || isBlob) {
                                  const displayBlob = await processFileForDisplay(file, 2560);
                                  if (displayBlob) {
                                     newItem.previewUrl = URL.createObjectURL(displayBlob);
                                     itemChanged = true;
                                  }
                              }
                              
                              if (!newItem.thumbnailUrl || isThumbBlob) {
                                  const thumbBlob = await processFileForDisplay(file, 400);
                                  if (thumbBlob) {
                                     newItem.thumbnailUrl = URL.createObjectURL(thumbBlob);
                                     itemChanged = true;
                                  }
                              }
                          }
                      } catch (e) {
                          // Silently fail
                      }
                  }

                  // 3. Fix Stuck Analysis
                  // We no longer mark them as complete here, but let the re-queue effect handle it
                  if (newItem.isAnalyzing && !newCache.has(newItem.id) && !newItem.s3Key) {
                      newItem.isAnalyzing = false;
                      if (!newItem.description) {
                          newItem.description = "Analysis skipped (file lost).";
                      }
                      itemChanged = true;
                      upsertItem(newItem);
                  }

                  // 4. Fix AI Error on videos from old bug
                  if (newItem.fileType === 'video' && newItem.tags?.includes('AI Error')) {
                      newItem.tags = newItem.tags.filter(t => t !== 'AI Error');
                      if (newItem.description === "AI Service Error. Please try again later.") {
                          newItem.description = "";
                      }
                      itemChanged = true;
                      upsertItem(newItem);
                  }
              }
              
              if (itemChanged) hasUpdates = true;
              return newItem;
          }));

          if (hasUpdates) {
              setItems(updatedItems);
              setFileCache(prev => new Map([...prev, ...newCache]));
              console.debug("Rehydration complete.");
          }
          hasRehydrated.current = true;
      };

      rehydrateFiles();
  }, [items]);

  // Helper: Format Bytes
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStoragePercentage = () => {
    return Math.min(100, (storage.usedBytes / storage.limitBytes) * 100);
  };

  const getFileObject = (id: string): File | undefined => {
      return fileCache.get(id);
  };

  // Auth Actions
  const login = (email: string) => {
    // Deprecated: Login is handled by Supabase Auth Component
    console.warn("AppContext login called directly. Use Supabase Auth instead.");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    // Clear local state if needed
  };

  const getOrCreateFolder = useCallback((name: string, parentId: string, key: string, localNewItems?: FileSystemItem[], localFolderMap?: Map<string, string>) => {
    if (localFolderMap?.has(key)) return localFolderMap.get(key)!;
    
    const existing = itemsRef.current.find(i => i.parentId === parentId && i.name === name) || 
                     localNewItems?.find(i => i.parentId === parentId && i.name === name);
                     
    if (existing) {
        localFolderMap?.set(key, existing.id);
        return existing.id;
    }
    
    const id = Math.random().toString(36).substr(2, 9) + '-smart';
    const folder: FileSystemItem = {
        id, name, type: 'folder', size: 0, parentId, dateAdded: Date.now(), syncStatus: 'synced'
    };
    
    localNewItems?.push(folder);
    upsertItem(folder); // Persist smart folder
    
    // Update ref immediately so subsequent calls in the same tick see it
    itemsRef.current = [...itemsRef.current, folder];
    if (!localNewItems) {
        setItems(itemsRef.current);
    }
    
    localFolderMap?.set(key, id);
    return id;
  }, []);

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => ({ ...prev, ...updates }));
  };

  // --- UNDO / REDO LOGIC ---

  const addToHistory = (action: HistoryAction) => {
      setFuture([]); // Clear redo stack on new action
      setPast(prev => {
          const newPast = [...prev, action];
          if (newPast.length > 50) newPast.shift(); // Limit history depth
          return newPast;
      });
  };

  const undo = useCallback(() => {
      if (past.length === 0) return;
      const action = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      
      action.undo();
      
      setPast(newPast);
      setFuture(prev => [action, ...prev]);
  }, [past]);

  const redo = useCallback(() => {
      if (future.length === 0) return;
      const action = future[0];
      const newFuture = future.slice(1);
      
      action.redo();
      
      setFuture(newFuture);
      setPast(prev => [...prev, action]);
  }, [future]);


  // --- RE-QUEUE STUCK ANALYSIS ---
  useEffect(() => {
    if (!hasRehydrated.current || items.length === 0) return;
    
    const stuckItems = items.filter(i => i.isAnalyzing && i.fileType !== 'video' && !analysisQueue.some(q => q.id === i.id));
    if (stuckItems.length > 0) {
        const newTasks: BatchItem[] = stuckItems.map(i => ({
            id: i.id,
            s3Key: i.s3Key,
            retryCount: 0
        }));
        
        setAnalysisQueue(prev => {
            const existingIds = new Set(prev.map(q => q.id));
            const filtered = newTasks.filter(t => !existingIds.has(t.id));
            if (filtered.length === 0) return prev;
            console.debug(`Re-queuing ${filtered.length} truly stuck analysis items.`);
            return [...prev, ...filtered];
        });
    }
  }, [items, analysisQueue]);

  // --- Global Queue Processor ---
  useEffect(() => {
    if (Date.now() < queuePausedUntil) {
        const timeout = setTimeout(() => {
            setQueuePausedUntil(0);
        }, queuePausedUntil - Date.now());
        return () => clearTimeout(timeout);
    }

    if (analysisQueue.length === 0 || isProcessingQueue) return;

    const processNextBatch = async () => {
      setIsProcessingQueue(true);
      // OPTIMIZATION: Process 1 image at a time (STRICT MODE)
      const BATCH_SIZE = 1; 
      const currentBatch = analysisQueue.slice(0, BATCH_SIZE);
      const validBatch = currentBatch.filter(task => items.some(i => i.id === task.id));

      if (validBatch.length === 0) {
          setAnalysisQueue(prev => prev.slice(currentBatch.length));
          setIsProcessingQueue(false);
          return;
      }

      setItems(prev => prev.map(item => 
         validBatch.some(b => b.id === item.id) 
         ? { ...item, description: "Preparing..." } 
         : item
      ));

      try {
        // ROBUSTNESS: Ensure we have the file data (fetch from S3 if needed)
        const readyBatch = await Promise.all(validBatch.map(async (task) => {
            const item = items.find(i => i.id === task.id);
            if (!item) return task;

            let file = task.file || fileCache.get(task.id);
            const previewBlob = task.previewBlob;

            if (!file && !previewBlob && item.s3Key) {
                try {
                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, description: "Fetching from S3..." } : i));
                    const blob = await downloadFileFromS3(item.s3Key);
                    file = new File([blob], item.name, { type: blob.type });
                    // Cache it for future use
                    setFileCache(prev => new Map(prev).set(item.id, file!));
                } catch (e) {
                    console.warn(`Failed to fetch ${item.name} from S3 for analysis`, e);
                }
            }

            if (!file && !previewBlob) {
                throw new Error(`File data missing for ${item.name}`);
            }

            return { ...task, file: file!, previewBlob };
        }));

        setItems(prev => prev.map(item => 
            validBatch.some(b => b.id === item.id) 
            ? { ...item, description: "Analyzing..." } 
            : item
        ));

        const results = await generateTagsForBatch(readyBatch);
        setItems(prev => prev.map(item => {
            const result = results.find(r => r.id === item.id);
            if (result) {
                if (result.tags[0] === 'AI Error') {
                     return { ...item, isAnalyzing: false, description: "AI Service Error. Please try again later." };
                }
                const updated = {
                    ...item,
                    tags: [...(item.tags || []), ...result.tags],
                    description: result.description,
                    isAnalyzing: false
                };
                // PERSIST TO SUPABASE
                upsertItem(updated);
                return updated;
            }
            return item;
        }));
        setAnalysisQueue(prev => prev.slice(currentBatch.length));

      } catch (e) {
         if (e instanceof QuotaExceededError) {
             const item = validBatch[0]; 
             const retryCount = (item.retryCount || 0) + 1;
             console.warn(`Quota Hit. Retrying batch in 30s. Attempt: ${retryCount}`);
             
             if (retryCount > 3) {
                  setItems(prev => prev.map(i => validBatch.some(b => b.id === i.id) ? { ...i, description: "Skipped (Quota Limit)", isAnalyzing: false } : i));
                  setAnalysisQueue(prev => prev.slice(currentBatch.length));
             } else {
                 const updatedBatch = validBatch.map(b => ({ ...b, retryCount }));
                 setAnalysisQueue(prev => {
                     const remaining = prev.slice(currentBatch.length);
                     return [...remaining, ...updatedBatch];
                 });
                 setItems(prev => prev.map(i => validBatch.some(b => b.id === i.id) ? { ...i, description: `Quota hit. Queued for retry (${retryCount}/3)...` } : i));
                 setQueuePausedUntil(Date.now() + 30000); 
             }
         } else {
             console.error("Analysis Failed", e);
             setItems(prev => prev.map(item => 
                validBatch.some(b => b.id === item.id)
                ? { ...item, isAnalyzing: false, description: "Analysis failed (Invalid format/size)." } 
                : item
             ));
             setAnalysisQueue(prev => prev.slice(currentBatch.length));
         }
      } finally {
         await new Promise(resolve => setTimeout(resolve, 500));
         setIsProcessingQueue(false);
      }
    };

    processNextBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisQueue, isProcessingQueue, queuePausedUntil]); 

  // --- Video Metadata Queue Processor ---
  useEffect(() => {
    if (videoMetadataQueue.length === 0 || isProcessingVideoQueue) return;

    const processNextVideo = async () => {
      setIsProcessingVideoQueue(true);
      const task = videoMetadataQueue[0];
      
      try {
        const aiMeta = await analyzeVideoMetadata(task.rawMetadata);
        if (aiMeta && aiMeta.model) {
          const item = items.find(i => i.id === task.id);
          if (item) {
            const make = aiMeta.make || 'Sony';
            const model = aiMeta.model;
            const friendlyCamera = getFriendlyCameraName(make, model);
            
            const updates: Partial<FileSystemItem> = { make, model, isAnalyzing: false };
            
            // If smart sort is enabled, we might need to move the file
            if (task.useSmartSort) {
              const dateTaken = item.dateTaken ? new Date(item.dateTaken) : new Date();
              const dateStr = dateTaken.toISOString().split('T')[0];
              
              // Nested Hierarchy: Camera Model > Date
              const cameraFolderId = getOrCreateFolder(friendlyCamera, task.rootFolderId, `ROOT|${friendlyCamera}`);
              const newParentId = getOrCreateFolder(dateStr, cameraFolderId, `ROOT|${friendlyCamera}|${dateStr}`);
              
              if (newParentId !== item.parentId) {
                const oldParentId = item.parentId;
                updates.parentId = newParentId;
                
                // Cleanup old folder if it's now empty
                setTimeout(() => {
                  setItems(prev => {
                    const folderItems = prev.filter(i => i.parentId === oldParentId && i.id !== task.id);
                    if (folderItems.length === 0) {
                      // It's empty, remove it
                      return prev.filter(i => i.id !== oldParentId);
                    }
                    return prev;
                  });
                }, 100);
              }
            }
            
            setItems(prev => {
              const latestItems = prev.map(i => {
                if (i.id === task.id) {
                  const updated = { ...i, ...updates };
                  upsertItem(updated);
                  return updated;
                }
                return i;
              });
              return latestItems;
            });
          }
        } else {
          // No model found, still clear the analyzing flag and set a generic model
          const item = items.find(i => i.id === task.id);
          if (item) {
            const updates = { model: 'Sony Camera', isAnalyzing: false };
            setItems(prev => prev.map(i => i.id === task.id ? { ...i, ...updates } : i));
            upsertItem({ ...item, ...updates });
          }
        }
      } catch (err) {
        console.warn("Background AI metadata analysis failed", err);
        // Clear analyzing flag on error too
        setItems(prev => prev.map(i => i.id === task.id ? { ...i, isAnalyzing: false, model: 'Sony Camera' } : i));
      } finally {
        setVideoMetadataQueue(prev => prev.slice(1));
        setIsProcessingVideoQueue(false);
      }
    };

    processNextVideo();
  }, [videoMetadataQueue, isProcessingVideoQueue, items, getOrCreateFolder]);


  const analyzeVideoItem = async (id: string) => {
      // Safety Check: Double gate against unauthorized use
      if (user.plan !== 'Studio') {
          console.warn("Unauthorized: Video analysis attempted on non-Studio plan.");
          return;
      }

      const item = items.find(i => i.id === id);
      const file = fileCache.get(id);

      if (!item || !file || item.fileType !== 'video') {
          console.warn("Analyze failed: File not found in memory cache or incorrect type.");
          return;
      }

      setItems(prev => prev.map(i => i.id === id ? { ...i, isAnalyzing: true } : i));

      try {
          const result: VideoAnalysisResult = await analyzeVideo(file);
          setItems(prev => prev.map(i => {
              if (i.id === id) {
                  const updated = {
                      ...i,
                      name: result.title || i.name,
                      description: result.summary,
                      tags: [...(i.tags || []), ...result.tags],
                      videoMetadata: {
                          title: result.title,
                          summary: result.summary,
                          moments: result.moments
                      },
                      isAnalyzing: false
                  };
                  upsertItem(updated);
                  return updated;
              }
              return i;
          }));
      } catch (error) {
          console.error("Video Analysis Failed", error);
          setItems(prev => prev.map(i => i.id === id ? { ...i, isAnalyzing: false } : i));
          throw error;
      }
  };

  const createFolder = (name: string) => {
    if (items.some(i => i.type === 'folder' && i.name.toLowerCase() === name.toLowerCase())) {
        return; 
    }
    
    const folderId = Date.now().toString() + '-folder';
    const newFolder: FileSystemItem = {
      id: folderId,
      name: name,
      type: 'folder',
      size: 0,
      parentId: null,
      dateAdded: Date.now(),
      syncStatus: 'synced'
    };
    
    setItems(prev => [...prev, newFolder]);
    upsertItem(newFolder); // Persist to Supabase

    setRecentActivity(prev => [{ id: Date.now().toString(), projectId: folderId, projectName: name, timestamp: Date.now() }, ...prev].slice(0, 5));

    addToHistory({
        description: `Create folder '${name}'`,
        undo: () => {
            setItems(prev => prev.filter(i => i.id !== folderId));
            deleteItemFromSupabase(folderId);
        },
        redo: () => {
             setItems(prev => [...prev, newFolder]);
             upsertItem(newFolder);
        }
    });
  };

  const uploadFiles = async (files: File[], projectTag: string, useSmartSort: boolean = true) => {
    // 0. STRICT QUOTA CHECK
    const totalUploadSize = files.reduce((acc, f) => acc + f.size, 0);
    const currentLimit = PLAN_LIMITS[user.plan] || PLAN_LIMITS['Free'];
    
    if (storage.usedBytes + totalUploadSize > currentLimit) {
        const gbLimit = (currentLimit / (1024 * 1024 * 1024)).toFixed(0);
        throw new Error(`Upload exceeds ${user.plan} plan limit (${gbLimit}GB). Upgrade to add more.`);
    }

    let rootFolderId: string;
    const existingRoot = items.find(i => i.type === 'folder' && i.name.toLowerCase() === projectTag.toLowerCase() && i.parentId === null);
    
    if (existingRoot) {
      rootFolderId = existingRoot.id;
      setRecentActivity(prev => {
        const filtered = prev.filter(a => a.projectId !== rootFolderId);
        return [{ id: Date.now().toString(), projectId: rootFolderId, projectName: existingRoot.name, timestamp: Date.now() }, ...filtered].slice(0, 5);
      });
    } else {
      rootFolderId = Date.now().toString() + '-folder';
      const newFolder: FileSystemItem = {
        id: rootFolderId,
        name: projectTag,
        type: 'folder',
        size: 0,
        parentId: null,
        dateAdded: Date.now(),
        syncStatus: 'synced'
      };
      setItems(prev => [...prev, newFolder]);
      upsertItem(newFolder); // Persist to Supabase
      setRecentActivity(prev => [{ id: Date.now().toString(), projectId: rootFolderId, projectName: projectTag, timestamp: Date.now() }, ...prev].slice(0, 5));
    }

    const newItems: FileSystemItem[] = [];
    const imagesToQueue: BatchItem[] = [];
    const folderMap = new Map<string, string>();

    // 1. Identify sidecar XML files for Sony metadata pairing
    const xmlMap = new Map<string, File>();
    for (const f of files) {
        if (f.name.toLowerCase().endsWith('.xml')) {
            const baseName = f.name.substring(0, f.name.lastIndexOf('.')).toUpperCase();
            xmlMap.set(baseName, f);
        }
    }

    const uploadTasks: (() => Promise<void>)[] = [];

    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.xml')) continue; // Skip XML files as items, they are sidecars

      const id = Math.random().toString(36).substr(2, 9);
      // Cache file in memory for immediate AI processing
      setFileCache(prev => new Map(prev).set(id, f));

      let fType: FileSystemItem['fileType'] = 'doc';
      let previewUrl: string | undefined = undefined;
      let thumbnailUrl: string | undefined = undefined;
      let previewBlob: Blob | undefined = undefined;
      let thumbnailBlob: Blob | undefined = undefined;
      let shouldAnalyze = false;
      let dateTaken = f.lastModified;
      let make: string | undefined; 
      let model: string | undefined;
      let rawMetadata: string | undefined;

      try {
          // Generate high-res preview (2560px)
          const processed = await processFileForDisplay(f, 2560);
          const isRaw = f.type.includes('raw') || f.name.toLowerCase().match(/\.(arw|cr2|cr3|nef|dng|orf|rw2|raf)$/i);
          
          if (processed) {
              previewBlob = processed;
              previewUrl = URL.createObjectURL(processed);
              fType = isRaw ? 'raw' : 'image';
              shouldAnalyze = true;
              
              // Generate small thumbnail (1024px) for grid performance
              const thumb = await processFileForDisplay(f, 1024);
              if (thumb) {
                  thumbnailBlob = thumb;
                  thumbnailUrl = URL.createObjectURL(thumb);
              }
          } else if (f.type.startsWith('image/') || isRaw) {
              fType = isRaw ? 'raw' : 'image';
              shouldAnalyze = true;
          } else if (f.type.startsWith('video/')) {
              fType = 'video';
              shouldAnalyze = false; // Videos are handled by VideoMetadataQueue, not the image AI
          }

          const meta = await extractDetailedMetadata(f);
          if (meta.dateTaken) dateTaken = meta.dateTaken.getTime();
          if (meta.make) make = meta.make;
          if (meta.model) model = meta.model;
          rawMetadata = meta.rawMetadata;

          // Sidecar XML Fast Track (If binary scan failed or returned generic)
          if (fType === 'video' && (!model || model.toLowerCase() === 'sony camera' || model.toLowerCase() === 'sony')) {
              const baseName = f.name.substring(0, f.name.lastIndexOf('.')).toUpperCase();
              // Sony often names XML as C0355M01.XML for C0355.MP4
              const sidecar = xmlMap.get(baseName) || xmlMap.get(baseName + 'M01');
              if (sidecar) {
                  const xmlText = await sidecar.text();
                  const modelMatch = xmlText.match(/<Device modelName="([^"]+)"/i) || xmlText.match(/<Model>([^<]+)<\/Model>/i);
                  if (modelMatch) {
                      model = modelMatch[1].trim();
                      make = 'Sony';
                  }
              }
          }



      } catch (e) {
          console.warn(`Pre-process failed for ${f.name}`, e);
      }

      const isSony = make?.toLowerCase().includes('sony') || model?.toLowerCase().includes('sony') || rawMetadata?.toUpperCase().includes('SONY');
      const needsAI = fType === 'video' && (!model || model.toLowerCase() === 'sony camera' || model.toLowerCase() === 'sony' || isSony);
      const isGenericSony = model && (model.toUpperCase() === 'A7' || model.toUpperCase() === 'A9' || model.toUpperCase() === 'A1' || model.toUpperCase() === 'SONY' || model.toUpperCase() === 'SONY CAMERA' || model.toUpperCase() === 'ILCE-7' || model.toUpperCase() === 'ILCE-9' || model.toUpperCase() === 'ILCE-1');
      const effectiveModel = (needsAI && (!model || isGenericSony)) ? 'ANALYZING' : model;

      let parentId = rootFolderId;
      if (useSmartSort) {
          const validDate = dateTaken && !isNaN(new Date(dateTaken).getTime()) ? new Date(dateTaken) : new Date();
          const dateStr = validDate.toISOString().split('T')[0];
          const friendlyCamera = getFriendlyCameraName(make, effectiveModel);
          
          // Nested Hierarchy: Camera Model > Date
          const cameraFolderId = getOrCreateFolder(friendlyCamera, rootFolderId, `ROOT|${friendlyCamera}`, newItems, folderMap);
          parentId = getOrCreateFolder(dateStr, cameraFolderId, `ROOT|${friendlyCamera}|${dateStr}`, newItems, folderMap);
      }

      const newItem: FileSystemItem = {
        id,
        name: f.name,
        type: 'file',
        fileType: fType,
        size: f.size,
        parentId: parentId,
        dateAdded: Date.now(),
        dateTaken: dateTaken,
        previewUrl, 
        thumbnailUrl,
        rating: 0,
        flag: null,
        tags: [projectTag], 
        isAnalyzing: shouldAnalyze || needsAI,
        make,
        model: effectiveModel,
        syncStatus: 'uploading' // Start as uploading
      };

      newItems.push(newItem);
      upsertItem(newItem); // Initial persist

      // Queue for AI analysis if it's a video
      // CRITICAL: Always queue Sony videos for AI analysis to ensure accurate model identification (e.g. A7 IV vs A790)
      if (needsAI) {
          if (rawMetadata && rawMetadata.length > 50) {
              setVideoMetadataQueue(prev => [...prev, { id, rawMetadata: rawMetadata!, useSmartSort, rootFolderId }]);
          }
      }

      if (shouldAnalyze) {
        imagesToQueue.push({ file: f, id, previewBlob, retryCount: 0 });
      }

      // Define the upload task for this file
      uploadTasks.push(async () => {
          try {
              const { url, key } = await getPresignedUrl(f.name, f.type);
              await uploadFileToS3(f, url);
              
              let finalPreviewUrl = previewUrl;
              let finalThumbnailUrl = thumbnailUrl;
              
              // UPLOAD PREVIEW & THUMBNAIL BLOBS FOR PERSISTENCE
              if (previewBlob && (fType === 'raw' || f.size > 5 * 1024 * 1024)) {
                  try {
                      const previewName = `preview-${f.name}.jpg`;
                      const { url: pUrl, key: pKey } = await getPresignedUrl(previewName, 'image/jpeg');
                      await uploadFileToS3(previewBlob, pUrl);
                      finalPreviewUrl = getPublicUrl(pKey);
                      
                      if (thumbnailBlob) {
                          const thumbName = `thumb-${f.name}.jpg`;
                          const { url: tUrl, key: tKey } = await getPresignedUrl(thumbName, 'image/jpeg');
                          await uploadFileToS3(thumbnailBlob, tUrl);
                          finalThumbnailUrl = getPublicUrl(tKey);
                      }
                  } catch (pErr) {
                      console.warn(`Preview/Thumbnail upload failed for ${f.name}, falling back to local blobs`, pErr);
                  }
              }

              const videoDescription = fType === 'video' ? 'Generating proxy...' : undefined;

              setItems(prev => prev.map(i => i.id === id ? { 
                  ...i, 
                  syncStatus: 'synced', 
                  s3Key: key, 
                  previewUrl: finalPreviewUrl,
                  thumbnailUrl: finalThumbnailUrl,
                  description: videoDescription || i.description
              } : i));
              
              upsertItem({ 
                  ...newItem, 
                  syncStatus: 'synced', 
                  s3Key: key, 
                  previewUrl: finalPreviewUrl,
                  thumbnailUrl: finalThumbnailUrl,
                  description: videoDescription || newItem.description
              });
          } catch (error: any) {
              console.error(`Upload failed for ${f.name}`, error);
              const errorMsg = error.message || 'Unknown error';
              showToast(`Failed to upload ${f.name}: ${errorMsg}`, 'error');
              setItems(prev => prev.map(i => i.id === id ? { ...i, syncStatus: 'error', description: `Upload failed: ${errorMsg}` } : i));
              upsertItem({ ...newItem, syncStatus: 'error', description: `Upload failed: ${errorMsg}` });
          }
      });
    }

    // Execute uploads with concurrency limit
    const runUploads = async () => {
        const limit = 3;
        const running: Promise<any>[] = [];
        for (const task of uploadTasks) {
            const p = task().then(() => {
                running.splice(running.indexOf(p), 1);
            });
            running.push(p);
            if (running.length >= limit) {
                await Promise.race(running);
            }
        }
        await Promise.all(running);
    };

    runUploads();

    // 2. AUTO-STACKING (Burst Detection)
    newItems.sort((a, b) => (a.dateTaken || 0) - (b.dateTaken || 0));
    const BURST_THRESHOLD = 1000; 

    for (let i = 0; i < newItems.length; i++) {
        const current = newItems[i];
        if (current.type !== 'file' || current.fileType !== 'image') continue;

        const burstIds = [current.id];
        let j = i + 1;
        while(j < newItems.length) {
            const next = newItems[j];
            if (next.type === 'file' && next.fileType === 'image' && 
                next.parentId === current.parentId && 
                (next.dateTaken || 0) - (current.dateTaken || 0) < BURST_THRESHOLD) {
                
                burstIds.push(next.id);
                j++;
            } else {
                break;
            }
        }

        if (burstIds.length > 1) {
            const groupId = Math.random().toString(36).substr(2, 9);
            burstIds.forEach((bId, index) => {
                const item = newItems.find(x => x.id === bId);
                if (item) {
                    item.groupId = groupId;
                    item.isStackTop = index === 0;
                }
            });
            i = j - 1;
        }
    }

    setItems(prev => [...prev, ...newItems]);
    if (imagesToQueue.length > 0) {
        setAnalysisQueue(prev => [...prev, ...imagesToQueue]);
    }
  };

  const addGeneratedFile = async (file: File, parentId: string | null, tags: string[]) => {
      // 0. STRICT QUOTA CHECK
      const currentLimit = PLAN_LIMITS[user.plan] || PLAN_LIMITS['Free'];
      if (storage.usedBytes + file.size > currentLimit) {
          const gbLimit = (currentLimit / (1024 * 1024 * 1024)).toFixed(0);
          throw new Error(`Exceeds ${user.plan} quota (${gbLimit}GB). Upgrade to save.`);
      }

      const id = Math.random().toString(36).substr(2, 9);
      const previewUrl = URL.createObjectURL(file);
      
      setFileCache(prev => new Map(prev).set(id, file));
      try { await saveFileToDB(id, file); } catch(e) { console.error(e); }

      const newItem: FileSystemItem = {
        id,
        name: file.name,
        type: 'file',
        fileType: 'image',
        size: file.size,
        parentId: parentId,
        dateAdded: Date.now(),
        dateTaken: Date.now(),
        previewUrl,
        rating: 0,
        flag: null,
        tags: [...tags, 'AI Edited'],
        isAnalyzing: false, 
        width: 1024,
        height: 1024,
        syncStatus: 'synced'
      };
      
      setItems(prev => [...prev, newItem]);
      upsertItem(newItem);

      addToHistory({
          description: `Generate ${newItem.name}`,
          undo: () => {
              setItems(prev => prev.filter(i => i.id !== id));
              deleteItemFromSupabase(id);
          },
          redo: () => {
              setItems(prev => [...prev, newItem]);
              upsertItem(newItem);
          }
      });
  };

  const renameItem = (id: string, newName: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const oldName = item.name;

    setItems(prev => prev.map(item => item.id === id ? { ...item, name: newName } : item));
    upsertItem({ ...item, name: newName });

    setRecentActivity(prev => prev.map(a => a.projectId === id ? { ...a, projectName: newName } : a));

    addToHistory({
        description: `Rename ${oldName} to ${newName}`,
        undo: () => {
            setItems(prev => prev.map(item => item.id === id ? { ...item, name: oldName } : item));
            upsertItem({ ...item, name: oldName });
        },
        redo: () => {
            setItems(prev => prev.map(item => item.id === id ? { ...item, name: newName } : item));
            upsertItem({ ...item, name: newName });
        }
    });
  };

  const updateItemMetadata = (id: string, updates: Partial<FileSystemItem>) => {
    bulkUpdateMetadata([id], updates);
  };

  const deleteItem = (id: string) => {
    bulkDeleteItems([id]);
  };

  const bulkDeleteItems = async (ids: string[]) => {
    const allIdsToDelete = new Set(ids);
    const itemsToDelete: FileSystemItem[] = [];

    const gatherChildren = (parentId: string) => {
        const children = items.filter(c => c.parentId === parentId);
        children.forEach(c => {
            allIdsToDelete.add(c.id);
            if(c.type === 'folder') gatherChildren(c.id);
        });
    }

    ids.forEach(id => {
        const item = items.find(i => i.id === id);
        if(item && item.type === 'folder') {
            gatherChildren(id);
        }
    });

    allIdsToDelete.forEach(id => {
        const item = items.find(i => i.id === id);
        if (item) itemsToDelete.push(item);
    });

    if (itemsToDelete.length === 0) return;

    const performDelete = async () => {
        for (const id of allIdsToDelete) {
            try { 
                await deleteFileFromDB(id); // Local Blob
                await deleteItemFromSupabase(id); // Supabase Metadata
            } catch (e) {
                // Ignore deletion errors
            }
        }
        setItems(prev => prev.filter(i => !allIdsToDelete.has(i.id)));
        setRecentActivity(prev => prev.filter(a => !allIdsToDelete.has(a.projectId)));
    };
    
    performDelete();
    
    addToHistory({
        description: `Delete ${itemsToDelete.length} items`,
        undo: () => {
            setItems(prev => [...prev, ...itemsToDelete]);
            itemsToDelete.forEach(i => upsertItem(i)); // Restore to Supabase
        },
        redo: () => {
            setItems(prev => prev.filter(i => !allIdsToDelete.has(i.id)));
            allIdsToDelete.forEach(id => deleteItemFromSupabase(id));
        }
    });
  };

  const bulkUpdateMetadata = (ids: string[], updates: Partial<FileSystemItem>) => {
      const targetIds = new Set(ids);
      const originalItems = items.filter(i => targetIds.has(i.id));
      
      setItems(prev => prev.map(i => {
          if (targetIds.has(i.id)) {
              const updated = { ...i, ...updates };
              upsertItem(updated); // Persist
              return updated;
          }
          return i;
      }));
      
      addToHistory({
          description: `Update ${ids.length} items`,
          undo: () => {
               setItems(prev => prev.map(i => {
                   const original = originalItems.find(o => o.id === i.id);
                   if (original) {
                       upsertItem(original); // Revert persist
                       return original;
                   }
                   return i;
               }));
          },
          redo: () => {
               setItems(prev => prev.map(i => {
                   if (targetIds.has(i.id)) {
                       const updated = { ...i, ...updates };
                       upsertItem(updated);
                       return updated;
                   }
                   return i;
               }));
          }
      });
  };

  const bulkAddTags = (ids: string[], tag: string) => {
      const targetIds = new Set(ids);
      
      setItems(prev => prev.map(i => {
          if (targetIds.has(i.id)) {
              const newTags = Array.from(new Set([...(i.tags || []), tag]));
              const updated = { ...i, tags: newTags };
              upsertItem(updated); // Persist
              return updated;
          }
          return i;
      }));
      
      addToHistory({
          description: `Tag ${ids.length} items with '${tag}'`,
          undo: () => {
              setItems(prev => prev.map(i => {
                  if (targetIds.has(i.id) && i.tags) {
                      const updated = { ...i, tags: i.tags.filter(t => t !== tag) };
                      upsertItem(updated);
                      return updated;
                  }
                  return i;
              }));
          },
          redo: () => {
               setItems(prev => prev.map(i => {
                  if (targetIds.has(i.id)) {
                      const newTags = Array.from(new Set([...(i.tags || []), tag]));
                      const updated = { ...i, tags: newTags };
                      upsertItem(updated);
                      return updated;
                  }
                  return i;
              }));
          }
      });
  };
  const retryUpload = async (id: string) => {
      const item = items.find(i => i.id === id);
      if (!item) return;

      const file = fileCache.get(id);
      if (!file) {
          showToast("Original file is no longer in memory. Please delete this item and select the file again.", "error");
          return;
      }

      // Mark as uploading
      setItems(prev => prev.map(i => i.id === id ? { ...i, syncStatus: 'uploading', description: 'Retrying upload...' } : i));

      try {
          // Re-attempt S3 upload
          const { url, key } = await getPresignedUrl(file.name, file.type);
          await uploadFileToS3(file, url);
          
          const finalUpdates: Partial<FileSystemItem> = {
              s3Key: key,
              syncStatus: 'synced',
              description: item.fileType === 'video' ? 'Generating proxy...' : ''
          };
          setItems(prev => prev.map(i => i.id === id ? { ...i, ...finalUpdates } : i));
          upsertItem({ ...item, ...finalUpdates });
          showToast("Upload retry successful!", "success");
      } catch (error) {
          console.error("Retry failed:", error);
          setItems(prev => prev.map(i => i.id === id ? { ...i, syncStatus: 'error', description: 'Upload failed.' } : i));
          upsertItem({ ...item, syncStatus: 'error', description: 'Upload failed.' });
      }
  };

  const executeOrganizationPlan = (plan: FolderPlan[], targetParentId: string | null = null) => {
      const newItems = [...items];
      
      const processPlan = (plans: FolderPlan[], parentId: string | null) => {
          plans.forEach(p => {
              const folderId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
              newItems.push({
                  id: folderId,
                  name: p.folderName,
                  type: 'folder',
                  parentId: parentId,
                  size: 0,
                  dateAdded: Date.now(),
                  syncStatus: 'synced'
              });
              upsertItem(newItems[newItems.length - 1]); // Persist Folder
              
              p.fileIds.forEach(fid => {
                  const idx = newItems.findIndex(x => x.id === fid);
                  if (idx !== -1) {
                      newItems[idx] = { ...newItems[idx], parentId: folderId };
                      upsertItem(newItems[idx]); // Persist File Move
                  }
              });
              
              if (p.subfolders) {
                  processPlan(p.subfolders, folderId);
              }
          });
      };
      
      processPlan(plan, targetParentId);
      setItems(newItems);
  };

  const setViewState = (updates: Partial<ViewState>) => {
      setViewStateLocal(prev => ({ ...prev, ...updates }));
  };

  const resetFilters = () => {
      setViewStateLocal({
          searchQuery: '',
          filterRating: 0,
          filterFlag: 'all',
          isStackingEnabled: true
      });
  };

  return (
    <AppContext.Provider value={{
      user,
      isAuthenticated,
      storage,
      items,
      recentActivity,
      viewState,
      currentFolderId,
      setCurrentFolderId,
      login,
      logout,
      updateUser,
      uploadFiles,
      createFolder,
      addGeneratedFile,
      renameItem,
      deleteItem,
      updateItemMetadata,
      executeOrganizationPlan,
      analyzeVideoItem,
      setViewState,
      resetFilters,
      bulkDeleteItems,
      bulkUpdateMetadata,
      bulkAddTags,
      undo,
      redo,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      historyDescription: past.length > 0 ? past[past.length - 1].description : undefined,
      formatSize,
      getStoragePercentage,
      getFileObject,
      retryUpload,
      queueStatus,
      syncQueue
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
