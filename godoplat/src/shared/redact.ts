/**
 * Secret redaction for anything that might be surfaced to the UI or logs.
 *
 * The worker streams container stdout/stderr into `logTail`, which the frontend
 * displays. A hostile prompt could try to coax the agent into echoing its
 * environment, so we scrub known key shapes before storing the tail. Cheap,
 * defensive, and correct even though the local single-user model makes a leak
 * low-impact.
 */

const REPLACEMENT = "***REDACTED***";

// Anthropic keys look like `sk-ant-...`. Match the prefix + the token body.
const ANTHROPIC_KEY = /sk-ant-[A-Za-z0-9\-_]{8,}/g;

/**
 * Redact secrets from a line of text.
 *
 * @param text  the text to scrub
 * @param extra one or more exact secret strings to also remove (e.g. the
 *              caller's actual API key, so even a non-standard/proxy key shape
 *              gets masked).
 */
export function redact(text: string, ...extra: Array<string | undefined>): string {
  let out = text.replace(ANTHROPIC_KEY, `sk-ant-${REPLACEMENT}`);
  for (const secret of extra) {
    if (secret && secret.length >= 8) {
      out = out.split(secret).join(REPLACEMENT);
    }
  }
  return out;
}
