import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
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
        const cmd = new ListFunctionsCommand({});
        const res = await lambda.send(cmd);
        console.log("Functions:");
        res.Functions.forEach(f => console.log(f.FunctionName));
    } catch (e) {
        console.error(e);
    }
}
run();
