import { TocoAPIError } from '../api/http.js';

/**
 * Wraps a tool handler to return a clean MCP error content block
 * instead of throwing and crashing the server.
 */
export async function withErrorHandling(
  fn: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    return await fn();
  } catch (err) {
    let message: string;

    if (err instanceof TocoAPIError) {
      message = `❌ Toco API Error: ${err.message}`;
      if (err.statusCode === 429) {
        message += '\n\n💡 Tip: Rate limited by Toco. Please wait a moment before retrying.';
      } else if (err.statusCode && err.statusCode >= 500) {
        message += '\n\n💡 Tip: Toco is having a temporary issue. Please retry shortly.';
      }
    } else if (err instanceof Error) {
      message = `❌ Error: ${err.message}`;
    } else {
      message = `❌ Unknown error occurred`;
    }

    return { content: [{ type: 'text', text: message }] };
  }
}

/** Truncate text to max chars */
export function truncate(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}
