import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { LambdaClient, InvokeCommand } from "https://esm.sh/@aws-sdk/client-lambda@3.451.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const body = await req.json()
    const { files, options } = body
    
    // Generate a unique export ID
    const exportId = crypto.randomUUID()
    const expectedZipKey = `exports/${exportId}.zip`

    const lambdaPayload = {
        files,
        options,
        exportId
    }

    // Invoke AWS Lambda Asynchronously so we don't hit edge function timeouts
    const lambda = new LambdaClient({
      region: Deno.env.get('AWS_REGION') ?? '',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '',
      }
    })

    const command = new InvokeCommand({
      FunctionName: 'sortana-export-zipper',
      InvocationType: 'Event', // Asynchronous execution
      Payload: new TextEncoder().encode(JSON.stringify(lambdaPayload))
    })

    await lambda.send(command)

    // Return the expected S3 Key immediately. Frontend will poll for its existence.
    return new Response(JSON.stringify({ s3Key: expectedZipKey, message: 'Export started' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
