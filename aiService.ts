
import { GoogleGenAI, FunctionDeclaration, Type, Chat } from "@google/genai";

// Helper to get fresh client instance (ensures API key is current)
const getAI = () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        console.error("Gemini API Key is missing! Please ensure GEMINI_API_KEY is set in the environment.");
    }
    return new GoogleGenAI({ apiKey: apiKey || "" });
};

export class QuotaExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuotaExceededError';
    }
}

// --- WORKER MANAGEMENT ---

// INLINED WORKER CODE (Pure JS) to avoid file path/bundling issues
const WORKER_SCRIPT = `
const cleanString = (str) => {
    str = str.replace(/\\0/g, '').trim();
    const upper = str.toUpperCase();
    if (upper.includes('NIKON')) return 'Nikon';
    if (upper.includes('SONY')) return 'Sony';
    if (upper.includes('CANON')) return 'Canon';
    if (upper.includes('FUJIFILM')) return 'Fujifilm';
    if (upper.includes('OLYMPUS')) return 'Olympus';
    if (upper.includes('PANASONIC')) return 'Panasonic';
    if (upper.includes('LEICA')) return 'Leica';
    if (upper.includes('APPLE')) return 'Apple';
    return str;
};

const parseExifDate = (str) => {
    try {
        const parts = str.split(' ');
        if (parts.length < 2) return null;
        const dateParts = parts[0].split(':');
        const timeParts = parts[1].split(':');
        if (dateParts.length === 3 && timeParts.length === 3) {
            const y = parseInt(dateParts[0], 10);
            const m = parseInt(dateParts[1], 10) - 1;
            const d = parseInt(dateParts[2], 10);
            const h = parseInt(timeParts[0], 10);
            const min = parseInt(timeParts[1], 10);
            const s = parseInt(timeParts[2], 10);
            const date = new Date(y, m, d, h, min, s);
            if (!isNaN(date.getTime())) return date;
        }
        return null;
    } catch (e) { return null; }
};

const isValidImageBlob = async (blob) => {
    try {
        const bitmap = await createImageBitmap(blob);
        bitmap.close();
        return true;
    } catch (e) { return false; }
};

const extractMp4Metadata = async (file) => {
    const result = { make: null, model: null, dateTaken: null, rawMetadata: '', confidence: 0 };
    const decoder = new TextDecoder();
    try {
        const readAtom = async (offset) => {
            const blob = file.slice(offset, offset + 16);
            const buffer = await blob.arrayBuffer();
            if (buffer.byteLength < 8) return null;
            const view = new DataView(buffer);
            let size = view.getUint32(0);
            const type = decoder.decode(buffer.slice(4, 8));
            let headerSize = 8;
            if (size === 1) {
                size = Number(view.getBigUint64(8));
                headerSize = 16;
            }
            return { size, type, headerSize, offset };
        };

        const findAtoms = async (offset, limit, targetTypes, recursive = false) => {
            const found = [];
            let current = offset;
            while (current < limit) {
                const atom = await readAtom(current);
                if (!atom || atom.size <= 0) break;
                if (targetTypes.includes(atom.type)) {
                    found.push(atom);
                    if (recursive && atom.size > atom.headerSize) {
                        const children = await findAtoms(atom.offset + atom.headerSize, atom.offset + atom.size, targetTypes, true);
                        found.push(...children);
                    }
                } else if (recursive && ['moov', 'udta', 'meta', 'trak', 'mdia', 'minf', 'stbl'].includes(atom.type)) {
                    // Dive into container atoms even if they aren't the target
                    const children = await findAtoms(atom.offset + atom.headerSize, atom.offset + atom.size, targetTypes, true);
                    found.push(...children);
                }
                current += atom.size;
                if (current > file.size) break;
            }
            return found;
        };

        const extractStrings = (buffer, minLen = 4) => {
            const bytes = new Uint8Array(buffer);
            let res = '';
            let current = '';
            for (let i = 0; i < bytes.length; i++) {
                // Printable ASCII range
                if (bytes[i] >= 32 && bytes[i] <= 126) {
                    current += String.fromCharCode(bytes[i]);
                } else {
                    if (current.length >= minLen) {
                        // Filter out common noise but keep potential model names
                        const trimmed = current.trim();
                        if (trimmed.length >= minLen) {
                            res += ' ' + trimmed + ' ';
                        }
                    }
                    current = '';
                }
            }
            if (current.length >= minLen) {
                res += ' ' + current.trim() + ' ';
            }
            return res;
        };

        const scanForSignatures = (text) => {
            if (!text) return false;
            // Surgical Harvest: Prioritize lines that look like model info
            const lines = text.split(' ').filter(s => s.length >= 2);
            for (const line of lines) {
                if (result.rawMetadata.length < 200000) {
                    // If we see a Sony model pattern, give it a boost in the harvest
                    // Refined regex to be more specific and avoid long technical strings
                    // Sony models are very specific: A7, A7R, A7S, A7C, A9, A1, FX, ZV, ILCE, NEX, SLT, DSC
                    const sonyMatch = line.match(/(ILCE-[0-9A-Z]{2,10}|NEX-[0-9A-Z]{2,10}|SLT-[0-9A-Z]{2,10}|DSC-[0-9A-Z]{2,10}|FX(3|6|9|30|1000|7)|ZV-[0-9A-Z]{2,10}|A7[RMSC]? ?[0-9IV]{0,3}|A9[RMSC]? ?[0-9IV]{0,3}|A1)/i);
                    
                    if (sonyMatch) {
                        const matched = sonyMatch[1].toUpperCase();
                        
                        // Check if the match is the WHOLE word or just a part of a much longer technical string
                        // We want to avoid strings like "A1IAOM3" but allow "Device modelName="ILCE-7M4""
                        const index = line.toUpperCase().indexOf(matched);
                        const charBefore = index > 0 ? line[index - 1] : '';
                        const charAfter = index + matched.length < line.length ? line[index + matched.length] : '';
                        const isSurrounded = !/[A-Z0-9]/i.test(charBefore) && !/[A-Z0-9]/i.test(charAfter);

                        const isNoise = (!isSurrounded && line.trim().length > matched.length && !matched.startsWith('ILCE-') && !matched.startsWith('FX') && !matched.startsWith('ZV')) || 
                                        line.toUpperCase().includes('IAOM') ||
                                        line.toUpperCase().includes('XAVC') ||
                                        line.toUpperCase().includes('AVC') ||
                                        line.toUpperCase().includes('AUDIO') ||
                                        line.toUpperCase().includes('LEVEL') ||
                                        line.toUpperCase().includes('CH1') ||
                                        line.toUpperCase().includes('CH2') ||
                                        line.toUpperCase().includes('LPCM') ||
                                        line.toUpperCase().includes('FPS') ||
                                        line.toUpperCase().includes('MBPS') ||
                                        line.toUpperCase().includes('BIT') ||
                                        line.toUpperCase().includes('40M') || // Noise like FX40M
                                        line.toUpperCase().includes('12') || // Noise like FX12
                                        matched === 'A91' ||
                                        matched === 'A790' ||
                                        matched === 'A9V' ||
                                        /^[0-9]+$/.test(matched); // Reject pure numbers

                        if (!isNoise) {
                            result.rawMetadata += " [PRIORITY: " + line + "] ";
                            
                            // Prefer more specific models (longer strings or ILCE- prefix)
                            const isMoreSpecific = !result.model || 
                                                 (matched.startsWith('ILCE-') && !result.model.startsWith('ILCE-')) ||
                                                 (matched.length > result.model.length);

                            if (isMoreSpecific) {
                                result.make = 'Sony';
                                result.model = matched;
                                result.confidence = matched.startsWith('ILCE-') ? 95 : 60;
                            }
                        } else {
                            result.rawMetadata += " [CODEC_INFO: " + line + "] ";
                        }
                    }
                    
                    // Generic Sony detection
                    if (line.toUpperCase() === 'SONY' && !result.make) {
                        result.make = 'Sony';
                        result.confidence = Math.max(result.confidence, 40);
                    }

                    result.rawMetadata += line + " ";
                }
            }
            return false; 
        };

        const findSonyXml = async (file) => {
            const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
            const OVERLAP = 1024; // 1KB overlap
            const MAX_SEARCH_FROM_HEAD = 100 * 1024 * 1024; // Search first 100MB
            const MAX_SEARCH_FROM_TAIL = 100 * 1024 * 1024; // Search last 100MB
            
            const searchInRange = async (start, end) => {
                let current = start;
                while (current < end) {
                    const readEnd = Math.min(current + CHUNK_SIZE, end);
                    const blob = file.slice(current, readEnd);
                    const buffer = await blob.arrayBuffer();
                    const text = decoder.decode(buffer);
                    
                    if (text.includes('NonRealTimeMeta') || text.includes('ILCE-') || text.includes('modelName')) {
                        // Extract a large window around the find
                        const index = text.indexOf('NonRealTimeMeta') !== -1 ? text.indexOf('NonRealTimeMeta') : 
                                     (text.indexOf('ILCE-') !== -1 ? text.indexOf('ILCE-') : text.indexOf('modelName'));
                        
                        const startExtract = Math.max(0, index - 2000);
                        const endExtract = Math.min(text.length, index + 15000);
                        return " [SONY_XML_FOUND: " + text.substring(startExtract, endExtract) + "] ";
                    }
                    
                    current += (CHUNK_SIZE - OVERLAP);
                    if (current >= end) break;
                }
                return null;
            };

            // Check head
            let xml = await searchInRange(0, Math.min(file.size, MAX_SEARCH_FROM_HEAD));
            if (xml) return xml;
            
            // Check tail
            xml = await searchInRange(Math.max(0, file.size - MAX_SEARCH_FROM_TAIL), file.size);
            return xml;
            
            return null;
        };

        // Step 0: Smart Sony Scan (The "Smart Search")
        const sonyXml = await findSonyXml(file);
        if (sonyXml) {
            result.rawMetadata += sonyXml;
            scanForSignatures(sonyXml);
        }

        // Step 1: Surgical Atom Search
        // We look for moov, udta, meta, and uuid atoms which contain the real metadata
        const metadataAtoms = await findAtoms(0, Math.min(file.size, 32 * 1024 * 1024), ['moov', 'udta', 'meta', 'uuid', 'XMP_', 'xml '], true);
        
        // Also check the end of the file for 'moov' (some cameras write it at the end)
        if (file.size > 32 * 1024 * 1024) {
            const endAtoms = await findAtoms(file.size - 32 * 1024 * 1024, file.size, ['moov', 'udta', 'meta', 'uuid'], true);
            metadataAtoms.push(...endAtoms);
        }

        for (const atom of metadataAtoms) {
            // Extract strings from the atom's data
            const readSize = Math.min(atom.size, 1024 * 1024); // Don't read more than 1MB per atom to stay fast
            const atomBlob = file.slice(atom.offset + atom.headerSize, atom.offset + atom.headerSize + readSize);
            const atomBuffer = await atomBlob.arrayBuffer();
            scanForSignatures(extractStrings(atomBuffer, 3));
            
            // Special handling for mvhd (Date)
            if (atom.type === 'mvhd') {
                const view = new DataView(atomBuffer);
                const version = view.getUint8(0);
                let creationTime;
                if (version === 1) {
                    creationTime = Number(view.getBigUint64(4));
                } else {
                    creationTime = view.getUint32(4);
                }
                if (creationTime > 0) {
                    const epoch = new Date('1904-01-01T00:00:00Z').getTime();
                    const date = new Date(epoch + creationTime * 1000);
                    if (!isNaN(date.getTime()) && date.getFullYear() > 1980) {
                        result.dateTaken = date;
                    }
                }
            }
        }

        // Step 2: Fallback to broad scan if we didn't get much
        if (result.rawMetadata.length < 5000) {
            const headerBuffer = await file.slice(0, 8 * 1024 * 1024).arrayBuffer();
            scanForSignatures(extractStrings(headerBuffer));
            const footerBuffer = await file.slice(Math.max(0, file.size - 8 * 1024 * 1024)).arrayBuffer();
            scanForSignatures(extractStrings(footerBuffer));
        }

    } catch (e) {
        console.error("MP4 Parser Error:", e);
    }
    return result;
};

const extractEmbeddedThumbnailFromMp4 = async (file) => {
    try {
        // Scan first 1MB and last 1MB for JPEG headers
        const scanRange = async (start, end) => {
            const blob = file.slice(start, end);
            const buffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const len = bytes.length;
            
            for (let i = 0; i < len - 1000; i++) {
                if (bytes[i] === 0xFF && bytes[i+1] === 0xD8) {
                    let jpegEnd = -1;
                    const searchLimit = Math.min(i + 2 * 1024 * 1024, len);
                    for (let j = i + 100; j < searchLimit - 1; j++) {
                        if (bytes[j] === 0xFF && bytes[j+1] === 0xD9) {
                            jpegEnd = j + 2;
                            const size = jpegEnd - i;
                            if (size > 10000) { // At least 10KB for a decent thumbnail
                                const jpegBlob = new Blob([bytes.slice(i, jpegEnd)], { type: 'image/jpeg' });
                                if (await isValidImageBlob(jpegBlob)) return jpegBlob;
                            }
                            i = jpegEnd - 1;
                            break;
                        }
                    }
                }
            }
            return null;
        };

        // Check head
        let thumb = await scanRange(0, 2 * 1024 * 1024);
        if (thumb) return thumb;

        // Check tail
        thumb = await scanRange(Math.max(0, file.size - 2 * 1024 * 1024), file.size);
        return thumb;

    } catch (e) {
        return null;
    }
};

const extractDetailedMetadata = async (file) => {
    const result = { make: null, model: null, dateTaken: null, orientation: 1, rawMetadata: '' };
    if (file.lastModified) result.dateTaken = new Date(file.lastModified);
    
    // Handle Video Files
    if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.mov')) {
        const videoMeta = await extractMp4Metadata(file);
        result.make = videoMeta.make;
        result.model = videoMeta.model;
        result.rawMetadata = videoMeta.rawMetadata;
        if (videoMeta.dateTaken) result.dateTaken = videoMeta.dateTaken;
        return result;
    }

    try {
        const arrayBuffer = await file.slice(0, 64 * 1024).arrayBuffer();
        const view = new DataView(arrayBuffer);
        const length = arrayBuffer.byteLength;
        let tiffStart = 0;
        let isLittleEndian = false;
        const marker = view.getUint16(0, false);
        if (marker === 0xFFD8) {
            let offset = 2;
            while (offset < length) {
                if (offset + 4 > length) break;
                const segMarker = view.getUint16(offset, false);
                const segLen = view.getUint16(offset + 2, false);
                if (segMarker === 0xFFE1) {
                    if (view.getUint32(offset + 4, false) === 0x45786966) {
                        tiffStart = offset + 10;
                        break;
                    }
                }
                offset += 2 + segLen;
            }
            if (tiffStart === 0) return result;
        } else if (marker === 0x4949 || marker === 0x4D4D) {
            tiffStart = 0;
        } else {
            return result;
        }
        if (tiffStart + 8 > length) return result;
        const byteOrder = view.getUint16(tiffStart, false);
        isLittleEndian = byteOrder === 0x4949;
        const ifd0Offset = view.getUint32(tiffStart + 4, isLittleEndian);
        if (ifd0Offset < 8 || tiffStart + ifd0Offset > length) return result;
        const readTagValue = (offset, type, count) => {
            if (type === 2) {
                const valueOffset = count > 4 ? view.getUint32(offset + 8, isLittleEndian) : offset + 8;
                const actualOffset = tiffStart + valueOffset;
                if (actualOffset + count > length) return null;
                let str = '';
                for (let i = 0; i < count; i++) {
                    const charCode = view.getUint8(actualOffset + i);
                    if (charCode === 0) break;
                    str += String.fromCharCode(charCode);
                }
                return str.trim();
            }
            if (type === 3) return view.getUint16(offset + 8, isLittleEndian);
            return null;
        };
        const parseIFD = (offset) => {
            if (tiffStart + offset + 2 > length) return;
            const numEntries = view.getUint16(tiffStart + offset, isLittleEndian);
            for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffStart + offset + 2 + (i * 12);
                if (entryOffset + 12 > length) break;
                const tag = view.getUint16(entryOffset, isLittleEndian);
                const type = view.getUint16(entryOffset + 2, isLittleEndian);
                const count = view.getUint32(entryOffset + 4, isLittleEndian);
                if (tag === 0x010F) {
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') result.make = cleanString(val);
                } else if (tag === 0x0110) {
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') result.model = val;
                } else if (tag === 0x0112) {
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'number') result.orientation = val;
                } else if (tag === 0x0132) {
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') {
                        const parsed = parseExifDate(val);
                        if (parsed) result.dateTaken = parsed;
                    }
                } else if (tag === 0x8769) {
                    const exifOffset = view.getUint32(entryOffset + 8, isLittleEndian);
                    parseIFD(exifOffset);
                } else if (tag === 0x9003 || tag === 0x9004) {
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') {
                        const parsed = parseExifDate(val);
                        if (parsed) result.dateTaken = parsed;
                    }
                }
            }
        };
        parseIFD(ifd0Offset);
    } catch (e) {}
    return result;
};

const extractPreviewFromRaw = async (file) => {
    try {
        const fileSize = file.size;
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        const OVERLAP = 1024; // 1KB overlap
        const candidates = [];
        
        // Scan the first 20MB and last 10MB - most previews are there
        const scanRanges = [
            { start: 0, end: Math.min(fileSize, 20 * 1024 * 1024) },
            { start: Math.max(0, fileSize - 10 * 1024 * 1024), end: fileSize }
        ];

        for (const range of scanRanges) {
            for (let offset = range.start; offset < range.end; offset += CHUNK_SIZE - OVERLAP) {
                const readEnd = Math.min(offset + CHUNK_SIZE, range.end);
                const buffer = await file.slice(offset, readEnd).arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const len = bytes.length;

                for (let i = 0; i < len - 4; i++) {
                    if (bytes[i] === 0xFF && bytes[i+1] === 0xD8 && bytes[i+2] === 0xFF) {
                        // Found a JPEG header candidate
                        const absoluteStart = offset + i;
                        
                        // Find end marker (FF D9)
                        // We'll read a larger slice to find the end
                        const searchSlice = file.slice(absoluteStart, absoluteStart + 15 * 1024 * 1024); // Up to 15MB for a single preview
                        const searchBuffer = await searchSlice.arrayBuffer();
                        const searchBytes = new Uint8Array(searchBuffer);
                        
                        let end = -1;
                        for (let j = 0; j < searchBytes.length - 1; j++) {
                            if (searchBytes[j] === 0xFF && searchBytes[j+1] === 0xD9) {
                                end = j + 2;
                                break;
                            }
                        }

                        if (end > 2000) { // Minimum size for a valid preview
                            candidates.push({ start: absoluteStart, size: end, blob: new Blob([searchBytes.slice(0, end)], { type: 'image/jpeg' }) });
                            // Skip ahead in the outer loop
                            i += end; 
                        }
                    }
                }
            }
        }
        
        if (candidates.length === 0) return null;
        
        // Sort by size descending - we want the highest resolution preview
        candidates.sort((a, b) => b.size - a.size);
        
        for (const c of candidates) {
            if (await isValidImageBlob(c.blob)) return c.blob;
        }
    } catch (e) {
        console.warn("Worker: RAW extraction failed", e);
    }
    return null;
};

const resizeImage = async (blob, orientation = 1, maxSize = 2560, type = 'image/jpeg') => {
    let bitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch (e) { throw new Error("Worker: Failed to create ImageBitmap"); }
    const { width, height } = bitmap;
    const isRotated90 = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
    let srcWidth = width;
    let srcHeight = height;
    let outputWidth = isRotated90 ? srcHeight : srcWidth;
    let outputHeight = isRotated90 ? srcWidth : srcHeight;
    if (outputWidth > maxSize || outputHeight > maxSize) {
        const ratio = outputWidth / outputHeight;
        if (outputWidth > outputHeight) {
            outputWidth = maxSize;
            outputHeight = Math.round(maxSize / ratio);
        } else {
            outputHeight = maxSize;
            outputWidth = Math.round(maxSize * ratio);
        }
    }
    const canvas = new OffscreenCanvas(outputWidth, outputHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        throw new Error("Worker: OffscreenCanvas context failed");
    }
    ctx.save();
    if (orientation === 2) { ctx.translate(outputWidth, 0); ctx.scale(-1, 1); ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight); } 
    else if (orientation === 3) { ctx.translate(outputWidth, outputHeight); ctx.rotate(Math.PI); ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight); } 
    else if (orientation === 4) { ctx.translate(0, outputHeight); ctx.scale(1, -1); ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight); } 
    else if (orientation === 5) { ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); ctx.drawImage(bitmap, 0, 0, outputHeight, outputWidth); } 
    else if (orientation === 6) { ctx.translate(outputWidth, 0); ctx.rotate(0.5 * Math.PI); ctx.drawImage(bitmap, 0, 0, outputHeight, outputWidth); } 
    else if (orientation === 7) { ctx.rotate(0.5 * Math.PI); ctx.translate(outputWidth, -outputHeight); ctx.scale(-1, 1); ctx.drawImage(bitmap, 0, 0, outputHeight, outputWidth); } 
    else if (orientation === 8) { ctx.translate(0, outputHeight); ctx.rotate(-0.5 * Math.PI); ctx.drawImage(bitmap, 0, 0, outputHeight, outputWidth); } 
    else { ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight); }
    ctx.restore();
    bitmap.close();
    const resultBlob = await canvas.convertToBlob({ type, quality: 0.92 });
    return resultBlob;
};

self.onmessage = async (e) => {
    const { id, type, payload } = e.data;
    try {
        let result;
        switch (type) {
            case 'extractMetadata':
                result = await extractDetailedMetadata(payload.file);
                break;
            case 'extractPreviewFromRaw':
                result = await extractPreviewFromRaw(payload.file);
                break;
            case 'extractEmbeddedThumbnailFromMp4':
                result = await extractEmbeddedThumbnailFromMp4(payload.file);
                break;
            case 'resizeImage':
                result = await resizeImage(payload.file, payload.orientation, payload.maxSize, payload.type);
                break;
            default:
                throw new Error("Unknown worker action: " + type);
        }
        self.postMessage({ id, success: true, result });
    } catch (error) {
        console.error("Worker Error:", error);
        self.postMessage({ id, success: false, error: error.message });
    }
};

self.onerror = (e) => {
    console.error("Worker Global Error:", e);
};
`;

