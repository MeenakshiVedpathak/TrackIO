// Formats the `answer` object returned by POST /api/v1/ai/query
// ({ summary, findings, actions, priority }) into the markdown subset
// MarkdownLite understands. Pure/no I/O — the actual request lives in
// useAICopilot.js so this stays trivially testable.

export const formatAnswerAsMarkdown = (answer) => {
  if (!answer?.summary) {
    return "Sorry, I couldn't get an answer for that.";
  }

  const parts = [answer.summary];

  if (answer.findings?.length) {
    parts.push(`**Findings:**\n${answer.findings.map((f) => `- ${f}`).join('\n')}`);
  }
  if (answer.actions?.length) {
    parts.push(`**Recommended actions:**\n${answer.actions.map((a) => `- ${a}`).join('\n')}`);
  }

  return parts.join('\n\n');
};

export const formatGreetingMarkdown = (displayName, answer) =>
  `Hi ${displayName},\n\n${formatAnswerAsMarkdown(answer)}`;
