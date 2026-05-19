
import React, { useState, useEffect } from 'react';
import { useApp, FileSystemItem } from './AppContext';
import { useTour } from './TourContext';
import { generateStreamingZip, calculateExportChunks, generateCloudExportPayload, ExportChunk, ExportOptions } from './exportService';
import { useToast } from './ToastContext';
import { getPublicUrl } from './storageService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: FileSystemItem[];
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, selectedItems }) => {
  const { items, user } = useApp(); // Need all items for folder structure
  const { showToast } = useToast();
  const { startTour } = useTour();

  // Feature Gating Logic
  const isProOrAbove = ['Pro', 'Studio'].includes(user.plan);
  const isStudio = user.plan === 'Studio';

  // Determine what we are exporting
  const effectiveItems = selectedItems.length > 0 
    ? selectedItems 
    : items.filter(i => i.type === 'file'); 

  // State
  const [format, setFormat] = useState<'original' | 'jpg' | 'png'>('original');
  const [pattern, setPattern] = useState<'original' | 'sequence'>('original');
  const [baseName, setBaseName] = useState('My_Project');
  const [structure, setStructure] = useState<'preserve' | 'flat'>('preserve');
  const [includeXmp, setIncludeXmp] = useState(false);
  
  // Watermark State
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState('© Sortana User');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.8);
  const [watermarkPos, setWatermarkPos] = useState<'bottom-right' | 'bottom-left' | 'center'>('bottom-right');

  // Progress
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [readyFiles, setReadyFiles] = useState<{file: File, url: string}[] | null>(null);
  const [exportChunks, setExportChunks] = useState<ExportChunk[] | null>(null);
  const [readyChunks, setReadyChunks] = useState<Record<number, {file: File, url: string}>>({});
  const [loadingChunkIndex, setLoadingChunkIndex] = useState<number | null>(null);
  const supportsDirectToDisk = 'showSaveFilePicker' in window;

  // Cleanup object URLs when modal unmounts or readyFiles changes
  useEffect(() => {
      if (!isOpen) setReadyFiles(null);
      return () => {
          if (readyFiles) {
              readyFiles.forEach(f => URL.revokeObjectURL(f.url));
          }
      };
  }, [readyFiles, isOpen]);

  // Enforce restrictions when plan changes (via debug tool) or on load
  useEffect(() => {
    if (!isProOrAbove) {
        setFormat('original');
        setPattern('original');
        setIncludeXmp(false);
    }
    if (!isStudio) {
        setWatermarkEnabled(false);
    }
  }, [user.plan, isProOrAbove, isStudio]);

  // Tour Auto-Trigger
  useEffect(() => {
      if (isOpen) {
          const timer = setTimeout(() => {
              try {
                  const status = JSON.parse(localStorage.getItem('sortana_tours') || '{}');
                  if (!status.export) {
                      startTour('export');
                  }
              } catch {}
          }, 500); // Wait for modal animation to complete
          return () => clearTimeout(timer);
      }
  }, [isOpen, startTour]);

  // Count files recursively (if folders selected)
  const getFilesToExport = () => {
      const files: FileSystemItem[] = [];
      const traverse = (itemList: FileSystemItem[]) => {
          itemList.forEach(item => {
              if (item.type === 'file') files.push(item);
              if (item.type === 'folder') {
                  const children = items.filter(c => (c.parentId || null) === (item.id || null));
                  traverse(children);
              }
          });
      };
      traverse(selectedItems.length > 0 ? selectedItems : items.filter(i => !i.parentId && i.type === 'file'));
      return files;
  };

  const handleDownloadChunk = async (chunk: ExportChunk) => {
      // Clear previously generated chunk to ensure WebKit stays within 400MB memory limit
      setReadyChunks(prev => {
          Object.values(prev).forEach(r => URL.revokeObjectURL(r.url));
          return {};
      });

      setLoadingChunkIndex(chunk.index);
      setProgress(0);
      setStatusText(`Preparing Part ${chunk.index}...`);

      const options: ExportOptions = {
          fileNamePattern: pattern,
          baseName: baseName,
          format: format,
          structure: structure,
          includeXmp: includeXmp,
          watermark: {
              enabled: watermarkEnabled,
              text: watermarkText,
              opacity: watermarkOpacity,
              position: watermarkPos
          }
      };

      try {
          const response = await generateStreamingZip(chunk.files, items, options, (p, name) => {
              setProgress(p);
              setStatusText(p === 100 ? "Zipping..." : `Processing: ${name}`);
          });
          
          const reader = response.body!.getReader();
          const blobChunks: Uint8Array[] = [];
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) blobChunks.push(value);
          }
          const blob = new Blob(blobChunks, { type: 'application/zip' });
          const fileName = `Sortana_Export_${Date.now()}_Part${chunk.index}.zip`;
          const file = new File([blob], fileName, { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          
          setReadyChunks({ [chunk.index]: { file, url } });
      } catch (e) {
          console.error(e);
          showToast(`Failed to generate Part ${chunk.index}`, "error");
      } finally {
          setLoadingChunkIndex(null);
          setProgress(0);
      }
  };

  const handleSaveChunk = async (chunkIndex: number) => {
      const ready = readyChunks[chunkIndex];
      if (!ready) return;

      if (navigator.canShare && navigator.canShare({ files: [ready.file] })) {
          try {
              await navigator.share({
                  files: [ready.file],
                  title: ready.file.name,
              });
          } catch (err: any) {
              if (err.name !== 'AbortError') {
                  const a = document.createElement('a');
                  a.href = ready.url;
                  a.download = ready.file.name;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
              }
          }
      } else {
          const a = document.createElement('a');
          a.href = ready.url;
          a.download = ready.file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }
      showToast(`Part ${chunkIndex} saved!`, "success");
  };

  const handleExport = async () => {
      const files = getFilesToExport();
      if (files.length === 0) {
          showToast("No files to export", "error");
          return;
      }

      setIsExporting(true);
      setProgress(0);

      const options: ExportOptions = {
          fileNamePattern: pattern,
          baseName: baseName,
          format: format,
          structure: structure,
          includeXmp: includeXmp,
          watermark: {
              enabled: watermarkEnabled,
              text: watermarkText,
              opacity: watermarkOpacity,
              position: watermarkPos
          }
      };

      try {
          if (supportsDirectToDisk) {
              const response = await generateStreamingZip(files, items, options, (p, name) => {
                  setProgress(p);
                  setStatusText(p === 100 ? "Zipping..." : `Processing: ${name}`);
              });
              
              try {
                  const fileHandle = await (window as any).showSaveFilePicker({
                      suggestedName: `Sortana_Export_${Date.now()}.zip`,
                      types: [{
                          description: 'ZIP Archive',
                          accept: { 'application/zip': ['.zip'] },
                      }],
                  });
                  const writable = await fileHandle.createWritable();
                  setStatusText("Saving to disk...");
                  await response.body!.pipeTo(writable);
                  showToast("Export complete!", "success");
              } catch (err: any) {
                  if (err.name !== 'AbortError') {
                      console.error("Save to disk failed:", err);
                      throw err;
                  }
              }
          } else {
              // Safari / Mobile Fallback

              const isRaw = files.some(f => f.fileType === 'raw');
              const needsConversion = options.format !== 'original';
              const needsWatermark = options.watermark.enabled;

              // If processing is required, we must fallback to the legacy memory chunking
              if (needsConversion || needsWatermark) {
                  const chunks = calculateExportChunks(files);
                  
                  if (chunks.length === 1) {
                      const response = await generateStreamingZip(files, items, options, (p, name) => {
                          setProgress(p);
                          setStatusText(p === 100 ? "Zipping..." : `Processing: ${name}`);
                      });
                      
                      const reader = response.body!.getReader();
                      const blobChunks: Uint8Array[] = [];
                      while (true) {
                          const { done, value } = await reader.read();
                          if (done) break;
                          if (value) blobChunks.push(value);
                      }
                      const blob = new Blob(blobChunks, { type: 'application/zip' });
                      const url = URL.createObjectURL(blob);
                      
                      setReadyFiles([{ file: new File([blob], `Sortana_Export_${Date.now()}.zip`, { type: 'application/zip' }), url }]);
                      setStatusText("Ready to save!");
                      return;
                  } else {
                      setExportChunks(chunks);
                      setStatusText("Ready to save!");
                      return;
                  }
              }

              // Cloud-Streaming ZIP Pipeline (No local processing needed)
              setStatusText("Starting cloud export...");
              const exportFiles = generateCloudExportPayload(files, items, options);
              
              const form = document.createElement('form');
              form.method = 'POST';
              form.action = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-zip`;
              
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = 'payload';
              input.value = JSON.stringify({ 
                  files: exportFiles, 
                  zipName: `Sortana_Export_${Date.now()}.zip` 
              });
              
              form.appendChild(input);
              document.body.appendChild(form);
              form.submit();
              document.body.removeChild(form);
              
              showToast("Download started", "success");
              onClose();
              return;
          }
          onClose();
      } catch (e) {
          console.error(e);
          showToast("Export failed.", "error");
      } finally {
          setIsExporting(false);
          setProgress(0);
      }
  };

  if (!isOpen) return null;

  const filesToExport = getFilesToExport();
  const filesCount = filesToExport.length;
  const hasRawFiles = filesToExport.some(f => f.fileType === 'raw');
  const showRawWatermarkWarning = watermarkEnabled && format === 'original' && hasRawFiles;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={!isExporting ? onClose : undefined}></div>
        
        <div className="relative bg-white dark:bg-dark-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-5 duration-300 border border-gray-200 dark:border-dark-700">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <i className="fa-solid fa-file-export text-primary"></i>
                        Smart Export
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Exporting {filesCount} files</p>
                </div>
                {!isExporting && (
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                
                {/* 1. File Settings */}
                <section id="export-file-settings" className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-200 dark:border-dark-700 pb-2">File Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Naming Pattern (Restricted) */}
                        <div className={`transition-opacity ${!isProOrAbove ? 'opacity-50 relative' : ''}`}>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex justify-between">
                                <span>Naming Pattern</span>
                                {!isProOrAbove && <span className="text-brand-purple font-bold"><i className="fa-solid fa-lock mr-1"></i>PRO</span>}
                            </label>
                            <select 
                                value={pattern} 
                                onChange={(e) => setPattern(e.target.value as any)}
                                disabled={!isProOrAbove}
                                className="w-full bg-gray-100 dark:bg-dark-800 border-none rounded-lg text-sm px-3 py-2.5 focus:ring-1 focus:ring-primary disabled:cursor-not-allowed"
                            >
                                <option value="original">Keep Original Filenames</option>
                                <option value="sequence">Sequential (Name_001)</option>
                            </select>
                        </div>

                        {pattern === 'sequence' && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Base Name</label>
                                <input 
                                    type="text" 
                                    value={baseName}
                                    onChange={(e) => setBaseName(e.target.value)}
                                    className="w-full bg-gray-100 dark:bg-dark-800 border-none rounded-lg text-sm px-3 py-2.5 focus:ring-1 focus:ring-primary"
                                    placeholder="Project_Name"
                                />
                            </div>
                        )}

                        {/* Format Conversion (Restricted) */}
                        <div className={`transition-opacity ${!isProOrAbove ? 'opacity-50 relative' : ''}`}>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 flex justify-between">
                                <span>Format Conversion</span>
                                {!isProOrAbove && <span className="text-brand-purple font-bold"><i className="fa-solid fa-lock mr-1"></i>PRO</span>}
                            </label>
                            <select 
                                value={format} 
                                onChange={(e) => setFormat(e.target.value as any)}
                                disabled={!isProOrAbove}
                                className="w-full bg-gray-100 dark:bg-dark-800 border-none rounded-lg text-sm px-3 py-2.5 focus:ring-1 focus:ring-primary disabled:cursor-not-allowed"
                            >
                                <option value="original">Original Format</option>
                                <option value="jpg">Convert to JPEG</option>
                                <option value="png">Convert to PNG</option>
                            </select>
                        </div>

                        {/* Folder Structure (Allowed for All) */}
                        <div id="export-folder-structure">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Folder Structure</label>
                            <div className="flex bg-gray-100 dark:bg-dark-800 rounded-lg p-1">
                                <button 
                                    onClick={() => setStructure('preserve')}
                                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${structure === 'preserve' ? 'bg-white dark:bg-dark-600 shadow text-primary' : 'text-gray-500'}`}
                                >
                                    Preserve
                                </button>
                                <button 
                                    onClick={() => setStructure('flat')}
                                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${structure === 'flat' ? 'bg-white dark:bg-dark-600 shadow text-primary' : 'text-gray-500'}`}
                                >
                                    Flatten
                                </button>
                            </div>
                        </div>


                    </div>
                </section>

                {/* 2. Metadata Settings */}
                <section className={`space-y-4 transition-all duration-300 ${!isProOrAbove ? 'opacity-50 relative' : ''}`}>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-200 dark:border-dark-700 pb-2">Metadata</h3>
                    <div className="flex justify-between items-center bg-gray-50 dark:bg-dark-800/50 p-3 rounded-xl border border-gray-100 dark:border-dark-700">
                        <div>
                            <label className="block text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                Generate XMP Sidecars
                                {!isProOrAbove && <span className="text-brand-purple font-bold text-[10px] bg-brand-purple/10 px-1.5 py-0.5 rounded border border-brand-purple/20 flex items-center gap-1"><i className="fa-solid fa-lock text-[8px]"></i> PRO</span>}
                            </label>
                            <p className="text-xs text-gray-500">Preserve ratings (★), flags, and tags for Lightroom & Capture One.</p>
                        </div>
                        <label className={`relative inline-flex items-center ${isProOrAbove ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                            <input 
                                type="checkbox" 
                                checked={includeXmp} 
                                onChange={(e) => setIncludeXmp(e.target.checked)} 
                                disabled={!isProOrAbove}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-dark-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-white/10 peer-checked:bg-primary"></div>
                        </label>
                    </div>
                </section>

                {/* 3. Watermark Settings (Restricted) */}
                <section id="export-watermark" className={`space-y-4 transition-all duration-300 ${!isStudio ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                    <div className="flex justify-between items-center border-b border-gray-200 dark:border-dark-700 pb-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Watermark</h3>
                            {!isStudio && (
                                <span className="bg-brand-purple/10 text-brand-purple text-[10px] font-bold px-2 py-0.5 rounded border border-brand-purple/20 flex items-center gap-1">
                                    <i className="fa-solid fa-lock"></i> STUDIO
                                </span>
                            )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={watermarkEnabled} 
                                onChange={(e) => setWatermarkEnabled(e.target.checked)} 
                                disabled={!isStudio}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-dark-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-white/10 peer-checked:bg-primary"></div>
                        </label>
                    </div>
                    
                    {showRawWatermarkWarning && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mt-3 flex items-start gap-3">
                            <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i>
                            <div className="text-xs text-amber-700 dark:text-amber-400">
                                <strong>RAW Format Selected:</strong> Watermarks will not appear on RAW photos. To apply watermarks to these files, please change the Format Conversion to JPEG.
                            </div>
                        </div>
                    )}

                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity duration-200 ${watermarkEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-50 pointer-events-none'}`}>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Watermark Text</label>
                            <input 
                                type="text" 
                                value={watermarkText}
                                onChange={(e) => setWatermarkText(e.target.value)}
                                className="w-full bg-gray-100 dark:bg-dark-800 border-none rounded-lg text-sm px-3 py-2.5 focus:ring-1 focus:ring-primary"
                                placeholder="© Your Name"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Opacity ({Math.round(watermarkOpacity * 100)}%)</label>
                            <input 
                                type="range" 
                                min="0.1" 
                                max="1" 
                                step="0.1"
                                value={watermarkOpacity}
                                onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-200 dark:bg-dark-800 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                        
                        {/* Position Grid */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Position</label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setWatermarkPos('bottom-left')}
                                    className={`px-4 py-2 rounded-lg border text-xs font-medium transition-colors ${watermarkPos === 'bottom-left' ? 'bg-primary/10 border-primary text-primary' : 'bg-gray-100 dark:bg-dark-800 border-transparent text-gray-500'}`}
                                >
                                    Bottom Left
                                </button>
                                <button 
                                    onClick={() => setWatermarkPos('center')}
                                    className={`px-4 py-2 rounded-lg border text-xs font-medium transition-colors ${watermarkPos === 'center' ? 'bg-primary/10 border-primary text-primary' : 'bg-gray-100 dark:bg-dark-800 border-transparent text-gray-500'}`}
                                >
                                    Center
                                </button>
                                <button 
                                    onClick={() => setWatermarkPos('bottom-right')}
                                    className={`px-4 py-2 rounded-lg border text-xs font-medium transition-colors ${watermarkPos === 'bottom-right' ? 'bg-primary/10 border-primary text-primary' : 'bg-gray-100 dark:bg-dark-800 border-transparent text-gray-500'}`}
                                >
                                    Bottom Right
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800">
                {exportChunks ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <i className="fa-solid fa-layer-group text-primary mr-2"></i>
                            Large Export: Split into {exportChunks.length} parts to save memory.
                        </div>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {exportChunks.map(chunk => (
                                <div key={chunk.index} className="flex justify-between items-center bg-white dark:bg-dark-900 border border-gray-200 dark:border-dark-700 p-3 rounded-xl shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Part {chunk.index}</span>
                                        <span className="text-xs text-gray-500">{chunk.files.length} files</span>
                                    </div>
                                    {loadingChunkIndex === chunk.index ? (
                                        <div className="w-32">
                                            <div className="flex justify-between text-[10px] font-medium text-gray-500 mb-1">
                                                <span className="truncate max-w-[80px]">{statusText}</span>
                                                <span>{progress}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleDownloadChunk(chunk)}
                                            disabled={loadingChunkIndex !== null}
                                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${loadingChunkIndex !== null ? 'bg-gray-200 text-gray-400 dark:bg-dark-800 dark:text-gray-600' : 'bg-brand-purple hover:bg-purple-600 text-white shadow-md active:scale-95'}`}
                                        >
                                            <i className="fa-solid fa-download mr-1.5"></i>
                                            Download
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-dark-700">
                            <button 
                                onClick={onClose}
                                className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-700 rounded-xl font-medium transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                ) : readyFiles ? (
                    <div className="flex justify-between items-center w-full animate-in fade-in zoom-in duration-300">
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            <i className="fa-solid fa-circle-check mr-2"></i>
                            Ready to save! ({readyFiles.length} {readyFiles.length === 1 ? 'file' : 'files'})
                        </span>
                        <button 
                            onClick={async () => {
                                for (const { file, url } of readyFiles) {
                                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                        try {
                                            await navigator.share({
                                                files: [file],
                                                title: file.name,
                                            });
                                        } catch (err: any) {
                                            if (err.name !== 'AbortError') {
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = file.name;
                                                document.body.appendChild(a);
                                                a.click();
                                            }
                                        }
                                    } else {
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = file.name;
                                        document.body.appendChild(a);
                                        a.click();
                                    }
                                }
                                showToast("Saved successfully!", "success");
                                onClose();
                                setReadyFiles(null);
                            }}
                            className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl shadow-lg shadow-green-500/20 font-bold transition-transform active:scale-95 flex items-center gap-2"
                        >
                            <i className="fa-solid fa-save"></i>
                            Save to Device
                        </button>
                    </div>
                ) : isExporting ? (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-300">
                            <span>{statusText}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={onClose}
                            className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-700 rounded-xl font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleExport}
                            className="px-6 py-2.5 bg-brand-purple hover:bg-purple-600 text-white rounded-xl shadow-lg shadow-brand-purple/20 font-bold transition-transform active:scale-95 flex items-center gap-2"
                        >
                            <i className="fa-solid fa-download"></i>
                            Export .ZIP
                        </button>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ExportModal;
