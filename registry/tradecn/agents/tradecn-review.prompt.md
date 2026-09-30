---
name: tradecn-review
description: Review the screens a change touched against tradecn's contract and design rules, and write the findings as a change order.
argument-hint: The screens, panels or files to review
agent: agent
---

Review ${input:scope:the screens this change touched} against the tradecn skill.

1. Read [the skill](../skills/tradecn/SKILL.md) and [the review](../skills/tradecn/references/review.md).
2. From the diff and the request, list the screens and panels in scope, and say which ones you'll cover.
3. Run the app on test data. Run `checkContract` on each screen in light, dark and hyperlegible mode, through the project's end-to-end tests where they exist.
4. Take the screenshots the review asks for, and look at each one.
5. Walk the states, the keys, the numbers, color, density and speed.
6. Write the findings as a change order in the review's format, the most severe first, to the file the request names or in your reply.

Don't fix anything during the review unless asked. Report what you couldn't run or see as not verified.
