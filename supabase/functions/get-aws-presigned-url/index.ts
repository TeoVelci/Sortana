import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand
} from "npm:@aws-sdk/client-s3"
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
      
      const isJsonRequest = req.headers.get('accept')?.includes('application/json');

      if (!isJsonRequest) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, 'Location': signedUrl }
        });
      }
      
      return new Response(JSON.stringify({ url: signedUrl }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'POST') {
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

      const body = await req.json()
      const { action, filename, filetype, uploadId, partNumber, parts, key: reqKey } = body;
      
      // Multipart: Create
      if (action === 'createMultipart') {
        const key = `uploads/${Date.now()}-${filename}`;
        const command = new CreateMultipartUploadCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: filetype,
        });
        const response = await s3Client.send(command);
        return new Response(JSON.stringify({ uploadId: response.UploadId, key }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Multipart: Sign Part
      if (action === 'signPart') {
        const command = new UploadPartCommand({
          Bucket: bucketName,
          Key: reqKey,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return new Response(JSON.stringify({ url: uploadUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Multipart: Complete
      if (action === 'completeMultipart') {
        // Fetch parts automatically from S3 to bypass strict CORS ETag limitations
        const listCommand = new ListPartsCommand({
           Bucket: bucketName,
           Key: reqKey,
           UploadId: uploadId
        });
        const listRes = await s3Client.send(listCommand);
        const actualParts = listRes.Parts?.map((p: any) => ({
           ETag: p.ETag,
           PartNumber: p.PartNumber
        })) || [];

        const command = new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: reqKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: actualParts },
        });
        await s3Client.send(command);
        return new Response(JSON.stringify({ success: true, key: reqKey }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Multipart: Abort
      if (action === 'abortMultipart') {
        const command = new AbortMultipartUploadCommand({
          Bucket: bucketName,
          Key: reqKey,
          UploadId: uploadId,
        });
        await s3Client.send(command);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Default: Single part presigned URL
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

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      return new Response(JSON.stringify({ url: uploadUrl, key }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
