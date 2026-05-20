import { downloadZip } from "https://cdn.jsdelivr.net/npm/client-zip/index.js"

async function test() {
  async function* getFiles() {
    const response = await fetch("https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png");
    const buffer = await response.arrayBuffer();
    yield { name: "test.png", lastModified: new Date(), input: buffer };
  }

  const response = downloadZip(getFiles());
  const buffer = await response.arrayBuffer();
  Deno.writeFileSync("test_download_buffered.zip", new Uint8Array(buffer));
}
test();
