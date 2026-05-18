async function run() {
    const res = await fetch("https://fkayfefyndhdxfnnquia.supabase.co/functions/v1/check-export-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "exports/does-not-exist.zip" })
    });
    console.log("Status:", res.status);
    console.log("Body:", await res.text());
}
run();
