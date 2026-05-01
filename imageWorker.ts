
// --- HELPER FUNCTIONS ---

const cleanString = (str: string): string => {
    // Remove null bytes
    str = str.replace(/\0/g, '').trim();
    
    const upper = str.toUpperCase();
    const brands = ['NIKON', 'SONY', 'CANON', 'FUJIFILM', 'OLYMPUS', 'PANASONIC', 'LEICA', 'APPLE'];
    
    for (const b of brands) {
        if (upper === b) return b.charAt(0) + b.slice(1).toLowerCase();
        // If it's something like "SONY CORPORATION", just return "Sony"
        if (upper === b + ' CORPORATION' || upper === b + ' CORP' || upper === b + ' INC') {
            return b.charAt(0) + b.slice(1).toLowerCase();
        }
    }
    
    return str;
};

const parseExifDate = (str: string): Date | null => {
    try {
        const parts = str.split(' ');
        if (parts.length < 2) return null;
        
        const dateParts = parts[0].split(':');
        const timeParts = parts[1].split(':');
        
        if (dateParts.length === 3 && timeParts.length === 3) {
            const y = parseInt(dateParts[0], 10);
            const m = parseInt(dateParts[1], 10) - 1; // Months are 0-indexed
            const d = parseInt(dateParts[2], 10);
            const h = parseInt(timeParts[0], 10);
            const min = parseInt(timeParts[1], 10);
            const s = parseInt(timeParts[2], 10);
            
            const date = new Date(y, m, d, h, min, s);
            if (!isNaN(date.getTime())) return date;
        }
        return null;
    } catch {
        return null;
    }
};

const isValidImageBlob = async (blob: Blob): Promise<boolean> => {
    try {
        const bitmap = await createImageBitmap(blob);
        bitmap.close();
        return true;
    } catch {
        return false;
    }
};

// --- CORE LOGIC ---

