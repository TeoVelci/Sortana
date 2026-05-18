import { LambdaClient, UpdateFunctionCodeCommand } from "@aws-sdk/client-lambda";
import fs from 'fs';
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
        const fileContent = fs.readFileSync('function.zip');
        const cmd = new UpdateFunctionCodeCommand({
            FunctionName: 'sortana-export-zipper',
            ZipFile: fileContent
        });
        const res = await lambda.send(cmd);
        console.log("Successfully updated function code!");
        console.log("Version:", res.Version);
        console.log("LastModified:", res.LastModified);
    } catch (e) {
        console.error("Error updating lambda:", e);
    }
}
run();
