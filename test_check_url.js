import fs from 'fs';

async function testUrl() {
  const supabaseUrl = "https://fkayfefyndhdxfnnquia.supabase.co";
  const key = 'uploads/1777701524736-C0255.MP4';
  
  // 1. Get Presigned URL
  const res = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url?key=${encodeURIComponent(key)}&redirect=false`);
  const data = await res.json();
  console.log("Got presigned URL:", data.url.substring(0, 100) + "...");
  
  // 2. Fetch headers from S3
  const s3Res = await fetch(data.url, { method: 'HEAD' });
  console.log("S3 HEAD Status:", s3Res.status, s3Res.statusText);
  console.log("Content-Type:", s3Res.headers.get('content-type'));
  console.log("Content-Length:", s3Res.headers.get('content-length'));
}

testUrl().catch(console.error);
