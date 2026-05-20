import sys

with open('ExportModal.tsx', 'r') as f:
    content = f.read()

# Replace imports
content = content.replace(
    "import { generateStreamingZip, generateChunkedZips, ExportOptions } from './exportService';",
    "import { generateStreamingZip, calculateExportChunks, ExportChunk, ExportOptions } from './exportService';"
)

# Replace state
content = content.replace(
    "const [readyFiles, setReadyFiles] = useState<{file: File, url: string}[] | null>(null);",
    "const [readyFiles, setReadyFiles] = useState<{file: File, url: string}[] | null>(null);\n  const [exportChunks, setExportChunks] = useState<ExportChunk[] | null>(null);\n  const [loadingChunkIndex, setLoadingChunkIndex] = useState<number | null>(null);"
)

# Replace Handle Export
old_export = """              const blobs = await generateChunkedZips(files, items, options, (p, name) => {
                  setProgress(p);
                  setStatusText(p === 100 ? "Zipping..." : `Processing: ${name}`);
              });

              const generatedFiles = blobs.map((blob, idx) => {
                  const fileName = blobs.length === 1 ? `Sortana_Export_${Date.now()}.zip` : `Sortana_Export_${Date.now()}_Part${idx + 1}.zip`;
                  const file = new File([blob], fileName, { type: 'application/zip' });
                  const url = URL.createObjectURL(blob);
                  return { file, url };
              });
              
              setReadyFiles(generatedFiles);
              setStatusText("Ready to save!");
              return; // Wait for user to click the Save button"""

new_export = """              const chunks = calculateExportChunks(files);
              
              if (chunks.length === 1) {
                  // If it's a single chunk, just generate and download it directly
                  const response = await generateStreamingZip(files, items, options, (p, name) => {
                      setProgress(p);
                      setStatusText(p === 100 ? "Zipping..." : `Processing: ${name}`);
                  });
                  
                  const blob = await response.blob();
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
                  return;
              } else {
                  // For multiple chunks, show the list of chunks so they can be generated lazily
                  setExportChunks(chunks);
                  setStatusText("Ready to save!");
                  return;
              }"""

content = content.replace(old_export, new_export)

with open('ExportModal.tsx', 'w') as f:
    f.write(content)

print("Updated ExportModal.tsx backend logic")

