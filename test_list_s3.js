import fs from 'fs';

async function testList() {
  const supabaseUrl = "https://fkayfefyndhdxfnnquia.supabase.co";
  const res = await fetch(`${supabaseUrl}/functions/v1/get-aws-presigned-url?key=does-not-exist.txt&redirect=false`);
  const data = await res.json();
  console.log("Presigned URL for fake file:", data.url.substring(0, 50));
  
  const s3Res = await fetch(data.url, { method: 'HEAD' });
  console.log("HEAD fake file:", s3Res.status, s3Res.statusText);
}

testList().catch(console.error);
