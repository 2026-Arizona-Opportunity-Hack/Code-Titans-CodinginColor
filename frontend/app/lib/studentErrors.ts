import { ApiError } from "./api/client";

/** Student-friendly wording for the errors the lesson endpoints can return (docs/api.md section 6). */
export function playerMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "ACTIVITY_LOCKED":
    case "MODULE_LOCKED":
      return "Finish the earlier steps first, then come back to this one.";
    case "RATE_LIMITED":
      return err.retryAfterSeconds ? `That was a lot of tries in a row. Wait ${err.retryAfterSeconds} seconds, then try again.` : "That was a lot of tries in a row. Wait a moment, then try again.";
    case "ASSESSMENT_ALREADY_SUBMITTED":
      return "You already handed in this test. It can only be done once.";
    case "NETWORK_ERROR":
      return "We can't reach the internet. Your answers are still here: check your connection and try again.";
    default:
      return err.message;
  }
}
