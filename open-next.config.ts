import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every signed-in page renders per request, so no incremental (ISR) cache is configured.
export default defineCloudflareConfig({});
