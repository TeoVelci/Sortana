import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const s3Client = new S3Client({ 
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'sortana-user-media';

async function listExports() {
    console.log("Listing exports in", BUCKET_NAME);
    const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: 'exports/'
    });

    const response = await s3Client.send(command);
    console.log("Exports:");
    if (!response.Contents) {
        console.log("No exports found");
        return;
    }

    for (const obj of response.Contents) {
        console.log(`- ${obj.Key} (${obj.Size} bytes)`);
    }

    if (response.Contents.length > 0) {
        // Download the last one to inspect it
        const latest = response.Contents.sort((a, b) => b.LastModified - a.LastModified)[0];
        console.log("Downloading", latest.Key);
        const getCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: latest.Key
        });
        const getRes = await s3Client.send(getCmd);
        const fileStream = fs.createWriteStream("test_download.zip");
        getRes.Body.pipe(fileStream);
        await new Promise(resolve => fileStream.on('finish', resolve));
        console.log("Downloaded successfully.");
    }
}

listExports().catch(console.error);
