
import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { useApp } from './AppContext';
import { useToast } from './ToastContext';
import { Link, useNavigate } from 'react-router-dom';
import AutoOrganizeModal from './AutoOrganizeModal';

const Dashboard: React.FC = () => {
  const { uploadFiles, storage, recentActivity, getStoragePercentage, formatSize, user } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [projectTag, setProjectTag] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'complete'>('idle');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Smart Sort Toggle (Default: True for everyone)
  const [useSmartSort, setUseSmartSort] = useState(true);

  // Auto Organize Modal State
  const [isAutoOrganizeOpen, setIsAutoOrganizeOpen] = useState(false);

  // File Handling Helpers
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const fileArray = Array.from(fileList);
    setFilesToUpload(prev => [...prev, ...fileArray]);
    if (fileArray.length > 0) {
        showToast(`${fileArray.length} files added to queue`, 'info');
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const startUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (filesToUpload.length === 0 || !projectTag) {
      showToast('Please select files and enter a project tag.', 'error');
      return;
    }

    setUploadStatus('uploading');
    
    // Simulate Upload Progress
    let p = 0;
    const interval = setInterval(() => {
      p += 10;
      if (p >= 100) {
        clearInterval(interval);
      }
      setProgress(p);
    }, 200);

    // Wait for simulation, then attempt upload
    setTimeout(async () => {
      try {
          await uploadFiles(filesToUpload, projectTag, useSmartSort);
          setUploadStatus('complete');
          setFilesToUpload([]);
          setProjectTag('');
          showToast(useSmartSort ? 'Files uploaded & smartly organized!' : 'Files uploaded successfully!', 'success');
          
          // Auto-redirect to browse after short delay (optional UX choice)
          // setTimeout(() => navigate('/browse'), 1500); 
      } catch (error: any) {
          setUploadStatus('idle'); // Reset status on failure
          showToast(error.message || "Upload failed. Storage limit reached?", 'error');
      }
    }, 2000);
  };

  const storagePercent = getStoragePercentage();

  return (
    <div className="flex flex-col h-auto lg:h-full">
      {/* --- Auto Organize Modal --- */}
      <AutoOrganizeModal isOpen={isAutoOrganizeOpen} onClose={() => setIsAutoOrganizeOpen(false)} />

      <form onSubmit={startUpload} className="grid grid-cols-12 gap-6 h-auto lg:h-full lg:grid-rows-[auto_1fr]">
        
        {/* Left Column (Upload) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          <div 
            id="upload-zone"
            className={`flex-1 min-h-[300px] md:min-h-[400px] relative rounded-2xl bg-gray-100 dark:bg-surface-dark border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center p-6 md:p-10 cursor-pointer group ${isDragOver ? 'bg-indigo-50 dark:bg-surface-dark border-primary' : 'border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20'}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={triggerFileInput}
          >
            <div className="w-16 h-16 mb-6 text-gray-400 group-hover:text-primary transition-colors">
              <i className="fa-solid fa-arrow-up-from-bracket text-6xl text-gray-300 dark:text-zinc-700 group-hover:dark:text-primary transition-colors"></i>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Drag & Drop Media Here</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">or click to browse photos & videos up to 10GB</p>

            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              className="hidden" 
              onChange={onFileInputChange}
            />

            {/* File List */}
            {filesToUpload.length > 0 && (
              <div className="w-full max-w-md mt-4 z-10" onClick={(e) => e.stopPropagation()}>
                <div className="bg-white dark:bg-dark-900/80 rounded-lg p-4 border border-gray-200 dark:border-white/10 max-h-48 overflow-y-auto text-left shadow-lg">
                  <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Selected Files ({filesToUpload.length})</h4>
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                    {filesToUpload.map((f, idx) => (
                      <li key={idx} className="flex justify-between items-center bg-gray-100 dark:bg-dark-800/50 p-2 rounded">
                        <span className="truncate">{f.name}</span>
                        <span className="text-xs text-gray-500 ml-2">{formatSize(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
            <div>
              <label htmlFor="project-tag" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Name / Tag</label>
              <input 
                id="project-tag" 
                value={projectTag}
                onChange={(e) => setProjectTag(e.target.value)}
                required={filesToUpload.length > 0}
                className="w-full border border-gray-300 dark:border-white/10 text-gray-900 dark:text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none placeholder-gray-400 transition-all bg-gray-50 dark:bg-background-dark" 
                placeholder="e.g., Client Name, Event, Date" 
                type="text"
              />
            </div>

            {/* Smart Sort Toggle */}
            <div id="smart-sort-toggle" className="flex items-center justify-between bg-gray-50 dark:bg-dark-900/50 p-3 rounded-lg border border-gray-200 dark:border-white/5">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${useSmartSort ? 'bg-brand-purple text-white' : 'bg-gray-200 dark:bg-dark-700 text-gray-500'}`}>
                        <i className={`fa-solid ${useSmartSort ? 'fa-wand-magic-sparkles' : 'fa-folder'}`}></i>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">Smart Ingest</p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {useSmartSort ? 'Auto-sort by Camera & Date' : 'Upload to single folder'}
                        </p>
                    </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={useSmartSort}
                        onChange={(e) => setUseSmartSort(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-dark-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-white/10 peer-checked:bg-primary"></div>
                </label>
            </div>

            <button 
              type="submit" 
              disabled={uploadStatus === 'uploading' || (uploadStatus === 'idle' && filesToUpload.length === 0)}
              className="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadStatus === 'uploading' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
              <span>{uploadStatus === 'complete' ? 'Upload Complete!' : useSmartSort ? 'Smart Upload & Organize' : 'Upload Files'}</span>
            </button>
          </div>
        </div>

        {/* Right Column (Status) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          
          {/* --- Auto-Organize Card --- */}
          <div 
             id="auto-organize-card"
             onClick={() => setIsAutoOrganizeOpen(true)}
             className="cursor-pointer bg-gradient-to-br from-indigo-900 to-zinc-900 rounded-xl shadow-lg p-6 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200 border border-white/10"
          >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <i className="fa-solid fa-wand-magic-sparkles text-8xl text-white"></i>
              </div>
              <div className="relative z-10 text-white">
                  <div className="flex items-center gap-2 mb-2">
                       <i className="fa-solid fa-wand-magic-sparkles"></i>
                       <span className="text-xs font-bold uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded-full border border-white/10">AI Feature</span>
                  </div>
                  <h3 className="text-xl font-bold mb-1">Auto-Organize Library</h3>
                  <p className="text-gray-400 text-sm">Sort loose files into event folders instantly.</p>
              </div>
          </div>

          {/* Active Tasks Panel */}
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl shadow-sm p-8 h-48">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Active Tasks</h3>
            
            {uploadStatus === 'idle' && (
              <div className="text-gray-500 text-sm text-center py-4">No active uploads.</div>
            )}

            {uploadStatus !== 'idle' && (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2 items-center">
                    <div className="flex gap-1">
                      <span className="text-gray-900 dark:text-white font-bold">Status:</span> 
                      <span className="text-gray-500 dark:text-gray-400">{uploadStatus === 'complete' ? 'Done' : 'Uploading...'}</span>
                    </div>
                    <span className="text-gray-500 text-xs">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-dark-700 rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:flex-1">
            
            {/* Recent Activity */}
            <div id="recent-activity-card" className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl flex flex-col shadow-sm p-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
              <div className="space-y-4 flex-1 overflow-y-auto max-h-[150px]">
                {recentActivity.map((activity) => (
                  <Link key={activity.id} to="/browse" className="flex gap-3 hover:bg-gray-100 dark:hover:bg-white/5 p-2 rounded transition-colors group">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-dark-700 rounded-full flex items-center justify-center shrink-0 text-gray-400 group-hover:text-primary border border-transparent dark:border-white/5">
                      <i className="fa-regular fa-folder-open"></i>
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{activity.projectName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">View Project</p>
                    </div>
                  </Link>
                ))}
                {recentActivity.length === 0 && <p className="text-xs text-gray-500">No recent activity.</p>}
              </div>
            </div>

            {/* Storage Card */}
            <div id="storage-card" className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden p-8">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Storage Usage</h3>
                <div className="text-4xl lg:text-5xl font-bold text-primary mb-2">{Math.round(storagePercent)}%</div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatSize(storage.usedBytes)} / {formatSize(storage.limitBytes)}</p>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-white/10">
                <div className="w-full bg-gray-200 dark:bg-dark-700 rounded-full h-2.5 mb-1">
                  <div className="bg-primary h-2.5 rounded-full" style={{ width: `${storagePercent}%` }}></div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-right">Plan Limit</p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default Dashboard;
