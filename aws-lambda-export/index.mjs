import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough } from 'stream';
import { ZipArchive } from 'archiver';
import sharp from 'sharp';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.AWS_BUCKET_NAME;

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

export const handler = async (event) => {
    try {
        console.log("Received event:", JSON.stringify(event));
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event;
        const { files, options, exportId } = body;

        if (!files || files.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "No files provided" }) };
        }

        const zipKey = `exports/${exportId || Date.now()}.zip`;

        // Create streams
        const passThrough = new PassThrough();
        const archive = new ZipArchive({ zlib: { level: 9 }, forceZip64: false, forceLocalTime: true });

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

            // Await the stream to finish before fetching the next file
            // This prevents opening 20 concurrent S3 sockets which would timeout
            await new Promise((resolve, reject) => {
                streamToAwait.on('end', resolve);
                streamToAwait.on('close', resolve);
                streamToAwait.on('error', reject);
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

        await archive.finalize();
        await uploadPromise;

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Export complete", s3Key: zipKey })
        };

    } catch (err) {
        console.error(err);
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
