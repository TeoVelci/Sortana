import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
            MaxKeys: 5
        });
        const res = await s3.send(cmd);
        if (!res.Contents) {
            console.log("Bucket is completely empty.");
            return;
        }
        for (const item of res.Contents) {
            console.log(item.Key, item.Size);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
