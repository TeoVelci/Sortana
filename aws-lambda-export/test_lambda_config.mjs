import { LambdaClient, GetFunctionConfigurationCommand } from "@aws-sdk/client-lambda";
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
    const cmd = new GetFunctionConfigurationCommand({ FunctionName: 'sortana-export-zipper' });
    const res = await lambda.send(cmd);
    console.log("Memory:", res.MemorySize, "Timeout:", res.Timeout);
}
run();
