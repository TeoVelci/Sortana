
import JSZip from 'jszip';
import { getFileFromDB } from './dbService';
import { FileSystemItem } from './AppContext';
import { processFileForDisplay } from './aiService';

export interface ExportOptions {
    fileNamePattern: 'original' | 'sequence';
    baseName?: string; // For sequence
    format: 'original' | 'jpg' | 'png';
    watermark: {
        enabled: boolean;
        text: string;
        opacity: number;
        position: 'bottom-right' | 'bottom-left' | 'center';
    };
    structure: 'flat' | 'preserve';
    includeXmp: boolean;
}

/**
 * Draws a watermark onto an image Blob and returns a new Blob.
 */
const applyWatermark = async (blob: Blob, text: string, opacity: number, position: string, format: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.src = url;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                URL.revokeObjectURL(url);
                reject(new Error("Canvas context failed"));
                return;
            }

            // Draw Original
            ctx.drawImage(img, 0, 0);

            // Configure Text
            const fontSize = Math.max(24, img.width * 0.03); // Responsive font size
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.globalAlpha = opacity;
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            const metrics = ctx.measureText(text);
            const textWidth = metrics.width;
            const padding = fontSize; // Padding from edge

            let x: number;
            let y: number;

            if (position === 'center') {
                x = (img.width - textWidth) / 2;
                y = (img.height + fontSize) / 2;
            } else if (position === 'bottom-left') {
                x = padding;
                y = img.height - padding;
            } else {
                // bottom-right (default)
                x = img.width - textWidth - padding;
                y = img.height - padding;
            }

            ctx.fillText(text, x, y);

            // Export
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            canvas.toBlob((b) => {
                URL.revokeObjectURL(url);
                if (b) resolve(b);
                else reject(new Error("Failed to encode watermark image"));
            }, mimeType, 0.9);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image for watermark"));
        };
    });
};

/**
 * Generates XMP Sidecar XML string
 */
