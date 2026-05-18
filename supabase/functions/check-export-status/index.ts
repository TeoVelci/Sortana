import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { S3Client, HeadObjectCommand } from "npm:@aws-sdk/client-s3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
      },
    });

    const bucketName = Deno.env.get('AWS_BUCKET_NAME');
    if (!bucketName) throw new Error("Missing AWS_BUCKET_NAME in environment secrets");

    if (req.method === 'POST') {
      const { key } = await req.json();
      
      if (!key) {
        return new Response(JSON.stringify({ error: "Missing key" }), { status: 400, headers: corsHeaders });
      }

      try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      await s3Client.send(command);
      
      // If it succeeds, the file exists
      return new Response(JSON.stringify({ ready: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      // If NoSuchKey or 404, file doesn't exist yet
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return new Response(JSON.stringify({ ready: false }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw err;
    }
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error: any) {
    console.error('Error in check-export-status:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
