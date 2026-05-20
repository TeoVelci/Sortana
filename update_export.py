import sys

with open('exportService.ts', 'r') as f:
    lines = f.readlines()

new_content = """export interface ExportChunk {
    index: number;
    files: FileSystemItem[];
}

/**
 * Calculates chunks of files to keep ZIP exports within iOS memory limits.
 * Does not process files or generate ZIPs.
 */
export const calculateExportChunks = (itemsToExport: FileSystemItem[]): ExportChunk[] => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const MAX_ZIP_SIZE = isMobile ? 100 * 1024 * 1024 : 500 * 1024 * 1024; // 100MB chunk for mobile, 500MB for desktop
    
    const files = itemsToExport.filter(i => i.type === 'file');
    if (files.length === 0) return [];

    const chunks: ExportChunk[] = [];
    let currentChunk: FileSystemItem[] = [];
    let currentChunkSize = 0;
    let chunkIndex = 1;
    
    for (const f of files) {
        currentChunk.push(f);
        currentChunkSize += f.size || 50000000; // Guess 50MB if unknown
        if (currentChunkSize >= MAX_ZIP_SIZE) {
            chunks.push({ index: chunkIndex, files: currentChunk });
            currentChunk = [];
            currentChunkSize = 0;
            chunkIndex++;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push({ index: chunkIndex, files: currentChunk });
    }

    return chunks;
};
"""

# Find start and end
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if line.startswith("export const generateChunkedZips = async ("):
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if "return zipBlobs;" in lines[i]:
        end_idx = i + 2
        break

if start_idx != -1 and end_idx != -1:
    lines = lines[:start_idx] + [new_content] + lines[end_idx:]
    with open('exportService.ts', 'w') as f:
        f.writelines(lines)
    print("Updated exportService.ts")
else:
    print("Could not find start/end")

