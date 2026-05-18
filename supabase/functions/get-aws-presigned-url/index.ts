import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

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

    // Handle GET request for viewing/downloading files
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const key = url.searchParams.get('key');
      
      if (!key) {
        return new Response("Missing key", { status: 400, headers: corsHeaders });
      }

      const commandParams: any = {
        Bucket: bucketName,
        Key: key,
      };

      const isDownload = url.searchParams.get('download') === 'true';
      const downloadFilename = url.searchParams.get('filename') || 'download';
      
      if (isDownload) {
        commandParams.ResponseContentDisposition = `attachment; filename="${downloadFilename}"`;
      }

      const command = new GetObjectCommand(commandParams);

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      const shouldRedirect = url.searchParams.get('redirect') !== 'false';

      if (shouldRedirect) {
        // Redirect directly to the presigned URL so it can be used in <img> tags
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            'Location': signedUrl
          }
        });
      } else {
        // Return JSON with the presigned URL
        return new Response(JSON.stringify({ url: signedUrl }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }

    // Handle POST request for generating upload URLs
    if (req.method === 'POST') {
      // Manually verify JWT since we will deploy with verify_jwt: false
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), { status: 401, headers: corsHeaders })
      }
      
      const token = authHeader.replace('Bearer ', '')
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
      const supabase = createClient(supabaseUrl, supabaseKey)
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
         return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401, headers: corsHeaders })
      }

      const { filename, filetype } = await req.json()
      
      if (!filename || !filetype) {
        return new Response(JSON.stringify({ error: 'Filename and filetype are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const key = `uploads/${Date.now()}-${filename}`;
      
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: filetype,
      });

      // Generate the presigned URL for upload
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      return new Response(
        JSON.stringify({ url: uploadUrl, key }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  } catch (error: any) {
    console.error('Error in edge function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
