import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import sharp from 'sharp';
import { PassThrough } from 'stream';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.AWS_BUCKET_NAME;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Generate SVG string for watermark
function getWatermarkSvg(text, width, height, opacity, position) {
    const fontSize = Math.max(24, width * 0.03);
    const padding = fontSize;
    
    // Position logic for SVG
    let x, y, textAnchor, alignmentBaseline;
    
    if (position === 'center') {
        x = '50%';
        y = '50%';
        textAnchor = 'middle';
        alignmentBaseline = 'middle';
    } else if (position === 'bottom-left') {
        x = padding;
        y = height - padding;
        textAnchor = 'start';
        alignmentBaseline = 'baseline';
    } else { // bottom-right
        x = width - padding;
        y = height - padding;
        textAnchor = 'end';
        alignmentBaseline = 'baseline';
    }

    return `
        <svg width="${width}" height="${height}">
            <style>
                .title { 
                    fill: rgba(255, 255, 255, ${opacity}); 
                    font-size: ${fontSize}px; 
                    font-family: sans-serif;
                    font-weight: bold;
                    filter: drop-shadow(2px 2px 8px rgba(0,0,0,0.8));
                }
            </style>
            <text x="${x}" y="${y}" class="title" text-anchor="${textAnchor}" alignment-baseline="${alignmentBaseline}">${text}</text>
        </svg>
    `;
}

async function updateSupabaseJob(exportId, status, s3Key) {
    if (!SUPABASE_URL || !exportId) {
        console.log("Skipping Supabase update, missing URL or exportId", { SUPABASE_URL, exportId });
        return;
    }
    try {
        console.log(`Updating Supabase job ${exportId} to ${status}`);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/export_jobs?id=eq.${exportId}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                status,
                ...(s3Key && { s3_key: s3Key })
            })
        });
        if (!res.ok) {
            console.error('Failed to update Supabase:', await res.text());
        } else {
            console.log('Successfully updated Supabase job:', exportId, 'to', status);
        }
    } catch (err) {
        console.error('Error updating Supabase:', err);
    }
}

export const handler = async (event) => {
    let exportId;
    try {
        console.log("Received event:", JSON.stringify(event));
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event;
        const { files, options } = body;
        exportId = body.exportId;

        if (!files || files.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No files provided" }) };
        }

        const zipKey = `exports/${exportId || Date.now()}.zip`;

        // Create streams
        const passThrough = new PassThrough();
        
        // Use zlib level 1 (fastest compression)
        // Compression prevents the Apple Archive Utility Error 79 (Store + Data Descriptor) bug!
        const archive = archiver('zip', { zlib: { level: 1 } });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(passThrough);

        const upload = new Upload({
            client: s3,
            params: {
                Bucket: BUCKET,
                Key: zipKey,
                Body: passThrough,
                ContentType: 'application/zip',
            },
        });

        const uploadPromise = upload.done();

        // Process files
        for (const file of files) {
            console.log(`Processing file: ${file.finalName}`);
            
            const getObjCmd = new GetObjectCommand({ Bucket: BUCKET, Key: file.s3Key });
            const s3Response = await s3.send(getObjCmd);
            
            const isImage = file.s3Key.match(/\.(jpg|jpeg|png|webp|avif)$/i);
            const needsWatermark = options.watermark?.enabled && isImage;
            const needsConversion = options.format !== 'original' && isImage;

            let fileStream = s3Response.Body;
            let streamToAwait = fileStream;

            if (needsWatermark || needsConversion) {
                let pipeline = sharp();
                
                if (needsWatermark) {
                    const buffer = await streamToBuffer(fileStream);
                    const metadata = await sharp(buffer).metadata();
                    
                    const svg = getWatermarkSvg(
                        options.watermark.text, 
                        metadata.width || 1000, 
                        metadata.height || 1000, 
                        options.watermark.opacity, 
                        options.watermark.position
                    );
                    
                    pipeline = sharp(buffer).composite([{ input: Buffer.from(svg) }]);
                } else {
                    fileStream.pipe(pipeline);
                }

                if (options.format === 'png') {
                    pipeline = pipeline.png();
                } else {
                    pipeline = pipeline.jpeg({ quality: 90 });
                }

                streamToAwait = pipeline;
                archive.append(pipeline, { name: file.folderPath + file.finalName });
            } else {
                archive.append(fileStream, { name: file.folderPath + file.finalName });
            }

            // We must wait for the current stream to finish appending to prevent 
            // AWS SDK from opening 41 concurrent S3 requests that might timeout.
            // When appending a stream to Archiver, we can wait for the stream to end
            // OR we can just wait for the original stream to end if it's not piped.
            // Archiver will consume it, so listening to 'end' on streamToAwait works,
            // but for Sharp pipelines, it might be 'finish'.
            await new Promise((resolve, reject) => {
                const onEnd = () => { cleanup(); resolve(); };
                const onError = (e) => { cleanup(); reject(e); };
                const cleanup = () => {
                    streamToAwait.removeListener('end', onEnd);
                    streamToAwait.removeListener('finish', onEnd);
                    streamToAwait.removeListener('close', onEnd);
                    streamToAwait.removeListener('error', onError);
                };
                streamToAwait.on('end', onEnd);
                streamToAwait.on('finish', onEnd);
                streamToAwait.on('close', onEnd);
                streamToAwait.on('error', onError);
            });
        }

        if (options.includeXmp) {
            for (const file of files) {
                if (file.xmpString) {
                    const xmpName = file.finalName.substring(0, file.finalName.lastIndexOf('.')) + '.xmp';
                    archive.append(file.xmpString, { name: file.folderPath + xmpName });
                }
            }
        }

        console.log("Finalizing archive...");
        await archive.finalize();
        
        console.log("Waiting for upload to finish...");
        await uploadPromise;
        console.log("Upload finished!");

        await updateSupabaseJob(exportId, 'completed', zipKey);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Export complete", s3Key: zipKey })
        };

    } catch (err) {
        console.error(err);
        await updateSupabaseJob(exportId, 'failed');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};

async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}
