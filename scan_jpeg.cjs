const fs = require('fs');
const buffer = fs.readFileSync('gopro_test_files/GOPR0056.GPR');
let jpegs = [];
for (let i = 0; i < buffer.length - 2; i++) {
    if (buffer[i] === 0xFF && buffer[i+1] === 0xD8 && buffer[i+2] === 0xFF) {
        let end = -1;
        for (let j = i + 2; j < buffer.length - 1; j++) {
            if (buffer[j] === 0xFF && buffer[j+1] === 0xD9) {
                end = j + 2;
                // Keep searching for true EOF? Let's just find the first one that has size > 1000
                if (end - i > 1000) {
                    jpegs.push({ offset: i, size: end - i });
                    i = end;
                    break;
                }
            }
        }
    }
}
console.log("JPEGs found:", jpegs);
