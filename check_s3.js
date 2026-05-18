const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config({ path: 'supabase/.env' });

const s3 = new S3Client({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    const cmd = new HeadObjectCommand({
        Bucket: "sortana-video-storage",
        Key: "exports/Sortana_Export_1779027323222.zip" // wait I don't know the exact key, let's list the prefix
    });
    // Let's use ListObjectsV2 to find the exports
}
