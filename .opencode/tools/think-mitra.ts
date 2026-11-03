import { tool } from "@opencode-ai/plugin"
import { z } from "zod"

export default tool({
  description:
    "Use this tool to think through your approach before taking action. Call it whenever you need to plan, reason about a problem, or organize your thoughts. The user will see your thinking process in real-time. This is a lightweight tool — call it frequently.",
  args: {
    title: z.string().describe("Short title for what you're thinking about (3-8 words, e.g. 'Planning component structure')"),
    content: z.string().describe("Your detailed reasoning, analysis, or plan. Be thorough."),
  },
  async execute(args) {
    return `Thought recorded: ${args.title}`
  },
})
