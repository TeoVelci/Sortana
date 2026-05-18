
import JSZip from 'jszip';
import { downloadZip } from 'client-zip';
import { getFileFromDB } from './dbService';
import { FileSystemItem } from './AppContext';
import { processFileForDisplay } from './aiService';
import { downloadFileFromS3 } from './storageService';
import { supabase } from './supabaseClient';

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
 * Main Export Logic (Cloud)
 */
export const generateCloudExport = async (
    itemsToExport: FileSystemItem[], 
    allItems: FileSystemItem[], 
    options: ExportOptions
): Promise<string> => {
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

    const usedNames = new Set<string>();

    const payloadFiles = files.map((item, index) => {
        let extension = item.name.split('.').pop() || 'jpg';
        let finalName = item.name;

        // If it's a RAW file, and we are not doing "Original" format, we convert it to jpg/png
        const isRaw = item.fileType === 'raw';
        const targetFormat = options.format;
        const needsConversion = targetFormat !== 'original';
        const needsWatermark = options.watermark.enabled && (item.fileType === 'image' || (isRaw && targetFormat !== 'original'));

        if (needsConversion || needsWatermark) {
            if (targetFormat === 'png') extension = 'png';
            else if (targetFormat === 'jpg') extension = 'jpg';
        }

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
        
        let xmpString: string | null = null;
        if (options.includeXmp && (item.rating || item.flag || (item.tags && item.tags.length > 0))) {
            xmpString = createXMP(item);
        }

        return {
            s3Key: item.s3Key,
            finalName,
            folderPath,
            xmpString
        };
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error("Your login session has expired. Please refresh the page or log out and log back in to export.");
    }

    const { data, error } = await supabase.functions.invoke('trigger-export', {
        body: {
            files: payloadFiles,
            options
        },
        headers: {
            Authorization: `Bearer ${session.access_token}`
        }
    });

    if (error) {
        throw new Error(error.message || "Failed to trigger cloud export");
    }

    if (data?.error) {
        console.error("Cloud export backend error:", data);
        throw new Error(`Auth/Backend Error: ${JSON.stringify(data.details || data.error)}`);
    }

    return data.s3Key;
};

export const checkExportStatus = async (s3Key: string): Promise<boolean> => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            console.error("Session expired while checking export status");
            return false;
        }

        const { data, error } = await supabase.functions.invoke('check-export-status', {
            body: { key: s3Key },
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });
        
        if (error) {
            console.error("Check status error:", error);
            return false;
        }

        return !!data?.ready;
    } catch(e) {
        console.error("Failed to check export status:", e);
    }
    return false;
}

/**
 * Main Export Logic (Legacy Local)
 */
export const generateChunkedZips = async (
    itemsToExport: FileSystemItem[], 
    allItems: FileSystemItem[], 
    options: ExportOptions,
    onProgress?: (percent: number, currentFile: string) => void
): Promise<Blob[]> => {
    
    let filesAdded = 0;
    const CONCURRENCY_LIMIT = 3;
    const MAX_RETRIES = 5;
    const MAX_ZIP_SIZE = 300 * 1024 * 1024; // 300MB chunk size
    
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

    const chunks: FileSystemItem[][] = [];
    let currentChunk: FileSystemItem[] = [];
    let currentChunkSize = 0;
    
    for (const f of files) {
        currentChunk.push(f);
        currentChunkSize += f.size || 50000000; // Guess 50MB if unknown
        if (currentChunkSize >= MAX_ZIP_SIZE) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkSize = 0;
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    const zipBlobs: Blob[] = [];
    const usedNames = new Set<string>();

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        const zip = new JSZip();
        const results: { [id: string]: { blob: Blob, finalName: string, folderPath: string } } = {};
        const queue = [...chunk.map((f, index) => ({ item: f, index, retries: 0 }))];
        
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
            const needsConversion = targetFormat !== 'original';
            // Do not watermark RAW files if Original Format is selected, because watermarking forces a JPEG conversion
            const needsWatermark = options.watermark.enabled && (item.fileType === 'image' || (isRaw && targetFormat !== 'original'));

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
                    try {
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
                    } catch (processingErr) {
                        console.warn(`Failed to process/watermark ${item.name}, falling back to original`, processingErr);
                        processedBlob = null;
                    }

                    if (processedBlob) {
                        blob = processedBlob;
                        // Always ensure the extension matches the processed blob type
                        if (processedBlob.type === 'image/png') {
                            extension = 'png';
                        } else if (processedBlob.type === 'image/jpeg') {
                            extension = 'jpg';
                        }
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
                console.error(`CRITICAL: Failed to retrieve ${item.name} after ${MAX_RETRIES} attempts. Skipping file.`, e);
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

        for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, chunk.length); i++) {
            workers.push(runWorker());
        }

        await Promise.all(workers);

        // Add to Zip
        for (const item of chunk) {
            const res = results[item.id];
            if (res) {
                zip.file(res.folderPath + res.finalName, res.blob);
                if (options.includeXmp && (item.rating || item.flag || (item.tags && item.tags.length > 0))) {
                    const xmpContent = createXMP(item);
                    const xmpName = res.finalName.substring(0, res.finalName.lastIndexOf('.')) + '.xmp';
                    zip.file(res.folderPath + xmpName, xmpContent);
                }
            }
        }

        if (Object.keys(zip.files).length > 0) {
            if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), `Finalizing ZIP Part ${chunkIdx + 1} of ${chunks.length}...`);
            const chunkBlob = await zip.generateAsync({ type: 'blob' });
            zipBlobs.push(chunkBlob);
        }
    }
    
    if (filesAdded < files.length) {
        console.warn(`Export Integrity Warning: Expected ${files.length} files, but only ${filesAdded} were processed.`);
    }

    return zipBlobs;
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
                    let blob = await getFileFromDB(item.id);
                    if (!blob && item.s3Key) {
                        if (onProgress) onProgress(Math.round((filesAdded / files.length) * 100), `Cloud Fetch: ${item.name}`);
                        blob = await fetchFromS3(item.s3Key);
                    }
                    if (!blob) throw new Error(`Data missing for ${item.name}`);

                    let extension = item.name.split('.').pop() || 'jpg';
                    let finalName = item.name;

                    const isRaw = item.fileType === 'raw';
                    const targetFormat = options.format;
                    const needsConversion = targetFormat !== 'original';
                    const needsWatermark = options.watermark.enabled && (item.fileType === 'image' || (isRaw && targetFormat !== 'original'));

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
                    }

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
                    const lastModified = (item as any).created_at ? new Date((item as any).created_at) : new Date();

                    yield { name: folderPath + finalName, lastModified, input: blob };
                    
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
