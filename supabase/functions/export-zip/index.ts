import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { downloadZip } from "https://cdn.jsdelivr.net/npm/client-zip/index.js"

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
    
    // Support both application/json and form-data/urlencoded
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const body = await req.json();
        payloadStr = JSON.stringify(body);
    } else {
        const formData = await req.formData();
        payloadStr = formData.get('payload') as string;
    }

    if (!payloadStr) {
      throw new Error("Missing payload");
    }

    const { files, zipName } = JSON.parse(payloadStr);

    if (!files || !Array.isArray(files)) {
      throw new Error("Missing or invalid files array");
    }

    async function* getFiles() {
      for (const file of files) {
        if (file.url) {
          const response = await fetch(file.url);
          if (response.ok && response.body) {
            yield { name: file.name, lastModified: new Date(), input: response.body };
          } else {
            console.error(`Failed to fetch ${file.url}: ${response.status}`);
          }
        } else if (file.content) {
            yield { name: file.name, lastModified: new Date(), input: file.content };
        }
      }
    }

    const response = downloadZip(getFiles());
    
    // Ensure the response is treated as a downloadable attachment
    const headers = new Headers(response.headers);
    headers.set('Content-Disposition', `attachment; filename="${zipName || 'Sortana_Export.zip'}"`);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      headers,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
