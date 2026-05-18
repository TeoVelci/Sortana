const { CloudWatchLogsClient, FilterLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");
require('dotenv').config({ path: 'supabase/.env' });

const client = new CloudWatchLogsClient({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function run() {
    const command = new FilterLogEventsCommand({
        logGroupName: "/aws/lambda/sortana-export-zipper",
        startTime: Date.now() - 1000 * 60 * 60, // last hour
    });
    const response = await client.send(command);
    response.events.forEach(e => console.log(e.message));
}
run().catch(console.error);
