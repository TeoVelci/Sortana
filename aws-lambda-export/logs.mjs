import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = new CloudWatchLogsClient({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    try {
        const cmd = new FilterLogEventsCommand({
            logGroupName: "/aws/lambda/sortana-export-zipper",
            startTime: Date.now() - 15 * 60 * 1000, // last 15 minutes
            limit: 50
        });
        const res = await client.send(cmd);
        if (res.events.length === 0) {
            console.log("No logs found in the last 15 minutes.");
        }
        for (const ev of res.events) {
            console.log(ev.timestamp, ev.message.trim());
        }
    } catch (e) {
        console.error("Error fetching logs:", e);
    }
}
run();
