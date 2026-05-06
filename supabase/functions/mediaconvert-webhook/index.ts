import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Received EventBridge Webhook:", JSON.stringify(body));

    // EventBridge passes the event body directly if configured, or wrapped in a structure.
    // MediaConvert COMPLETE events look like:
    // { "detail-type": "MediaConvert Job State Change", "detail": { "status": "COMPLETE", "outputGroupDetails": [...] } }
    
    if (body['detail-type'] !== 'MediaConvert Job State Change') {
        return new Response(JSON.stringify({ message: "Ignored non-mediaconvert event" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    const detail = body.detail;
    if (detail.status !== 'COMPLETE') {
        return new Response(JSON.stringify({ message: `Ignored status: ${detail.status}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // Extract the S3 output path
    const outputGroup = detail.outputGroupDetails?.[0];
    const outputFilePaths = outputGroup?.outputDetails?.[0]?.outputFilePaths;
    
    if (!outputFilePaths || outputFilePaths.length === 0) {
         return new Response(JSON.stringify({ error: "No output file paths found" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }

    const s3Path = outputFilePaths[0]; // e.g. "s3://sortana-app-storage/proxies/1777704108326-test-full.mp4"
    
    // We just want the path part: "proxies/1777704108326-test-full.mp4"
    const pathParts = s3Path.split('sortana-app-storage/');
    if (pathParts.length < 2) {
        return new Response(JSON.stringify({ error: "Could not parse bucket from S3 path" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }

    const proxyS3Key = pathParts[1]; 
    
    // The original file is in "uploads/". The proxy is in "proxies/". They share the same base timestamp-name
    const filename = proxyS3Key.split('/').pop() || '';
    
    // The filename format is timestamp-originalName. We can reliably match on the timestamp.
    // e.g. 1777704108326-test-full.mp4 -> 1777704108326
    const timestamp = filename.split('-')[0];

    // Update Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // We need service role key to bypass RLS for webhook
    );

    console.log(`Looking for file matching timestamp: ${timestamp} to set proxyS3Key: ${proxyS3Key}`);

    // Fetch the matching item
    const { data: items, error: searchError } = await supabaseClient
      .from('items')
      .select('*')
      .like('s3_key', `%${timestamp}%`);

    if (searchError) {
        console.error("Search error:", searchError);
        throw searchError;
    }

    if (!items || items.length === 0) {
        console.log("No matching file found in database for", filenameWithoutExt);
        return new Response(JSON.stringify({ message: "No matching file found" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    const fileItem = items[0];
    
    // Update it
    const { error: updateError } = await supabaseClient
        .from('items')
        .update({ 
            proxy_s3_key: proxyS3Key, 
            description: fileItem.description?.replace('Generating proxy...', '') || '',
            is_analyzing: false 
        })
        .eq('id', fileItem.id);

    if (updateError) {
         console.error("Update error:", updateError);
         throw updateError;
    }

    console.log("Successfully updated proxyS3Key!");

    return new Response(JSON.stringify({ message: "Success" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
