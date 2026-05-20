const fs = require('fs');
const { execSync } = require('child_process');

async function test() {
  const payload = {
    zipName: "Test.zip",
    files: [
      { name: "test.png", url: "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png" }
    ]
  };

  const response = await fetch("https://fkayfefyndhdxfnnquia.supabase.co/functions/v1/export-zip", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const buffer = await response.arrayBuffer();
  fs.writeFileSync("test_download.zip", Buffer.from(buffer));
  
  try {
    const out = execSync("zipinfo -v test_download.zip");
    console.log(out.toString());
  } catch (e) {
    console.error("Unzip test failed:\n", e.message);
  }
}
test();