// Initialize Worker from Blob
const workerBlob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
const workerUrl = URL.createObjectURL(workerBlob);
const worker = new Worker(workerUrl);

interface WorkerTask {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}

const workerCallbacks = new Map<string, WorkerTask>();

worker.onmessage = (e) => {
    const { id, success, result, error } = e.data;
    const task = workerCallbacks.get(id);
    if (task) {
        if (success) task.resolve(result);
        else task.reject(new Error(error));
        workerCallbacks.delete(id);
    }
};

const runWorkerTask = (type: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substr(2, 9);
        workerCallbacks.set(id, { resolve, reject });
        worker.postMessage({ id, type, payload });
    });
};

// --- CENTRALIZED ADAPTIVE RATE LIMITER WITH PRIORITY ---
class RateLimiter {
  // Two queues: High for User Interaction, Low for Background Tasks
  private highPriorityQueue: Array<{ task: () => Promise<any>; resolve: (value: any) => void; reject: (reason?: any) => void }> = [];
  private lowPriorityQueue: Array<{ task: () => Promise<any>; resolve: (value: any) => void; reject: (reason?: any) => void }> = [];
  
  private isProcessing = false;
  private lastCallTime = 0;
  
  private currentDelay = 50; 
  private pausedUntil = 0;

  schedule<T>(task: () => Promise<T>, priority: 'high' | 'low' = 'low'): Promise<T> {
    return new Promise((resolve, reject) => {
      const item = { task, resolve, reject };
      if (priority === 'high') {
          this.highPriorityQueue.push(item);
      } else {
          this.lowPriorityQueue.push(item);
      }
      this.process();
    });
  }

