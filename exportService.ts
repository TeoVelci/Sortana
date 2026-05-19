
import JSZip from 'jszip';
import { downloadZip } from 'client-zip';
import { getFileFromDB } from './dbService';
import { FileSystemItem } from './AppContext';
import { processFileForDisplay } from './aiService';
import { downloadFileFromS3, getPublicUrl, fetchDirectS3Response } from './storageService';

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
        return await downloadFileFromS3(key);
    } catch (e) {
        console.error(`S3 Fetch failed for key: ${key}`, e);
        return null;
    }
};

/**
 * Main Export Logic
 */
export interface ExportChunk {
    index: number;
    files: FileSystemItem[];
}

/**
 * Calculates chunks of files to keep ZIP exports within iOS memory limits.
 * Does not process files or generate ZIPs.
 */
export const calculateExportChunks = (itemsToExport: FileSystemItem[]): ExportChunk[] => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform)) ||
                     window.innerWidth < 1024;
    const MAX_ZIP_SIZE = isMobile ? 30 * 1024 * 1024 : 500 * 1024 * 1024; // 30MB chunk for mobile, 500MB for desktop
    
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

export const generateCloudExportPayload = (
    itemsToExport: FileSystemItem[], 
    allItems: FileSystemItem[], 
    options: ExportOptions
) => {
    const files = itemsToExport.filter(i => i.type === 'file');
    const usedNames = new Set<string>();
    
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

    const exportFiles = [];
    for (let index = 0; index < files.length; index++) {
        const item = files[index];
        if (!item.s3Key) continue;

        let extension = item.name.split('.').pop() || 'jpg';
        let finalName = item.name;

        if (options.fileNamePattern === 'sequence') {
            const seq = (index + 1).toString().padStart(3, '0');
            const base = options.baseName || 'Export';
            finalName = `${base}_${seq}.${extension}`;
        } else {
            const nameParts = item.name.split('.');
            nameParts.pop();
            finalName = `${nameParts.join('.')}.${extension}`;
        }

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
        const url = getPublicUrl(item.s3Key, false);

        exportFiles.push({ name: folderPath + finalName, url });
    }

    return exportFiles;
};

/**
 * Direct-to-Disk Streaming Zip Export using client-zip
 */
export const generateStreamingZip = async (
    itemsToExport: FileSystemItem[], 
    allItems: FileSystemItem[], 
    options: ExportOptions,
    onProgress?: (percent: number, currentFile: string) => void
): Promise<Response> => {
    
    const usedNames = new Set<string>();
    let filesAdded = 0;
    const MAX_RETRIES = 5;
    
    const files = itemsToExport.filter(i => i.type === 'file');
    if (files.length === 0) throw new Error("No files to export");

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

    async function* getFiles() {
        for (let index = 0; index < files.length; index++) {
            const item = files[index];
            let retries = 0;
            let success = false;
            
            while (retries < MAX_RETRIES && !success) {
                try {
                    let extension = item.name.split('.').pop() || 'jpg';
                    let finalName = item.name;

                    const isRaw = item.fileType === 'raw';
                    const targetFormat = options.format;
                    const needsConversion = targetFormat !== 'original';
                    const needsWatermark = options.watermark.enabled && (item.fileType === 'image' || (isRaw && targetFormat !== 'original'));

                    let inputData: Blob | Response | undefined;
                    let blob = await getFileFromDB(item.id);

                    if (needsConversion || needsWatermark) {
                        if (!blob && item.s3Key) {
                            if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), `Cloud Fetch: ${item.name}`);
                            blob = await fetchFromS3(item.s3Key);
                        }
                        if (!blob) throw new Error(`Data missing for ${item.name}`);

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
                            try {
                                if (needsWatermark) {
                                    processedBlob = await applyWatermark(sourceBlob, options.watermark.text, options.watermark.opacity, options.watermark.position, targetFormat);
                                } else if (needsConversion) {
                                    processedBlob = await applyWatermark(sourceBlob, '', 0, 'bottom-right', targetFormat); 
                                }
                            } catch (processingErr) {
                                console.warn(`Failed to process/watermark ${item.name}`, processingErr);
                            }
                            if (processedBlob) {
                                blob = processedBlob;
                                if (processedBlob.type === 'image/png') extension = 'png';
                                else if (processedBlob.type === 'image/jpeg') extension = 'jpg';
                            }
                        }
                        inputData = blob;
                    } else {
                        // NO CONVERSION NEEDED - STREAM DIRECTLY FROM S3!
                        if (blob) {
                            inputData = blob;
                        } else if (item.s3Key) {
                            if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), `Downloading: ${item.name}`);
                            const response = await fetchDirectS3Response(item.s3Key);
                            if (!response.ok) throw new Error(`Download failed: ${response.status}`);
                            inputData = response.body;
                        }
                    }

                    if (!inputData) throw new Error(`Data missing for ${item.name}`);

                    if (options.fileNamePattern === 'sequence') {
                        const seq = (index + 1).toString().padStart(3, '0');
                        const base = options.baseName || 'Export';
                        finalName = `${base}_${seq}.${extension}`;
                    } else {
                        const nameParts = item.name.split('.');
                        nameParts.pop();
                        finalName = `${nameParts.join('.')}.${extension}`;
                    }

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
                    const lastModified = item.createdAt ? new Date(item.createdAt) : new Date();

                    yield { name: folderPath + finalName, lastModified, input: inputData };
                    
                    if (options.includeXmp && (item.rating || item.flag || (item.tags && item.tags.length > 0))) {
                        const xmpContent = createXMP(item);
                        const xmpName = finalName.substring(0, finalName.lastIndexOf('.')) + '.xmp';
                        yield { name: folderPath + xmpName, lastModified, input: xmpContent };
                    }
                    
                    filesAdded++;
                    if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), item.name);
                    success = true;

                } catch (e) {
                    retries++;
                    if (retries >= MAX_RETRIES) {
                        console.error(`CRITICAL: Failed to retrieve ${item.name} after ${MAX_RETRIES} attempts. Skipping.`, e);
                    } else {
                        console.warn(`Retrying ${item.name} (${retries}/${MAX_RETRIES})`, e);
                    }
                }
            }
        }
        
        if (filesAdded < files.length) {
            console.warn(`Export Integrity Warning: Expected ${files.length} files, but only ${filesAdded} were processed.`);
        }
    }
    
    return downloadZip(getFiles());
};
