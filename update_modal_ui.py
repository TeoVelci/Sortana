import sys

with open('ExportModal.tsx', 'r') as f:
    content = f.read()

# Add handleDownloadChunk
handle_download = """  const handleDownloadChunk = async (chunk: ExportChunk) => {
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
          
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Sortana_Export_${Date.now()}_Part${chunk.index}.zip`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          // Cleanup memory
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast(`Part ${chunk.index} downloaded!`, "success");
      } catch (e) {
          console.error(e);
          showToast(`Failed to download Part ${chunk.index}`, "error");
      } finally {
          setLoadingChunkIndex(null);
          setProgress(0);
      }
  };

  const handleExport = async () => {"""

content = content.replace("  const handleExport = async () => {", handle_download)

# Add exportChunks UI
new_ui = """            {/* Footer */}
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
                ) : readyFiles ? ("""

content = content.replace('            {/* Footer */}\n            <div className="p-6 border-t border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800">\n                {readyFiles ? (', new_ui)

with open('ExportModal.tsx', 'w') as f:
    f.write(content)

print("Updated ExportModal.tsx UI")