  async handleRateLimit() {
      this.pausedUntil = Date.now() + 1000;
      this.currentDelay = Math.min(this.currentDelay + 100, 500);
      console.warn(`[RateLimiter] 429 Hit. Short pause. New delay: ${this.currentDelay}ms.`);
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.highPriorityQueue.length > 0 || this.lowPriorityQueue.length > 0) {
      // 1. Check Pause State
      if (Date.now() < this.pausedUntil) {
          const waitTime = this.pausedUntil - Date.now();
          await new Promise(r => setTimeout(r, waitTime));
      }

      // 2. Check Frequency Limit
      const now = Date.now();
      const timeSinceLast = now - this.lastCallTime;
      
      if (timeSinceLast < this.currentDelay) {
        await new Promise(r => setTimeout(r, this.currentDelay - timeSinceLast));
      }

      // 3. Execute Next Task - STRICT PRIORITY
      // Always take high priority first
      const isHighPriority = this.highPriorityQueue.length > 0;
      const item = isHighPriority ? this.highPriorityQueue.shift() : this.lowPriorityQueue.shift();

      if (item) {
        try {
            this.lastCallTime = Date.now();
            // Wrap the task in a race with a timeout (60s) to prevent infinite hanging
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out")), 60000));
            const result = await Promise.race([item.task(), timeoutPromise]);
            item.resolve(result);
        } catch (e: any) {
            item.reject(e);
        }
      }
    }

