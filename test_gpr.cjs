const fs = require('fs');

const extractDetailedMetadata = async (arrayBuffer) => {
    const result = { make: null, model: null, dateTaken: null, orientation: 1, rawMetadata: '', previewOffset: 0, previewLength: 0 };
    
    try {
        const view = new DataView(arrayBuffer);
        const length = arrayBuffer.byteLength;
        let tiffStart = 0;
        let isLittleEndian = false;
        
        if (view.getUint16(tiffStart, false) === 0x4949) isLittleEndian = true;
        else if (view.getUint16(tiffStart, false) === 0x4D4D) isLittleEndian = false;
        else return result;

        let ifdOffset = view.getUint32(tiffStart + 4, isLittleEndian);
        
        const parseIFD = (offset) => {
            if (tiffStart + offset + 2 > length) return;
            const numEntries = view.getUint16(tiffStart + offset, isLittleEndian);
            console.log(`\n--- IFD at offset ${offset} (${numEntries} entries) ---`);
            
            let hasJpegThumbnail = false;
            let jpegOffset = 0;
            let jpegLength = 0;

            for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffStart + offset + 2 + (i * 12);
                if (entryOffset + 12 > length) break;
                const tag = view.getUint16(entryOffset, isLittleEndian);
                const type = view.getUint16(entryOffset + 2, isLittleEndian);
                const count = view.getUint32(entryOffset + 4, isLittleEndian);
                
                if (tag === 0x0111 || tag === 0x0201) {
                    jpegOffset = count === 1 ? view.getUint32(entryOffset + 8, isLittleEndian) : view.getUint32(entryOffset + 8, isLittleEndian); // simplified for test
                    console.log(`Found StripOffsets: ${jpegOffset}`);
                }
                if (tag === 0x0117 || tag === 0x0202) {
                    jpegLength = count === 1 ? view.getUint32(entryOffset + 8, isLittleEndian) : view.getUint32(entryOffset + 8, isLittleEndian);
                    console.log(`Found StripByteCounts: ${jpegLength}`);
                }
            }
            
            const nextIfdPointerOffset = tiffStart + offset + 2 + (numEntries * 12);
            if (nextIfdPointerOffset + 4 <= length) {
                const nextIfdOffset = view.getUint32(nextIfdPointerOffset, isLittleEndian);
                console.log(`Next IFD Pointer at ${nextIfdPointerOffset} points to: ${nextIfdOffset}`);
                if (nextIfdOffset !== 0) {
                    parseIFD(nextIfdOffset);
                }
            }
        };

        if (ifdOffset !== 0) parseIFD(ifdOffset);

    } catch (e) {
        console.error(e);
    }
    return result;
};

const run = async () => {
    const buffer = fs.readFileSync('gopro_test_files/GOPR0056.GPR');
    const slice = buffer.buffer.slice(0, 10 * 1024 * 1024);
    await extractDetailedMetadata(slice);
};

run();