const createXMP = (item: FileSystemItem): string => {
    const rating = item.rating || 0;
    let label = '';
    
    // Map Sortana Flags to Lightroom Color Labels (Common Convention)
    // Picked -> Green, Rejected -> Red
    if (item.flag === 'picked') label = 'Green';
    if (item.flag === 'rejected') label = 'Red';

    const tags = item.tags || [];

    // Construct XML
    // Using standard Adobe XMP schemas
    return `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Sortana AI">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
   ${rating > 0 ? `<xmp:Rating>${rating}</xmp:Rating>` : ''}
   ${label ? `<xmp:Label>${label}</xmp:Label>` : ''}
   ${tags.length > 0 ? `
   <dc:subject>
    <rdf:Bag>
     ${tags.map(t => `<rdf:li>${t}</rdf:li>`).join('\n     ')}
    </rdf:Bag>
   </dc:subject>` : ''}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;
};

/**
 * Helper to fetch file from S3 using presigned URL
 */
const fetchFromS3 = async (key: string): Promise<Blob | null> => {
    try {
        const urlRes = await fetch(`/api/file-url?key=${encodeURIComponent(key)}`);
        if (!urlRes.ok) return null;
        const { url } = await urlRes.json();
        const fileRes = await fetch(url);
        if (!fileRes.ok) return null;
        return await fileRes.blob();
    } catch (e) {
        console.error(`S3 Fetch failed for key: ${key}`, e);
        return null;
    }
};

/**
 * Main Export Logic
 */
export const generateExportZip = async (
    itemsToExport: FileSystemItem[], 
    allItems: FileSystemItem[], // Needed for folder structure lookup
    options: ExportOptions,
    onProgress?: (percent: number, currentFile: string) => void
): Promise<Blob> => {
    
    const zip = new JSZip();
    const usedNames = new Set<string>();
    let filesAdded = 0;
    const CONCURRENCY_LIMIT = 3;
    const MAX_RETRIES = 5;
    
    // Filter only files
    const files = itemsToExport.filter(i => i.type === 'file');
    if (files.length === 0) {
        throw new Error("No files to export");
    }

    // Helper to get full path
    const getPath = (item: FileSystemItem): string => {
        if (options.structure === 'flat' || !item.parentId) return '';
        
        const pathParts = [];
        let curr = allItems.find(i => i.id === item.parentId);
        while(curr) {
            pathParts.unshift(curr.name);
            curr = curr.parentId ? allItems.find(i => i.id === curr.parentId) : undefined;
        }
        return pathParts.join('/') + '/';
    };

    // Task Queue Logic
    const queue = [...files.map((f, index) => ({ item: f, index, retries: 0 }))];
    const results: { [id: string]: { blob: Blob, finalName: string, folderPath: string } } = {};
    
    const processTask = async (task: typeof queue[0]) => {
        const { item, index } = task;
        
        try {
            // 1. Retrieve Original Blob
            let blob = await getFileFromDB(item.id);
            
            // Fallback to S3 if not in local DB
            if (!blob && item.s3Key) {
                if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), `Cloud Fetch: ${item.name}`);
                blob = await fetchFromS3(item.s3Key);
            }

            if (!blob) {
                throw new Error(`Data missing for ${item.name}`);
            }

            // 2. Format Conversion Logic
            let extension = item.name.split('.').pop() || 'jpg';
            let finalName = item.name;

            const isRaw = item.fileType === 'raw';
            const targetFormat = options.format;
            const needsConversion = targetFormat !== 'original' || (isRaw && targetFormat !== 'original');
            const needsWatermark = options.watermark.enabled && (item.fileType === 'image' || isRaw);

            if (needsConversion || needsWatermark) {
                let sourceBlob: Blob | null = blob;
                let canProcess = true;

                if (isRaw) {
                    const preview = await processFileForDisplay(new File([blob], item.name));
                    if (preview) {
                        sourceBlob = preview;
                    } else {
                        canProcess = false;
                        console.warn(`Skipping processing for ${item.name} - RAW preview failed.`);
                    }
                }

                if (canProcess && sourceBlob) {
                    let processedBlob: Blob | null = null;
                    if (needsWatermark) {
                        processedBlob = await applyWatermark(
                            sourceBlob, 
                            options.watermark.text, 
                            options.watermark.opacity, 
                            options.watermark.position,
                            targetFormat
                        );
                    } else if (needsConversion) {
                        processedBlob = await applyWatermark(sourceBlob, '', 0, 'bottom-right', targetFormat); 
                    }

                    if (processedBlob) {
                        blob = processedBlob;
                        if (targetFormat === 'jpg') extension = 'jpg';
                        if (targetFormat === 'png') extension = 'png';
                    }
                }
            }

            // 3. Renaming Logic
            if (options.fileNamePattern === 'sequence') {
                const seq = (index + 1).toString().padStart(3, '0');
                const base = options.baseName || 'Export';
                finalName = `${base}_${seq}.${extension}`;
            } else {
                const nameParts = item.name.split('.');
                nameParts.pop();
                finalName = `${nameParts.join('.')}.${extension}`;
            }

            // Handle Duplicate Names in Flat Mode
            if (options.structure === 'flat') {
                let dedupName = finalName;
                let c = 1;
                while (usedNames.has(dedupName)) {
                    const parts = finalName.split('.');
                    const ext = parts.pop();
                    dedupName = `${parts.join('.')}_${c}.${ext}`;
                    c++;
                }
                finalName = dedupName;
                usedNames.add(finalName);
            }

            const folderPath = getPath(item);
            results[item.id] = { blob, finalName, folderPath };
            filesAdded++;
            
            if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), item.name);

        } catch (e) {
            if (task.retries < MAX_RETRIES) {
                console.warn(`Retrying ${item.name} (${task.retries + 1}/${MAX_RETRIES})`, e);
                task.retries++;
                queue.push(task); // Loop back
            } else {
                throw new Error(`CRITICAL: Failed to retrieve ${item.name} after ${MAX_RETRIES} attempts.`, { cause: e });
            }
        }
    };

    // Execute with Concurrency Limit
    const workers = [];
    const runWorker = async () => {
        while (queue.length > 0) {
            const task = queue.shift();
            if (task) await processTask(task);
        }
    };

    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, files.length); i++) {
        workers.push(runWorker());
    }

    await Promise.all(workers);

    // Final Integrity Check
    if (filesAdded < files.length) {
        throw new Error(`Export Integrity Failed: Expected ${files.length} files, but only ${filesAdded} were processed.`);
    }

    // Add to Zip
    for (const item of files) {
        const res = results[item.id];
        if (res) {
            zip.file(res.folderPath + res.finalName, res.blob);
            
            // Generate XMP Sidecar
            if (options.includeXmp && (item.rating || item.flag || (item.tags && item.tags.length > 0))) {
                const xmpContent = createXMP(item);
                const xmpName = res.finalName.substring(0, res.finalName.lastIndexOf('.')) + '.xmp';
                zip.file(res.folderPath + xmpName, xmpContent);
            }
        }
    }

    if (onProgress) onProgress(100, "Finalizing ZIP...");
    return await zip.generateAsync({ type: 'blob' });
};
