import fs from 'fs';

async function testFull() {
  const supabaseUrl = "https://fkayfefyndhdxfnnquia.supabase.co";
  
  // 1. Get Presigned PUT URL
  const postRes = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'test-full.txt', filetype: 'text/plain' })
  });
  const postData = await postRes.json();
  const key = postData.key;
  
  // 2. Upload
  await fetch(postData.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: 'hello world'
  });
  
  console.log("Uploaded to key:", key);
  
  // 3. Get Presigned GET URL
  const getRes = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url?key=${encodeURIComponent(key)}&redirect=false`);
  const getData = await getRes.json();
  
  // 4. Fetch the file
  const fetchRes = await fetch(getData.url);
  const text = await fetchRes.text();
  console.log("Downloaded text:", text);
}

testFull().catch(console.error);
