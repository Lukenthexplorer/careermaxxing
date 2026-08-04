import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FEEDBACK_LABEL = "feedback";
const ISSUE_TITLE_PREFIX = "[não relevante] ";

// Reads past "não relevante" feedback from GitHub Issues so the classifier
// can be steered away from repeating the same kind of miss. Fails open
// (returns []) if `gh` isn't available/authenticated — feedback is a nice-to-have,
// not a pipeline dependency.
export async function getDislikedTitles(repoSlug, limit = 20) {
  try {
    const { stdout } = await execFileAsync("gh", [
      "issue",
      "list",
      "--repo",
      repoSlug,
      "--label",
      FEEDBACK_LABEL,
      "--state",
      "all",
      "--limit",
      String(limit),
      "--json",
      "title",
    ]);
    const issues = JSON.parse(stdout);
    return issues
      .map((issue) => issue.title)
      .filter((title) => title.startsWith(ISSUE_TITLE_PREFIX))
      .map((title) => title.slice(ISSUE_TITLE_PREFIX.length));
  } catch {
    return [];
  }
}

export function buildFeedbackLink(repoSlug, item) {
  const params = new URLSearchParams({
    title: `${ISSUE_TITLE_PREFIX}${item.title}`,
    body: item.url,
    labels: FEEDBACK_LABEL,
  });
  return `https://github.com/${repoSlug}/issues/new?${params.toString()}`;
}
