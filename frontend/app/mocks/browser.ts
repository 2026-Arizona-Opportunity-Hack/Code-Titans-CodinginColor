import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { restoreAll, saveAll } from "./persist";

export const worker = setupWorker(...handlers);

// Load the saved fake data before each fake request and save the changes after it.
worker.events.on("request:start", restoreAll);
worker.events.on("response:mocked", saveAll);
