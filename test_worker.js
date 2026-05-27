
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
                            // Let the AI handle the actual model extraction. We just provide the raw data.
                        } else {
                            result.rawMetadata += " [CODEC_INFO: " + line + "] ";
                        }
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

        // Fast-track exact model extraction for GoPro and DJI videos
        if (result.rawMetadata) {
            if (result.rawMetadata.match(/(GoPro|HERO[0-9]+)/i)) {
                result.make = 'GoPro';
                const modelMatch = result.rawMetadata.match(/(HERO[ ?0-9]+( (Black|Silver|White))?)/i);
                result.model = modelMatch ? cleanString(modelMatch[1].replace(' ', '')) : 'Camera';
            } else {
                const djiMatch = result.rawMetadata.match(/(FC[0-9]{4})/i) || result.rawMetadata.match(/(Osmo Action [0-9]+)/i);
                if (djiMatch) {
                    result.make = 'DJI';
                    result.model = cleanString(djiMatch[1]);
                }
            }
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
    
    const applyAppleFallback = () => {
        if (!result.make && !result.model && file.name) {
            const fileName = file.name.toUpperCase();
            if (fileName.includes('IMG_')) {
                result.make = 'Apple';
                result.model = 'iPhone';
            }
        }
    };

    // Handle Video Files
    if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.mov')) {
        const videoMeta = await extractMp4Metadata(file);
        result.make = videoMeta.make;
        result.model = videoMeta.model;
        result.rawMetadata = videoMeta.rawMetadata;
        if (videoMeta.dateTaken) result.dateTaken = videoMeta.dateTaken;
        applyAppleFallback();
        return result;
    }

    try {
        const arrayBuffer = await file.slice(0, 10 * 1024 * 1024).arrayBuffer(); // Read 10MB to handle large RAW files
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
                const actualOffset = count > 4 ? tiffStart + view.getUint32(offset + 8, isLittleEndian) : offset + 8;
                if (actualOffset + count > length) return null;
                let str = '';
                for (let i = 0; i < count; i++) {
                    const charCode = view.getUint8(actualOffset + i);
                    if (charCode === 0) break;
                    str += String.fromCharCode(charCode);
                }
                return str.trim();
            }
            if (type === 3) {
                if (count === 1) return view.getUint16(offset + 8, isLittleEndian);
                const actualOffset = count > 2 ? tiffStart + view.getUint32(offset + 8, isLittleEndian) : offset + 8;
                if (actualOffset > length - 2) return null;
                return view.getUint16(actualOffset, isLittleEndian); // Return first element of array
            }
            if (type === 4) {
                if (count === 1) return view.getUint32(offset + 8, isLittleEndian);
                const actualOffset = tiffStart + view.getUint32(offset + 8, isLittleEndian);
                if (actualOffset > length - 4) return null;
                return view.getUint32(actualOffset, isLittleEndian); // Return first element of array
            }
            return null;
        };
        const seenOffsets = new Set();
        const parseIFD = (offset) => {
            if (seenOffsets.has(offset)) return;
            seenOffsets.add(offset);
            
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
                } else if (tag === 0x0111 || tag === 0x0201) { // StripOffsets or JPEGInterchangeFormat
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'number') result.previewOffset = val;
                } else if (tag === 0x0117 || tag === 0x0202) { // StripByteCounts or JPEGInterchangeFormatLength
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'number') result.previewLength = val;
                } else if (tag === 0x8769) {
                    const exifOffset = view.getUint32(entryOffset + 8, isLittleEndian);
                    parseIFD(exifOffset);
                } else if (tag === 0x014A) {
                    // SubIFDs
                    const valOffset = count > 4 ? view.getUint32(entryOffset + 8, isLittleEndian) : entryOffset + 8;
                    for (let j = 0; j < count; j++) {
                        if (tiffStart + valOffset + j * 4 + 4 <= length) {
                            const subIfdOffset = view.getUint32(tiffStart + valOffset + j * 4, isLittleEndian);
                            parseIFD(subIfdOffset);
                        }
                    }
                } else if (tag === 0x9003 || tag === 0x9004) {
                    const val = readTagValue(entryOffset, type, count);
                    if (typeof val === 'string') {
                        const parsed = parseExifDate(val);
                        if (parsed) result.dateTaken = parsed;
                    }
                }
            }
            // Parse next IFD
            const nextIfdPointerOffset = tiffStart + offset + 2 + (numEntries * 12);
            if (nextIfdPointerOffset + 4 <= length) {
                const nextIfdOffset = view.getUint32(nextIfdPointerOffset, isLittleEndian);
                if (nextIfdOffset !== 0) {
                    parseIFD(nextIfdOffset);
                }
            }
        };
        parseIFD(ifd0Offset);
    } catch (e) {}

    // Fallback: Ultimate Brute-Force Scan (If EXIF was stripped but MakerNote or XMP remains anywhere)
    try {
        if (!result.make || result.make.toLowerCase().includes('unknown') || !result.model || result.model.toLowerCase().includes('unknown')) {
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const chunkSize = 5 * 1024 * 1024;
            let found = false;
            
            for (let offset = 0; offset < file.size && !found; offset += chunkSize) {
                const slice = await file.slice(offset, offset + chunkSize + 1024).arrayBuffer(); // 1KB overlap
                const text = decoder.decode(slice);
                
                let makeMatch = text.match(/(?:tiff:Make|drone-dji:Make)[=">\\s]+([^"<]+)/i);
                let modelMatch = text.match(/(?:tiff:Model|drone-dji:Model)[=">\\s]+([^"<]+)/i) || 
                                 text.match(/(FC3411|FC3170|FC7303|FC3582|FC220|L1D-20C|FC2204|FC8282)/i);
                
                if (makeMatch) result.make = cleanString(makeMatch[1]);
                if (modelMatch) {
                    result.make = 'DJI'; // If we found a DJI codename, the make is definitely DJI
                    result.model = cleanString(modelMatch[1]);
                }
                
                if (result.model && !result.model.toLowerCase().includes('unknown')) {
                    found = true;
                }
            }
        }
    } catch (e) {}

    // Fallbacks
    const isUnknownMake = !result.make || result.make.toLowerCase().includes('unknown') || result.make.trim() === '';
    if (isUnknownMake && file.name.toUpperCase().startsWith('DJI_')) {
        result.make = 'DJI';
        if (!result.model || result.model.toLowerCase().includes('unknown')) {
            result.model = 'Drone';
        }
    }

    applyAppleFallback();

    return result;
};