    this.isProcessing = false;
  }
}

// Global Limiter Instance
const globalRateLimiter = new RateLimiter();

export interface AIAnalysisResult {
  id?: string; // Optional for batch matching
  tags: string[];
  description: string;
}

export interface ImagePayload {
  data: string;
  mimeType: string;
}

export interface BatchItem {
    id: string;
    file?: File;
    s3Key?: string;
    previewBlob?: Blob;
    retryCount?: number; // Track retries for queue management
}

// --- ORGANIZATION TYPES ---
export interface FileManifest {
  id: string;
  name: string;
  date: number;
  type: string; // 'image', 'video', 'doc'
  make?: string;
  model?: string;
}

export interface FolderPlan {
  folderName: string;
  reasoning: string;
  fileIds: string[];
  subfolders?: FolderPlan[];
}

export type OrganizationStrategy = 'smart_event' | 'technical';

// --- VIDEO TYPES ---
export interface VideoMoment {
  timestamp: string; // e.g., "00:15"
  description: string;
}

export interface VideoAnalysisResult {
  title: string;
  summary: string;
  tags: string[];
  moments: VideoMoment[];
}

export interface ImageMetadata {
    make: string | null;
    model: string | null;
    dateTaken: Date | null;
    orientation: number;
    rawMetadata?: string;
}

