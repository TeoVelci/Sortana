const fs = require('fs');
const buffer = fs.readFileSync('gopro_test_files/GOPR0056.GPR');
const jpegs = [
  { offset: 6620985, size: 20067 },
  { offset: 8132391, size: 45455 },
  { offset: 10050277, size: 2402 },
  { offset: 11345951, size: 14624 },
  { offset: 11932429, size: 13130 },
  { offset: 12466613, size: 10930 },
  { offset: 19625732, size: 12289 },
  { offset: 21882975, size: 97707 },
  { offset: 22827680, size: 4830 }
];

jpegs.forEach((jpeg, index) => {
    const data = buffer.slice(jpeg.offset, jpeg.offset + jpeg.size);
    fs.writeFileSync(`gopro_test_files/extracted_${index}.jpg`, data);
});
console.log("Extracted JPEGs");
