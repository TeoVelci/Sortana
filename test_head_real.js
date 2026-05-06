import fs from 'fs';

async function testUrl() {
  const supabaseUrl = "https://fkayfefyndhdxfnnquia.supabase.co";
  const key = 'uploads/test-video.mp4';
  
  const res = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url?key=${encodeURIComponent(key)}&redirect=false`);
  const data = await res.json();
  
  const s3Res = await fetch(data.url, { method: 'HEAD' });
  console.log("HEAD real file:", s3Res.status, s3Res.statusText);
}

testUrl().catch(console.error);
