async function run() {
    const publicUrl = "https://fkayfefyndhdxfnnquia.supabase.co/functions/v1/get-aws-presigned-url?key=exports/test.zip";
    const res = await fetch(publicUrl, { method: 'HEAD' });
    console.log("Status:", res.status);
    console.log("OK:", res.ok);
}
run();
