import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { LambdaClient, InvokeCommand } from "npm:@aws-sdk/client-lambda@3.1048.0"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let payloadStr: string | null = null;
    
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const body = await req.json();
        payloadStr = JSON.stringify(body);
    } else {
        const formData = await req.formData();
        payloadStr = formData.get('payload') as string;
    }

    if (!payloadStr) {
      throw new Error("Empty payload");
    }

    const { files, zipName, options, userId } = JSON.parse(payloadStr);

    if (!files || !Array.isArray(files)) {
      throw new Error(`Missing or invalid files array. Payload received: ${Object.keys(JSON.parse(payloadStr)).join(', ')}`);
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // We can use the passed userId or get it securely from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      throw new Error(`Auth Error: ${authError.message}`);
    }

    const finalUserId = user?.id || userId;

    if (!finalUserId) {
        throw new Error("User not authenticated and no userId provided");
    }

    // Insert job into export_jobs table
    const { data: job, error: insertError } = await supabase
        .from('export_jobs')
        .insert({
            user_id: finalUserId,
            status: 'pending',
            total_files: files.length
        })
        .select()
        .single();

    if (insertError) {
        throw new Error(`Failed to create export job: ${insertError.message} | Details: ${insertError.details} | Hint: ${insertError.hint}`);
    }

    // Trigger AWS Lambda asynchronously
    try {
        const lambdaClient = new LambdaClient({
            region: Deno.env.get('AWS_REGION') || 'us-east-2',
            credentials: {
                accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
                secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || ''
            }
        });

        const invokeCmd = new InvokeCommand({
            FunctionName: 'sortana-export-zipper',
            InvocationType: 'Event', // Asynchronous execution
            Payload: new TextEncoder().encode(JSON.stringify({
                exportId: job.id,
                files: files,
                options: options || {},
                zipName: zipName || 'Sortana_Export.zip'
            }))
        });

        await lambdaClient.send(invokeCmd);
    } catch (lambdaError) {
        throw new Error(`Failed to invoke AWS Lambda: ${lambdaError.message}`);
    }

    return new Response(JSON.stringify({ message: "Export job started", exportId: job.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
    });

  } catch (error) {
    console.error("Export-Zip Edge Function Error:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
