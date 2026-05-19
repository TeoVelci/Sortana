import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const cw = new CloudWatchLogsClient({ 
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    const cmd = new FilterLogEventsCommand({
        logGroupName: '/aws/lambda/sortana-export-zipper',
        startTime: Date.now() - 15 * 60 * 1000, // last 15 minutes
    });
    const res = await cw.send(cmd);
    for (const e of res.events) {
        console.log(e.timestamp, e.message.trim());
    }
}
run();
