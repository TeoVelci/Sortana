import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Zip, ZipDeflate } from "https://cdn.skypack.dev/fflate?min"
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
      throw new Error("Empty payload");
    }

    const { files, zipName } = JSON.parse(payloadStr);

    if (!files || !Array.isArray(files)) {
      throw new Error("Missing or invalid files array");
    }

    const stream = new ReadableStream({
      start(controller) {
        const zip = new Zip();
        
        zip.ondata = (err, data, final) => {
          if (err) {
            controller.error(err);
          } else {
            controller.enqueue(data);
            if (final) {
              controller.close();
            }
          }
        };

        // Background worker to process files
        (async () => {
          try {
            for (const file of files) {
              if (file.name.endsWith('/')) {
                // Folder entry (using Unix os:3 to embed Unix permissions and MS-DOS attrs in upper bytes)
                const f = new ZipDeflate(file.name, { level: 1 });
                f.os = 3;
                f.attrs = (0o40755 << 16) | 0o10;
                f.mtime = new Date();
                zip.add(f);
                f.push(new Uint8Array(0), true);
              } else if (file.url) {
                const response = await fetch(file.url);
                if (response.ok && response.body) {
                  // Must use level > 0 (Deflate) and os:3 to explicitly declare as Unix with DOS fallback
                  const f = new ZipDeflate(file.name, { level: 1 });
                  f.os = 3;
                  f.attrs = (0o100644 << 16) | 0o0;
                  f.mtime = new Date();
                  zip.add(f);
                  
                  const reader = response.body.getReader();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                      f.push(new Uint8Array(0), true);
                      break;
                    }
                    if (value) {
                      f.push(value, false);
                    }
                    
                    // Simple backpressure: wait if the stream queue is full
                    while (controller.desiredSize !== null && controller.desiredSize <= 0) {
                      await new Promise(resolve => setTimeout(resolve, 10));
                    }
                  }
                } else {
                  console.error(`Failed to fetch ${file.url}: ${response.status}`);
                }
              } else if (file.content !== undefined) {
                const f = new ZipDeflate(file.name, { level: 1 });
                f.os = 3;
                f.attrs = (0o100644 << 16) | 0o0;
                f.mtime = new Date();
                zip.add(f);
                f.push(new TextEncoder().encode(file.content), true);
              }
            }
            zip.end();
          } catch (err) {
            controller.error(err);
          }
        })();
      }
    });
    
    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="${zipName || 'Sortana_Export.zip'}"`);

    return new Response(stream, { headers });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
