const fs = require('fs');

function getJpegDimensions(buffer) {
    let offset = 2;
    while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
        }
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
    }
    return null;
}

for (let i = 0; i <= 8; i++) {
    const data = fs.readFileSync(`gopro_test_files/extracted_${i}.jpg`);
    console.log(`Extracted ${i}:`, getJpegDimensions(data));
}
