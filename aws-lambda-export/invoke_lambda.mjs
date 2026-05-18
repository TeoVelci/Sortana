import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const lambda = new LambdaClient({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    try {
        const payload = {
            exportId: "test-export-123",
            files: [
                {
                    s3Key: "proxies/1777713444771-C0241.mp4",
                    folderPath: "",
                    finalName: "test_video.mp4"
                }
            ],
            options: { format: "original", includeXmp: false }
        };
        const cmd = new InvokeCommand({
            FunctionName: 'sortana-export-zipper',
            InvocationType: 'RequestResponse', // synchronous to get error
            Payload: new TextEncoder().encode(JSON.stringify(payload))
        });
        const res = await lambda.send(cmd);
        console.log("Status:", res.StatusCode);
        if (res.FunctionError) {
            console.error("FunctionError:", res.FunctionError);
        }
        console.log("Payload:", new TextDecoder().decode(res.Payload));
    } catch (e) {
        console.error(e);
    }
}
run();
