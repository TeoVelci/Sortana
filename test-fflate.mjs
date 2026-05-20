import { Zip, ZipDeflate } from "fflate";
import fs from "fs";

const zip = new Zip();
const chunks = [];
zip.ondata = (err, data, final) => {
  if (data) chunks.push(data);
  if (final) {
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    fs.writeFileSync("test_fflate.zip", result);
    import("child_process").then(({ execSync }) => {
      console.log(execSync("zipinfo -v test_fflate.zip").toString());
    });
  }
};

const folder = new ZipDeflate("2024/", { level: 1, os: 0, attrs: 0x10, mtime: new Date() });
zip.add(folder);
folder.push(new Uint8Array(0), true);

const file = new ZipDeflate("2024/test.txt", { level: 1, os: 0, attrs: 0x20, mtime: new Date() });
zip.add(file);
file.push(new TextEncoder().encode("Hello World"), true);

zip.end();
