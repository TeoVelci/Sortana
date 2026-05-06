import fs from 'fs';

async function testGet() {
  const supabaseUrl = "https://fkayfefyndhdxfnnquia.supabase.co";
  
  // Get Read URL
  console.log("Getting read presigned URL...");
  const res = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url?key=uploads/1777703064540-test-video.mp4&redirect=false`);
  
  if (!res.ok) {
    const err = await res.text();
    console.error("Edge function failed:", res.status, err);
    return;
  }
  
  const data = await res.json();
  console.log("Got read URL:", data.url.substring(0, 100) + "...");
  
  const getRes = await fetch(data.url);
  console.log("S3 Get Status:", getRes.status);
}

testGet().catch(console.error);