const extractPreviewFromRaw = async (file) => {
    try {
        // Step 1: See if EXIF gave us the exact offset and length of the JPEG thumbnail
        try {
            const meta = await extractMetadata(file);
            if (meta && meta.previewOffset && meta.previewLength && meta.previewLength > 1000) {
                const previewSlice = file.slice(meta.previewOffset, meta.previewOffset + meta.previewLength);
                const blob = new Blob([await previewSlice.arrayBuffer()], { type: 'image/jpeg' });
                // We don't have isValidImageBlob inside worker, but we can assume EXIF offset is correct
                return blob;
            }
        } catch (e) { }

        const fileSize = file.size;
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        const OVERLAP = 1024; // 1KB overlap
        const candidates = [];
        
        // Scan the first 100MB to ensure we don't miss previews in the middle of large raw files
        const scanRanges = [
            { start: 0, end: Math.min(fileSize, 100 * 1024 * 1024) }
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
                        
                        // Robust JPEG marker parser to skip EXIF thumbnails and find the true End of Image
                        let end = -1;
                        let sOffset = 2; // skip FF D8
                        while (sOffset < searchBytes.length - 1) {
                            if (searchBytes[sOffset] === 0xFF) {
                                let marker = searchBytes[sOffset + 1];
                                if (marker === 0xD9) { // End of Image
                                    end = sOffset + 2;
                                    break;
                                }
                                if (marker === 0xDA) { // Start of Scan (Image Data)
                                    // Image data follows, scan for true FF D9
                                    for (let k = sOffset + 2; k < searchBytes.length - 1; k++) {
                                        if (searchBytes[k] === 0xFF && searchBytes[k+1] === 0xD9) {
                                            end = k + 2;
                                            break;
                                        }
                                    }
                                    break;
                                }
                                if (marker >= 0xD0 && marker <= 0xD7) { // Restart markers
                                    sOffset += 2;
                                    continue;
                                }
                                if (marker === 0x00 || marker === 0xFF) { // Escaped FF or padding
                                    sOffset += 1;
                                    continue;
                                }
                                // Other markers have a 2-byte length
                                if (sOffset + 3 < searchBytes.length) {
                                    let markerLen = (searchBytes[sOffset + 2] << 8) | searchBytes[sOffset + 3];
                                    sOffset += 2 + markerLen;
                                } else {
                                    break;
                                }
                            } else {
                                sOffset++;
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
