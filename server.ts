
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- AWS S3 Client Setup ---
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const BUCKET_NAME = process.env.AWS_BUCKET_NAME || '';

  // --- Middleware ---
  app.use(express.json());

  // --- API Routes ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Generate Video Proxy (H.264 720p)
  app.post('/api/generate-proxy', async (req, res) => {
    let tempInput = '';
    let tempOutput = '';
    try {
      const { key } = req.body;
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Key is required' });
      }

      tempInput = path.join(os.tmpdir(), `input-${Date.now()}-${path.basename(key)}`);
      tempOutput = path.join(os.tmpdir(), `proxy-${Date.now()}-${path.basename(key)}.mp4`);

      // 1. Download from S3
      const getCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
      const response = await s3Client.send(getCommand);
      const stream = response.Body as Readable;
      const writeStream = fs.createWriteStream(tempInput);
      
      await pipeline(stream, writeStream);

      // 2. Run FFmpeg to create a lightweight proxy
      // We use ultrafast preset for faster generation and less timeout risk
      await new Promise((resolve, reject) => {
        const command = ffmpeg(tempInput)
          .videoFilters('scale=1280:-2') // Maintain aspect ratio, width 1280, height divisible by 2
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions([
            '-preset ultrafast',
            '-crf 28',
            '-movflags +faststart',
            '-pix_fmt yuv420p' // Ensure compatibility
          ])
          .on('start', (cmd) => console.log('FFmpeg started:', cmd))
          .on('end', resolve)
          .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
          });
        
        // Set a timeout of 5 minutes for proxy generation
        const timeout = setTimeout(() => {
          command.kill('SIGKILL');
          reject(new Error('FFmpeg timed out after 5 minutes'));
        }, 300000);

        command.on('end', () => clearTimeout(timeout));
        command.on('error', () => clearTimeout(timeout));
        
        command.save(tempOutput);
      });

      // 3. Upload Proxy back to S3
      const proxyKey = `${key}.proxy.mp4`;
      const fileBuffer = fs.readFileSync(tempOutput);
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: proxyKey,
        Body: fileBuffer,
        ContentType: 'video/mp4',
      });
      await s3Client.send(putCommand);

      res.json({ proxyKey });
    } catch (error) {
      console.error('Proxy generation failed:', error);
      res.status(500).json({ error: 'Failed to generate proxy' });
    } finally {
      // 4. Cleanup temp files
      try {
        if (tempInput && fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (tempOutput && fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }
  });

  // Generate Presigned URL for Upload
  app.post('/api/upload-url', async (req, res) => {
    try {
      const { filename, filetype } = req.body;
      
      if (!filename || !filetype) {
        return res.status(400).json({ error: 'Filename and filetype are required' });
      }

      const key = `uploads/${Date.now()}-${filename}`;
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: filetype,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      res.json({ url, key });
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Generate Presigned URL for Download/View
  app.get('/api/file-url', async (req, res) => {
    try {
      const { key } = req.query;
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Key is required' });
      }

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      res.json({ url });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  // Redirect to Presigned URL for direct usage in <img> tags
  app.get('/api/file-view', async (req, res) => {
    try {
      const { key } = req.query;
      if (!key || typeof key !== 'string') {
        return res.status(400).send('Key is required');
      }

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      res.redirect(url);
    } catch (error) {
      console.error('Error generating view URL:', error);
      res.status(500).send('Failed to generate view URL');
    }
  });

  // --- Vite Middleware (Dev) or Static Files (Prod) ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist/
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*all', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