/**
 * Validates if the file is an image format we want to send to the AI.
 */
export const isValidImageForAnalysis = (file: File): boolean => {
    const supportedWebTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (supportedWebTypes.includes(file.type)) return true;
    if (file.type.startsWith('image/x-') || file.type.includes('raw') || file.type === 'image/tiff') return true;
    const rawExtensions = ['.arw', '.cr2', '.cr3', '.nef', '.dng', '.orf', '.rw2', '.raf'];
    const fileName = file.name.toLowerCase();
    if (rawExtensions.some(ext => fileName.endsWith(ext))) return true;
    return false;
};

/**
 * Checks if the browser can likely render this image for canvas resizing.
 */
const isBrowserRenderable = (file: File | Blob): boolean => {
    const renderableTypes = ['image/jpeg', 'image/png', 'image/webp'];
    return renderableTypes.includes(file.type);
};

/**
 * Helper: Convert Blob to Base64 string
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // remove data:mime;base64, prefix
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * ROBUST METADATA PARSER (WORKER WRAPPER)
 */
export const analyzeVideoMetadata = async (rawMetadata: string): Promise<{ make: string | null, model: string | null }> => {
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Analyze the following raw video file metadata and extract the camera make and model. 
            
            CRITICAL INSTRUCTIONS:
            1. Your ONLY goal is to find the RAW TECHNICAL camera model code (e.g., "ILCE-7M4", "ILCE-9M2", "FX3", "ZV-E10").
            2. Ignore all technical noise like "A9M", "A9V", "A91", "A790", "XAVC", "AVC", "LPCM", "CH1", "CH2", "AUDIO", "LEVEL", "BIT", "FPS", "MBPS", "FX40M", "FX12".
            3. DO NOT confuse "FX40M" or "FX12" with "Sony FX9" or "Sony FX6". These are bitrates, NOT camera models.
            4. Ignore "friendly" names like "Sony A7 IV" or "A74" in the raw metadata, but you can use them as hints to find the technical code.
            5. Look for strings starting with "ILCE-", "FX", "ZV-", "NEX-", "SLT-", "DSC-".
            6. If you find a string like "ILCE-7M4", return it EXACTLY as the model.
            7. Return the result in JSON format with "make" (e.g., "Sony") and "model" (e.g., "ILCE-7M4") keys.
            8. If no specific technical code is found, return "Sony Camera" as the model.
            9. DO NOT return "Sony (Analyzing...)" or any other generic strings.
            10. DO NOT explain your reasoning. Just return the JSON.
            11. If you see "ILCE-7M4" anywhere in the metadata, that IS the model.
            12. If you see "ILCE-7M3" anywhere in the metadata, that IS the model.
            13. If you see "ILCE-7M2" anywhere in the metadata, that IS the model.
            14. If you see "ILCE-7" anywhere in the metadata, that IS the model.
            15. If you see "ILCE-9" anywhere in the metadata, that IS the model.
            16. If you see "ILCE-1" anywhere in the metadata, that IS the model.
            17. DO NOT return "FX40M" or "FX12" as a model. These are bitrate/codec info.
            18. If you see "A7M4" or "A7 IV", and cannot find "ILCE-7M4", return "ILCE-7M4" as the model.
            19. If you see "A7M3" or "A7 III", and cannot find "ILCE-7M3", return "ILCE-7M3" as the model.
            20. If you see "A7S3" or "A7S III", return "ILCE-7SM3".
            21. If you see "A7R4" or "A7R IV", return "ILCE-7RM4".
            22. If you see "A7R5" or "A7R V", return "ILCE-7RM5".
            23. If the metadata contains "NonRealTimeMeta" XML, look specifically for the <Model> tag.
            
            Metadata Snippets:
            ${rawMetadata.substring(0, 100000)}`, // Limit size
            config: {
                responseMimeType: "application/json"
            }
        });

        const result = parseJSONResponse(response.text);
        return {
            make: result?.make || null,
            model: result?.model || null
        };
    } catch (e) {
        console.error("Gemini metadata analysis failed", e);
        return { make: null, model: null };
    }
};

/**
 * Maps technical camera models to professional friendly names.
 */
export const getFriendlyCameraName = (make: string | null, model: string | null): string => {
    if (!make && !model) return 'Unknown Camera';
    
    const brand = make || '';
    const name = model || '';
    
    if (name === 'ANALYZING') {
        return brand.toLowerCase().includes('sony') ? 'Sony (Analyzing...)' : 'Analyzing Camera...';
    }
    
    // Sony Specific Mapping
    const isSony = brand.toLowerCase().includes('sony') || 
                   name.startsWith('ILCE-') || 
                   name.startsWith('FX') || 
                   name.startsWith('ZV-') ||
                   name.startsWith('A7') ||
                   name.startsWith('A9') ||
                   name.startsWith('A1') ||
                   name.includes('XAVC') ||
                   name.includes('XDCAM');

    if (isSony) {
        if (!name || name.toLowerCase() === 'sony' || name.toLowerCase() === 'sony camera') {
            return 'Sony Camera';
        }

        const upper = name.toUpperCase();
        
        // Mapping for specific technical codes to friendly names
        const sonyMappings: Record<string, string> = {
            'ILCE-7M4': 'Sony A7 IV',
            'A7M4': 'Sony A7 IV',
            'A7 IV': 'Sony A7 IV',
            'ILCE-7M3': 'Sony A7 III',
            'A7M3': 'Sony A7 III',
            'A7 III': 'Sony A7 III',
            'ILCE-7M2': 'Sony A7 II',
            'A7M2': 'Sony A7 II',
            'ILCE-7': 'Sony A7',
            'A7M': 'Sony A7',
            'ILCE-7RM4': 'Sony A7R IV',
            'A7RM4': 'Sony A7R IV',
            'ILCE-7RM3': 'Sony A7R III',
            'A7RM3': 'Sony A7R III',
            'ILCE-7RM2': 'Sony A7R II',
            'A7RM2': 'Sony A7R II',
            'ILCE-7R': 'Sony A7R',
            'ILCE-7SM3': 'Sony A7S III',
            'A7SM3': 'Sony A7S III',
            'ILCE-7SM2': 'Sony A7S II',
            'A7SM2': 'Sony A7S II',
            'ILCE-7S': 'Sony A7S',
            'ILCE-7C': 'Sony A7C',
            'ILCE-7CM2': 'Sony A7C II',
            'ILCE-7CR': 'Sony A7CR',
            'ILCE-1': 'Sony A1',
            'ILCE-9M2': 'Sony A9 II',
            'ILCE-9': 'Sony A9',
            'FX3': 'Sony FX3',
            'FX6': 'Sony FX6',
            'FX9': 'Sony FX9',
            'FX30': 'Sony FX30',
            'ZV-E10': 'Sony ZV-E10',
            'ZV-1': 'Sony ZV-1',
            'ILCE-6000': 'Sony A6000',
            'ILCE-6100': 'Sony A6100',
            'ILCE-6300': 'Sony A6300',
            'ILCE-6400': 'Sony A6400',
            'ILCE-6500': 'Sony A6500',
            'ILCE-6600': 'Sony A6600',
            'ILCE-6700': 'Sony A6700'
        };

        if (sonyMappings[upper]) {
            return sonyMappings[upper];
        }

        // Technical-First: If it's a specific technical code, return it directly
        if (upper.startsWith('ILCE-') || upper.startsWith('FX') || upper.startsWith('ZV') || upper.startsWith('NEX') || upper.startsWith('SLT-') || upper.startsWith('DSC-')) {
            // Filter out known noise if it somehow slipped through
            if (upper === 'FX40M' || upper === 'FX12') return 'Sony Camera';
            return upper;
        }

        // Fallback for generic names that are still valid
        if (upper.startsWith('A7') || upper.startsWith('A9') || upper.startsWith('A1')) {
            return upper;
        }

        return `Sony ${name.replace(/Sony/gi, '').trim()}`.replace('Sony Sony', 'Sony').trim();
    }
    
    // Canon Specific Mapping
    if (brand.toLowerCase().includes('canon')) {
        if (!name) return 'Canon Camera';
        return `Canon ${name.replace('Canon ', '')}`;
    }

    // Nikon Specific Mapping
    if (brand.toLowerCase().includes('nikon') || name.startsWith('NIKON') || name.startsWith('Z ')) {
        if (!name || name === brand) return 'Nikon Camera';
        return `Nikon ${name.replace('NIKON ', '').replace('Nikon ', '')}`;
    }

    // Default
    if (!brand && name) return name;
    if (brand && !name) return `${brand} Camera`;
    return `${brand} ${name}`.trim() || 'Unknown Camera';
};

export const extractDetailedMetadata = async (file: File): Promise<ImageMetadata> => {
    try {
        const result = await runWorkerTask('extractMetadata', { file });
        // Re-hydrate Date object since workers serialize dates to strings
        if (result.dateTaken) result.dateTaken = new Date(result.dateTaken);
        return result;
    } catch (e) {
        console.warn("Metadata extraction failed", e);
        return { make: null, model: null, dateTaken: new Date(file.lastModified), orientation: 1 };
    }
};

/**
 * PREVIEW GENERATION PIPELINE (WORKER POWERED)
 * 1. Checks if RAW extraction needed.
 * 2. Uses Worker to extract or resize.
 */
export const processFileForDisplay = async (file: File, maxSize: number = 2560): Promise<Blob | null> => {
    let sourceBlob: Blob | null = file;
    let orientation = 1;
    
    // 1. Get Metadata (for Orientation)
    try {
        const meta = await extractDetailedMetadata(file);
        orientation = meta.orientation;
    } catch (e) {
        // Silently ignore metadata errors for preview generation
    }
    
    // 2. Handle Video Files - Try to extract embedded thumbnail first
    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|m4v)$/i);
    if (isVideo) {
        try {
            const thumb = await runWorkerTask('extractEmbeddedThumbnailFromMp4', { file });
            if (thumb) sourceBlob = thumb;
            else {
                // Fallback: try to extract frames using the main thread video element
                // We'll return null here and let the UI handle the "Proxy" generation if needed
                return null;
            }
        } catch (e) {
            return null;
        }
    }
    
    // 3. Handle RAW formats that browsers can't render
    const isRaw = file.type.includes('raw') || file.name.match(/\.(arw|cr2|cr3|nef|dng|orf|rw2|raf)$/i);
    if (!isBrowserRenderable(file) && isRaw && !isVideo) {
         try {
             // Offload heavy binary scanning to worker
             sourceBlob = await runWorkerTask('extractPreviewFromRaw', { file });
         } catch (e) {
             sourceBlob = null;
         }
    }

    if (!sourceBlob) {
        // If we couldn't extract a preview, and it's not natively renderable, we can't display it
        if (isBrowserRenderable(file)) sourceBlob = file; 
        else return null;
    }

    // 3. Resize/Standardize in Worker
    try {
        // We always run through resize to correct orientation and ensure standard JPEG output
        const resizedBlob = await runWorkerTask('resizeImage', { 
            file: sourceBlob, 
            orientation, 
            maxSize: maxSize, 
            type: 'image/jpeg' 
        });
        return resizedBlob;
    } catch (e) {
        console.error("Worker resizing failed, falling back to source", e);
        return sourceBlob; 
    }
};

export const prepareImageForAI = async (file?: File, preProcessedBlob?: Blob): Promise<ImagePayload> => {
    let sourceBlob: Blob | undefined = preProcessedBlob || file;
    
    if (!sourceBlob) throw new Error("No source image provided for AI analysis");
    const isRaw = file && (file.type.includes('raw') || file.name.match(/\.(arw|cr2|cr3|nef|dng|orf|rw2|raf)$/i));

    // If we don't have a pre-processed blob (e.g. from display logic), ensuring we have a readable image
    if (!preProcessedBlob && file && !isBrowserRenderable(file)) {
         const extracted = await runWorkerTask('extractPreviewFromRaw', { file });
         if (extracted) {
             sourceBlob = extracted;
         } else if (isRaw) {
             // LAST RESORT: Try to find ANY JPEG header in the first 5MB
             try {
                 const buffer = await file.slice(0, 5 * 1024 * 1024).arrayBuffer();
                 const bytes = new Uint8Array(buffer);
                 for (let i = 0; i < bytes.length - 4; i++) {
                     if (bytes[i] === 0xFF && bytes[i+1] === 0xD8 && bytes[i+2] === 0xFF) {
                         // Found a JPEG header candidate, try to extract it
                         const blob = new Blob([bytes.slice(i, i + 512 * 1024)], { type: 'image/jpeg' });
                         if (await isValidImageBlob(blob)) {
                             sourceBlob = blob;
                             break;
                         }
                     }
                 }
             } catch (e) {
                 // Ignore
             }
         }
         
         if (!sourceBlob || !isBrowserRenderable(sourceBlob)) {
             throw new Error("Could not extract renderable image from file.");
         }
    }

    // Resize for AI (Small 512px is efficient)
    try {
        const smallBlob = await runWorkerTask('resizeImage', { 
            file: sourceBlob, 
            orientation: 1, // AI usually handles orientation, but we normalize anyway
            maxSize: 1024, 
            type: 'image/jpeg' 
        });
        
        const b64 = await blobToBase64(smallBlob);
        return { data: b64, mimeType: 'image/jpeg' };

    } catch (e) {
        // Fallback: If worker fails, try sending original if small enough, or error
        if (isBrowserRenderable(sourceBlob)) {
             const b64 = await blobToBase64(sourceBlob);
             return { data: b64, mimeType: sourceBlob.type || 'image/jpeg' };
        }
        throw new Error(`Image could not be prepared for AI.`, { cause: e });
    }
};

const blobUrlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return blobToBase64(blob);
};

// --- VIDEO PROCESSING (MAIN THREAD) ---
// Note: Video elements require DOM, so this cannot be moved to a standard Worker easily without hacks.
const extractVideoFrames = async (file: File): Promise<ImagePayload[]> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const frames: ImagePayload[] = [];
        const MAX_FRAMES = 10; 
        const url = URL.createObjectURL(file);
        video.src = url;
        video.muted = true;
        video.playsInline = true; 
        if (!ctx) { reject(new Error("Canvas context failed")); return; }
        video.onloadedmetadata = async () => {
            const duration = video.duration;
            const interval = Math.max(1, duration / MAX_FRAMES);
            let currentTime = 0;
            const seekResolve = () => {
                return new Promise<void>((res) => {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        canvas.width = 480; 
                        canvas.height = (video.videoHeight / video.videoWidth) * 480;
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                        frames.push({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
                        res();
                    };
                    video.addEventListener('seeked', onSeeked);
                    video.currentTime = currentTime;
                });
            };
            while (currentTime < duration && frames.length < MAX_FRAMES) {
                await seekResolve();
                currentTime += interval;
            }
            URL.revokeObjectURL(url);
            resolve(frames);
        };
        video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load video")); };
    });
};

const callAIWithRetry = async (apiCall: () => Promise<any>, retries = 3, priority: 'high' | 'low' = 'low'): Promise<any> => {
    for (let i = 0; i < retries + 1; i++) {
        try {
            return await globalRateLimiter.schedule(() => apiCall(), priority);
        } catch (error: any) {
            if (error.status === 400 || error.code === 400 || error.message?.includes('INVALID_ARGUMENT')) {
                throw error;
            }
            if (error.status === 403 || error.code === 403 || error.message?.includes('PERMISSION_DENIED')) {
                throw new Error("Invalid API Key or Permission Denied.", { cause: error });
            }
            
            const msg = error.message?.toLowerCase() || '';
            const isRateLimit = error.status === 429 || error.code === 429 || msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('limit');
            const isServerOverloaded = error?.status === 503 || error?.code === 503;
            
            if (isRateLimit) {
                // Trigger ADAPTIVE backoff
                await globalRateLimiter.handleRateLimit();
                
                if (i < retries) {
                    console.warn(`Quota hit (Attempt ${i+1}/${retries}). Retrying...`);
                    continue;
                }
                throw new QuotaExceededError("Gemini API Quota Exceeded");
            }

            if (isServerOverloaded && i < retries) {
                await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, i)));
                continue;
            }
            throw error;
        }
    }
};

// Robust JSON Parser that handles Arrays OR Objects and cleans markdown
const parseJSONResponse = (text: string) => {
    try {
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Try simple parse first
        try {
            return JSON.parse(cleanText);
        } catch (e) {
            // Heuristic extraction for objects and arrays
            const firstBrace = cleanText.indexOf('{');
            const firstBracket = cleanText.indexOf('[');
            
            let start = -1;
            let end = -1;

            if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
                // It's likely an object
                start = firstBrace;
                end = cleanText.lastIndexOf('}') + 1;
            } else if (firstBracket !== -1) {
                // It's likely an array
                start = firstBracket;
                end = cleanText.lastIndexOf(']') + 1;
            }

            if (start !== -1 && end !== -1) {
                cleanText = cleanText.substring(start, end);
                return JSON.parse(cleanText);
            }
            throw e;
        }
    } catch (e) {
        console.warn("JSON Parsing Failed", e);
        return null; 
    }
};

export const analyzeVideo = async (file: File): Promise<VideoAnalysisResult> => {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) throw new Error("API Key missing");
        const frames = await extractVideoFrames(file);
        if (frames.length === 0) throw new Error("Could not extract frames from video");

        const contentParts: any[] = frames.map(f => ({
            inlineData: { mimeType: f.mimeType, data: f.data }
        }));

        contentParts.push({
            text: `Here are frames from a video clip. Return JSON with title, summary, tags, and moments.`
        });

        // Dynamic Client Instantiation
        const ai = getAI();
        const response = await callAIWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Stable model for video
            contents: { parts: contentParts },
            config: { responseMimeType: 'application/json' }
        }), 3, 'low'); // Video analysis is low priority background task

        if (response.text) {
            const json = parseJSONResponse(response.text);
            return {
                title: json?.title || "Untitled Video",
                summary: json?.summary || "No summary available.",
                tags: Array.isArray(json?.tags) ? json.tags : [],
                moments: Array.isArray(json?.moments) ? json.moments : []
            };
        }
        throw new Error("No response text from AI");
    } catch (error) {
        console.error("Video Analysis Failed:", error);
        throw error;
    }
};

/**
 * BATCH PROCESSING
 */
export const generateTagsForBatch = async (batch: BatchItem[]): Promise<AIAnalysisResult[]> => {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) throw new Error("API Key missing");
        if (batch.length === 0) return [];

        const processedImages = await Promise.all(batch.map(async (item) => {
            try {
                const payload = await prepareImageForAI(item.file, item.previewBlob);
                return {
                    id: item.id,
                    inlineData: { mimeType: payload.mimeType, data: payload.data },
                    success: true
                };
            } catch (e) {
                console.warn(`Image preparation failed for ${item.id}:`, e);
                return { id: item.id, success: false };
            }
        }));

        const validImages = processedImages.filter(img => img.success);
        if (validImages.length === 0) {
            return batch.map(b => ({ id: b.id, tags: ['AI Error'], description: 'Could not prepare any images for analysis.' }));
        }

        const parts: any[] = [];
        validImages.forEach((img, index) => {
            parts.push({ text: `Image ${index} (ID: ${img.id})` });
            parts.push({ inlineData: img.inlineData });
        });

        parts.push({ 
            text: `Analyze these ${validImages.length} images. Return a JSON ARRAY of objects. Schema:
            { "id": "string", "tags": ["tag1", "tag2"], "description": "concise summary" }` 
        });

        // Dynamic Client Instantiation
        const ai = getAI();
        const response = await callAIWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Faster model for basic vision
            contents: { parts: parts },
            config: {
                responseMimeType: 'application/json',
                // Using MimeType + Prompt instead of strict schema for better batch reliability
            }
        }), 3, 'low'); // Image Tagging is Low Priority

        if (response.text) {
            const results = parseJSONResponse(response.text);
            if (Array.isArray(results)) return results;
        }
        throw new Error("Invalid response format");

    } catch (error: any) {
        if (error instanceof QuotaExceededError) throw error;
        console.error("Batch Analysis Failed", error);
        return batch.map(b => ({
            id: b.id,
            tags: ['AI Error'],
            description: 'Analysis failed.'
        }));
    }
}

export const generateImageTags = async (file: File, previewBlob?: Blob): Promise<AIAnalysisResult> => {
    const res = await generateTagsForBatch([{ id: 'single', file, previewBlob }]);
    return res[0] || { tags: [], description: '' };
};

export const editImageWithAI = async (originalUrl: string, prompt: string): Promise<string> => {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) throw new Error("API Key missing");
        const base64Data = await blobUrlToBase64(originalUrl);
        const ai = getAI();
        const response = await callAIWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image', 
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
                    { text: `Edit this image: ${prompt}` }
                ]
            }
        }), 3, 'high'); // Magic Edit is High Priority (User Waiting)
        let imageBase64: string | null = null;
        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    imageBase64 = part.inlineData.data;
                    break;
                }
            }
        }
        if (imageBase64) return `data:image/png;base64,${imageBase64}`;
        throw new Error("No image generated by Gemini.");
    } catch (error) {
        console.error("Magic Edit Failed:", error);
        throw error;
    }
};

export const proposeOrganization = async (files: FileManifest[], strategy: OrganizationStrategy = 'smart_event'): Promise<FolderPlan[]> => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    if (files.length === 0) return [];

    const fileList = files.map(f => ({
        id: f.id, 
        name: f.name, 
        date: new Date(f.date).toISOString(), // Include time for accurate event clustering
        type: f.type, 
        make: f.make || 'Unknown', // Explicit fallback for AI context
        model: f.model || 'Device'
    }));
    const processedList = fileList.length > 300 ? fileList.slice(0, 300) : fileList;
    const truncatedNote = fileList.length > 300 ? `(List truncated to first 300 items)` : '';

    const prompt = `
    Task: Organize this flat list of files into a hierarchical folder structure based on ${strategy === 'smart_event' ? 'Events (Time/Context)' : 'Device/Camera Technical Data'}.
    ${truncatedNote}
    
    Files: ${JSON.stringify(processedList)}

    Rules:
    1. Group files logically.
    2. Create descriptive folder names (e.g., "2023-10-31_Halloween_Party").
    3. DO NOT use generic folder names like "videos", "photos", or "clips".
    4. If organizing by Device, use a nested structure: "Brand Model" at the top level, with "YYYY-MM-DD" as subfolders.
    5. Ensure every file ID is assigned to a folder.
    6. You can create nested subfolders if necessary.
    7. Return valid JSON.

    Expected JSON Format:
    {
      "plans": [
        {
          "folderName": "Name",
          "reasoning": "Why this group exists",
          "fileIds": ["id1", "id2"],
          "subfolders": [ { "folderName": "Sub", "fileIds": [...] } ] 
        }
      ]
    }
    `;

    try {
        const ai = getAI();
        const response = await callAIWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { 
                responseMimeType: 'application/json', 
                temperature: 0.1,
                // REMOVED strictly typed responseSchema to allow recursive nesting without 400 error
            }
        }), 3, 'high'); // HIGH PRIORITY - User initiated
        
        if (response.text) {
            // Robust parsing using the new helper
            const json = parseJSONResponse(response.text);
            return json?.plans || [];
        }
        return [];
    } catch (error) {
        console.error("Auto-Organize Failed:", error);
        throw error;
    }
};

// ... (Tools and Copilot Init - Updated to use getAI inside init if needed, but chat usually persisted)
// Copilot chat init usually needs a one-time instance, we'll keep it as is but use getAI helper logic
const setFiltersTool: FunctionDeclaration = { name: 'set_filters', description: 'Filter files.', parameters: { type: Type.OBJECT, properties: { rating: { type: Type.NUMBER }, flag: { type: Type.STRING }, search: { type: Type.STRING } } } };
const createFolderTool: FunctionDeclaration = { name: 'create_folder', description: 'Create folder.', parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING } }, required: ['name'] } };
const listProjectsTool: FunctionDeclaration = { name: 'list_projects', description: 'List projects.', parameters: { type: Type.OBJECT, properties: { refresh: { type: Type.BOOLEAN } } } };
const navigateTool: FunctionDeclaration = { name: 'navigate', description: 'Navigate.', parameters: { type: Type.OBJECT, properties: { page: { type: Type.STRING } }, required: ['page'] } };
const getStatsTool: FunctionDeclaration = { name: 'get_storage_stats', description: 'Get stats.', parameters: { type: Type.OBJECT, properties: { unit: { type: Type.STRING } } } };
export const copilotTools = [setFiltersTool, createFolderTool, listProjectsTool, navigateTool, getStatsTool];

export const initializeCopilotChat = (): Chat => {
    const ai = getAI();
    return ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
            systemInstruction: `You are Sortana Copilot.`,
            tools: [{ functionDeclarations: copilotTools }]
        }
    });
};