const extractDetailedMetadata = async (file: File | Blob) => {
    const result = {
        make: null as string | null,
        model: null as string | null,
        dateTaken: null as Date | null,
        orientation: 1
    };

    // Default date if file object has lastModified
    if ('lastModified' in file) {
        result.dateTaken = new Date((file as File).lastModified);
    }

    try {
        // Read first 64KB - usually sufficient for IFD0 and ExifIFD
        const arrayBuffer = await file.slice(0, 64 * 1024).arrayBuffer();
        const view = new DataView(arrayBuffer);
        const length = arrayBuffer.byteLength;

        let tiffStart = 0;
        let isLittleEndian = false;

        // 1. Detect File Type & TIFF Start
        const marker = view.getUint16(0, false);
        
        if (marker === 0xFFD8) { // JPEG
            // Scan for APP1 (Exif)
            let offset = 2;
            while (offset < length) {
                if (offset + 4 > length) break;
                const segMarker = view.getUint16(offset, false);
                const segLen = view.getUint16(offset + 2, false);
                
                if (segMarker === 0xFFE1) {
                    // Check for "Exif\0\0"
                    if (view.getUint32(offset + 4, false) === 0x45786966) {
                        tiffStart = offset + 10;
                        break;
                    }
                }
                offset += 2 + segLen;
            }
            if (tiffStart === 0) return result; // No Exif found
        } else if (marker === 0x4949 || marker === 0x4D4D) { // TIFF/RAW
            tiffStart = 0;
        } else {
            return result; // Unknown format
        }

        // 2. Parse TIFF Header
        if (tiffStart + 8 > length) return result;
        const byteOrder = view.getUint16(tiffStart, false);
        isLittleEndian = byteOrder === 0x4949;
        
        const ifd0Offset = view.getUint32(tiffStart + 4, isLittleEndian);
        if (ifd0Offset < 8 || tiffStart + ifd0Offset > length) return result;

        // Helper to read tag value
        const readTagValue = (offset: number, type: number, count: number): any => {
            // Type 2 = ASCII string
            if (type === 2) {
                let actualOffset: number;
                if (count > 4) {
                    const valueOffset = view.getUint32(offset + 8, isLittleEndian);
                    actualOffset = tiffStart + valueOffset;
                } else {
                    actualOffset = offset + 8;
                }
                
                if (actualOffset + count > length) return null;
                
                let str = '';
                for (let i = 0; i < count; i++) {
                    const charCode = view.getUint8(actualOffset + i);
                    if (charCode === 0) break;
                    str += String.fromCharCode(charCode);
                }
                return str.trim();
            }
            // Type 3 = Short (2 bytes)
            if (type === 3) {
                return view.getUint16(offset + 8, isLittleEndian);
            }
            return null;
        };

        const parseIFD = (offset: number) => {
            if (tiffStart + offset + 2 > length) return;
            const numEntries = view.getUint16(tiffStart + offset, isLittleEndian);
            
            for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffStart + offset + 2 + (i * 12);
                if (entryOffset + 12 > length) break;

                const tag = view.getUint16(entryOffset, isLittleEndian);
                const type = view.getUint16(entryOffset + 2, isLittleEndian);
                const count = view.getUint32(entryOffset + 4, isLittleEndian);

                // --- Extract Data ---
                if (tag === 0x010F) { // Make
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') result.make = cleanString(val);
                } else if (tag === 0x0110) { // Model
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') result.model = val;
                } else if (tag === 0x0112) { // Orientation
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'number') result.orientation = val;
                } else if (tag === 0x0132) { // DateTime (Modified)
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') {
                        const parsed = parseExifDate(val);
                        if (parsed) result.dateTaken = parsed;
                    }
                } else if (tag === 0x8769) { // Exif Offset
                    const exifOffset = view.getUint32(entryOffset + 8, isLittleEndian);
                    parseIFD(exifOffset); // Recurse into Exif IFD
                } else if (tag === 0x9003 || tag === 0x9004) { // DateTimeOriginal or Digitized
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') {
                        const parsed = parseExifDate(val);
                        if (parsed) result.dateTaken = parsed;
                    }
                }
            }
        };

        parseIFD(ifd0Offset);

    } catch (e) {
        // Silent fail is intentional for metadata extraction
    }

    return result;
};

