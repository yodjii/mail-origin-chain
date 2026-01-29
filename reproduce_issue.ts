
import { extractDeepestHybrid } from './src/index';

async function run() {
    const forward = `From: me@company.com\nSubject: Fwd: info\n\n---------- Forwarded message ---------\nFrom: sender@other.com\nSubject: info\n\nText`;
    console.log("Input:", JSON.stringify(forward));

    try {
        const result = await extractDeepestHybrid(forward);
        console.log("Result Diagnostics:", JSON.stringify(result.diagnostics, null, 2));
        console.log("History Length:", result.history.length);
        if (result.history.length > 0) {
            console.log("Deepest Level From:", JSON.stringify(result.history[0].from, null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
