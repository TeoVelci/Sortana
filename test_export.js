const url = "https://fkayfefyndhdxfnnquia.supabase.co/functions/v1/export-zip";

async function run() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // We don't have a valid auth token, but we should see the exact error message!
      'Authorization': 'Bearer test'
    },
    body: JSON.stringify({
      files: [],
      options: {},
      zipName: "test.zip"
    })
  });
  
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Body:", text);
}
run();