const extractPreviewFromRaw = async (file: File | Blob) => {
    try {
        const fileSize = file.size;
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        const OVERLAP = 1024; // 1KB overlap
        const candidates: any[] = [];
        
        // Scan the first 40MB and last 10MB - most previews are there
        const scanRanges = [
            { start: 0, end: Math.min(fileSize, 40 * 1024 * 1024) },
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

const resizeImage = async (blob: Blob, orientation: number = 1, maxSize: number = 2560, type: string = 'image/jpeg') => {
    // 1. Create Bitmap
    try {
        const bitmap = await createImageBitmap(blob);
        const { width, height } = bitmap;
        
        // 2. Calculate Dimensions & Orientation
        const isRotated90 = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
        
        const srcWidth = width;
        const srcHeight = height;
        
        // Target dims (swapped if rotated)
        let outputWidth = isRotated90 ? srcHeight : srcWidth;
        let outputHeight = isRotated90 ? srcWidth : srcHeight;

        // Scale down if needed
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

        // 3. Draw to OffscreenCanvas
        const canvas = new OffscreenCanvas(outputWidth, outputHeight);
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            bitmap.close();
            throw new Error("Worker: OffscreenCanvas context failed");
        }

        ctx.save();
        
        // Handle Orientation Transforms
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

        // 4. Convert back to Blob
        const resultBlob = await canvas.convertToBlob({ type, quality: 0.95 });
        return resultBlob;
    } catch (e) {
        throw new Error("Worker: Failed to process image", { cause: e });
    }
};

// --- VIDEO METADATA & THUMBNAIL EXTRACTION ---

const extractVideoMetadata = async (file: File | Blob) => {
    const result = {
        make: null as string | null,
        model: null as string | null,
        dateTaken: null as Date | null,
        orientation: 1,
        rawMetadata: '' as string 
    };

    const decoder = new TextDecoder();
    const fileName = 'name' in file ? (file as File).name : '';

    // Improved binary string extraction: filter for potential model names to reduce noise
    const extractStringsFromBuffer = (buffer: ArrayBuffer): string => {
        const bytes = new Uint8Array(buffer);
        let out = "";
        let current = "";
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            // Printable ASCII range
            if (b >= 32 && b <= 126) {
                current += String.fromCharCode(b);
            } else {
                // Only keep strings that look like they might contain metadata (at least 4 chars)
                if (current.length >= 4) {
                    // Filter out common junk strings to reduce payload size
                    const junk = /^(AAAA|BBBB|CCCC|DDDD|EEEE|FFFF|GGGG|HHHH|IIII|JJJJ|KKKK|LLLL|MMMM|NNNN|OOOO|PPPP|QQQQ|RRRR|SSSS|TTTT|UUUU|VVVV|WWWW|XXXX|YYYY|ZZZZ|0000|1111|2222|3333|4444|5555|6666|7777|8888|9999)/i;
                    if (!junk.test(current)) {
                        out += current + " ";
                    }
                }
                current = "";
            }
        }
        if (current.length >= 4) out += current;
        return out;
    };

    const scanForSignatures = (text: string) => {
        // Accumulate text for potential AI fallback
        if (result.rawMetadata.length < 30000) {
            result.rawMetadata += text.substring(0, 5000) + "...";
        }

        // 1. Sony XML Device Metadata (The most reliable source for Sony Pro/Prosumer)
        // We look for the specific XML block Sony embeds in MP4s
        const sonyXmlMatch = text.match(/<Device modelName="([^"]+)"/i) || 
                            text.match(/<Model>([^<]+)<\/Model>/i) ||
                            text.match(/modelName="([^"]+)"/i);
        
        if (sonyXmlMatch) {
            result.model = sonyXmlMatch[1].trim();
            result.make = 'Sony';
            return true;
        }

        // 2. Brute-force search for Sony Model Patterns (e.g. ILCE-7M4, FX3)
        const sonyPattern = /(ILCE-[A-Z0-9]+|NEX-[A-Z0-9]+|SLT-[A-Z0-9]+|DSC-[A-Z0-9]+|FX[0-9]+|ZV-[A-Z0-9]+|A7[A-Z0-9]*|A9[A-Z0-9]*|A1|A6[0-9]{3})/i;
        const patternMatch = text.match(sonyPattern);
        if (patternMatch) {
            result.model = patternMatch[1].toUpperCase();
            result.make = 'Sony';
            return true;
        }

        return false;
    };

    // Surgical Atom Search (Look for 'uuid', 'moov', 'meta', 'rtmd')
    const findAtom = async (type: string, start: number, end: number): Promise<number | null> => {
        const searchSize = 1024 * 1024; // Search in 1MB chunks
        for (let offset = start; offset < end; offset += searchSize - 4) {
            const size = Math.min(searchSize, end - offset);
            const buffer = await file.slice(offset, offset + size).arrayBuffer();
            const view = new DataView(buffer);
            for (let i = 0; i < view.byteLength - 4; i++) {
                if (view.getUint8(i) === type.charCodeAt(0) &&
                    view.getUint8(i + 1) === type.charCodeAt(1) &&
                    view.getUint8(i + 2) === type.charCodeAt(2) &&
                    view.getUint8(i + 3) === type.charCodeAt(3)) {
                    return offset + i;
                }
            }
        }
        return null;
    };

    try {
        // Step 1: Filename Scan (Fastest)
        if (fileName) {
            const nameUpper = fileName.toUpperCase();
            const sonyPattern = /(ILCE-[A-Z0-9]+|FX[0-9]+|ZV-[A-Z0-9]+|A7[A-Z0-9]*|A9[A-Z0-9]*|A1|A6[0-9]{3})/i;
            const match = nameUpper.match(sonyPattern);
            if (match) {
                result.model = match[1];
                result.make = 'Sony';
            }
        }

        // Step 2: Surgical Binary Scan
        // Sony embeds XML metadata in 'uuid' atoms. We scan the header and footer first.
        const headerSize = Math.min(file.size, 4 * 1024 * 1024); // 4MB
        const footerSize = Math.min(file.size, 8 * 1024 * 1024); // 8MB

        const headerBuffer = await file.slice(0, headerSize).arrayBuffer();
        scanForSignatures(decoder.decode(new Uint8Array(headerBuffer)));

        if (!result.model) {
            const footerBuffer = await file.slice(file.size - footerSize).arrayBuffer();
            scanForSignatures(decoder.decode(new Uint8Array(footerBuffer)));
        }

        // Step 3: Deep Atom Search (If still not found)
        if (!result.model) {
            // Sony often puts metadata in a 'uuid' atom with a specific GUID
            const uuidPos = await findAtom('uuid', 0, headerSize) || await findAtom('uuid', file.size - footerSize, file.size);
            if (uuidPos !== null) {
                const uuidBuffer = await file.slice(uuidPos, uuidPos + 65536).arrayBuffer();
                scanForSignatures(decoder.decode(new Uint8Array(uuidBuffer)));
            }
        }

        // Step 4: Extract Date
        const startBuffer = await file.slice(0, 512 * 1024).arrayBuffer();
        const startText = decoder.decode(new Uint8Array(startBuffer));
        const dateMatch = startText.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
        if (dateMatch) {
            const d = new Date(dateMatch[1]);
            if (!isNaN(d.getTime())) result.dateTaken = d;
        }

    } catch (e) {
        console.warn("Video metadata surgical scan failed", e);
    }

    return result;
};

