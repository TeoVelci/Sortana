import fs from 'fs';
import { Zip, ZipPassThrough } from 'fflate';

const out = fs.createWriteStream('test_store4.zip');
const zip = new Zip();
zip.ondata = (err, data, final) => {
  out.write(data);
  if (final) out.end();
};

const f = new ZipPassThrough('folder/');
f.os = 3;
f.attrs = (0o40755 << 16) | 0x10;
f.mtime = new Date();
zip.add(f);
f.push(Buffer.from(''), true);

const f2 = new ZipPassThrough('test.txt');
f2.os = 3;
f2.attrs = (0o100644 << 16) | 0x20;
f2.mtime = new Date();
zip.add(f2);
f2.push(Buffer.from('hello'), true);

zip.end();
