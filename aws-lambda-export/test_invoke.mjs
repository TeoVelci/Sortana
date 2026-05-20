import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const lambda = new LambdaClient({ 
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    const cmd = new InvokeCommand({
        FunctionName: 'sortana-export-zipper',
        InvocationType: 'RequestResponse', // Synchronous to get the error!
        Payload: new TextEncoder().encode(JSON.stringify({
            exportId: 'test-id',
            files: [],
            options: {},
            zipName: 'test.zip'
        }))
    });
    try {
        const res = await lambda.send(cmd);
        console.log("Status:", res.StatusCode);
        if (res.FunctionError) {
            console.log("Function Error:", res.FunctionError);
        }
        if (res.Payload) {
            console.log("Payload:", new TextDecoder().decode(res.Payload));
        }
    } catch (e) {
        console.error("Invoke Error:", e);
    }
}
run();
