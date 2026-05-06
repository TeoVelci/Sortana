import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

async function run() {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const command = new ListObjectsV2Command({
    Bucket: process.env.AWS_BUCKET_NAME,
    Prefix: 'uploads/'
  });

  const response = await s3Client.send(command);
  console.log("Files in bucket:");
  if (response.Contents) {
    for (const item of response.Contents) {
      console.log(`- ${item.Key} (${item.Size} bytes)`);
    }
  } else {
    console.log("Empty.");
  }
}

run();
