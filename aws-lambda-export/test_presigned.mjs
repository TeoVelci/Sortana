import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config({ path: '../.env' });

const s3Client = new S3Client({ 
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'sortana-app-storage';

async function testDownload() {
    const key = "exports/test-export-123.zip";
    console.log("Generating presigned URL for", key);
    
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log("URL:", url);
    
    console.log("Downloading via fetch...");
    const res = await fetch(url);
    if (!res.ok) {
        console.error("Fetch failed:", res.status, res.statusText);
        const text = await res.text();
        console.error(text);
        return;
    }
    
    const dest = fs.createWriteStream("test_presigned.zip");
    res.body.pipe(dest);
    await new Promise(r => dest.on('finish', r));
    
    console.log("Download complete!");
}

testDownload().catch(console.error);
