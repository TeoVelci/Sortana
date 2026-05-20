import sys

with open('ExportModal.tsx', 'r') as f:
    content = f.read()

# Add readyChunks state
old_state = "const [exportChunks, setExportChunks] = useState<ExportChunk[] | null>(null);"
new_state = """const [exportChunks, setExportChunks] = useState<ExportChunk[] | null>(null);
  const [readyChunks, setReadyChunks] = useState<Record<number, {file: File, url: string}>>({});"""
content = content.replace(old_state, new_state)

# Replace handleDownloadChunk
old_handle_download_chunk = """  const handleDownloadChunk = async (chunk: ExportChunk) => {
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
          
                    // Consume the stream manually to bypass WebKit response.blob() deadlock bug
          const reader = response.body!.getReader();
          const blobChunks: Uint8Array[] = [];
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) blobChunks.push(value);
          }
          const blob = new Blob(blobChunks, { type: 'application/zip' });
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
  };"""

new_handle_download_chunk = """  const handleDownloadChunk = async (chunk: ExportChunk) => {
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
  };"""

content = content.replace(old_handle_download_chunk, new_handle_download_chunk)

# Replace chunks.length === 1 auto-download
old_single_chunk = """                  const blob = new Blob(blobChunks, { type: 'application/zip' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Sortana_Export_${Date.now()}.zip`;
                  a.target = '_blank';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  
                  // Cleanup memory after a short delay
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  
                  showToast("Export complete!", "success");
                  onClose();
                  return;"""

new_single_chunk = """                  const blob = new Blob(blobChunks, { type: 'application/zip' });
                  const fileName = `Sortana_Export_${Date.now()}.zip`;
                  const file = new File([blob], fileName, { type: 'application/zip' });
                  const url = URL.createObjectURL(blob);
                  
                  setReadyFiles([{ file, url }]);
                  setStatusText("Ready to save!");
                  return;"""

content = content.replace(old_single_chunk, new_single_chunk)

with open('ExportModal.tsx', 'w') as f:
    f.write(content)
