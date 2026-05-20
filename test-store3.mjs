import fs from 'fs';
import { Zip, ZipPassThrough } from 'fflate';

const out = fs.createWriteStream('test_store3.zip');
const zip = new Zip();
zip.ondata = (err, data, final) => {
  out.write(data);
  if (final) out.end();
};

const f = new ZipPassThrough('test.txt');
f.os = 3;
f.attrs = (0o100644 << 16) | 0x20;
f.mtime = new Date();
zip.add(f);

// Push a larger amount of data in chunks to ensure Data Descriptor is used properly
for (let i=0; i<100; i++) {
  f.push(Buffer.from('hello world'.repeat(100)), false);
}
f.push(Buffer.from(''), true);
zip.end();