const extractEmbeddedThumbnailFromMp4 = async (file: File | Blob) => {
    try {
        const buffer = await file.slice(0, 1024 * 1024).arrayBuffer();
        const bytes = new Uint8Array(buffer);
        
        // Look for JPEG start in the first 1MB (common for embedded thumbnails)
        for (let i = 0; i < bytes.length - 4; i++) {
            if (bytes[i] === 0xFF && bytes[i+1] === 0xD8 && bytes[i+2] === 0xFF) {
                // Found JPEG header, try to extract it
                let end = -1;
                for (let j = i + 100; j < bytes.length - 1; j++) {
                    if (bytes[j] === 0xFF && bytes[j+1] === 0xD9) {
                        end = j + 2;
                        break;
                    }
                }
                if (end > i) {
                    const blob = new Blob([bytes.slice(i, end)], { type: 'image/jpeg' });
                    if (await isValidImageBlob(blob)) return blob;
                }
            }
        }
    } catch (e) {
        console.warn("Thumbnail extraction failed", e);
    }
    return null;
};

// --- WORKER HANDLER ---

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;

    try {
        let result: any;

        switch (type) {
            case 'extractMetadata': {
                const isVideo = payload.file.type.startsWith('video/') || payload.file.name.match(/\.(mp4|mov|m4v)$/i);
                result = isVideo ? await extractVideoMetadata(payload.file) : await extractDetailedMetadata(payload.file);
                break;
            }
            case 'extractEmbeddedThumbnailFromMp4':
                result = await extractEmbeddedThumbnailFromMp4(payload.file);
                break;
            case 'extractPreviewFromRaw':
                result = await extractPreviewFromRaw(payload.file);
                break;
            case 'resizeImage':
                result = await resizeImage(payload.file, payload.orientation, payload.maxSize, payload.type);
                break;
            default:
                throw new Error(`Unknown worker action: ${type}`);
        }

        self.postMessage({ id, success: true, result });

    } catch (error: any) {
        self.postMessage({ id, success: false, error: error.message });
    }
};
