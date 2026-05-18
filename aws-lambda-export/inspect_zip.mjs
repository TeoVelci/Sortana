import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import { pipeline } from 'stream/promises';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const s3 = new S3Client({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    try {
        const cmd = new ListObjectsV2Command({
            Bucket: process.env.AWS_BUCKET_NAME,
            Prefix: "exports/",
            MaxKeys: 5
        });
        const res = await s3.send(cmd);
        if (!res.Contents || res.Contents.length === 0) {
            console.log("No zip files found in exports/");
            return;
        }
        
        // get the latest file
        const latestFile = res.Contents.sort((a, b) => b.LastModified - a.LastModified)[0];
        console.log(`Found file: ${latestFile.Key} (${latestFile.Size} bytes)`);

        const getCmd = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: latestFile.Key
        });
        const getRes = await s3.send(getCmd);
        
        await pipeline(getRes.Body, fs.createWriteStream('test_download.zip'));
        console.log("Downloaded to test_download.zip");
    } catch (e) {
        console.error(e);
    }
}
run();
