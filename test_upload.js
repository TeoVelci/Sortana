import fs from 'fs';

async function testUpload() {
  const supabaseUrl = "https://fkayfefyndhdxfnnquia.supabase.co";
  
  // 1. Get Presigned URL
  console.log("Getting presigned URL...");
  const res = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'test-video.mp4', filetype: 'video/mp4' })
  });
  
  if (!res.ok) {
    const err = await res.text();
    console.error("Edge function failed:", res.status, err);
    return;
  }
  
  const data = await res.json();
  console.log("Got presigned URL:", data.url.substring(0, 100) + "...");
  
  // 2. Upload to S3
  console.log("Uploading to S3...");
  const putRes = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: 'dummy video content'
  });
  
  if (!putRes.ok) {
    const errText = await putRes.text();
    console.error("S3 Upload Failed:", putRes.status, putRes.statusText);
    console.error(errText);
  } else {
    console.log("S3 Upload Succeeded!");
  }
}

testUpload().catch(console.error);
