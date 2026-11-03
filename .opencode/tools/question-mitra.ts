import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

const QuestionOption = z.object({
  label: z.string().describe("Display text (1-5 words, concise)"),
  description: z.string().describe("Explanation of this choice"),
})

const QuestionItem = z.object({
  question: z.string().describe("Complete question text to present to the user"),
  header: z.string().describe("Very short label (max 30 chars)"),
  options: z.array(QuestionOption).describe("Available choices for the user"),
  multiple: z.boolean().optional().describe("Allow selecting multiple choices (default: false)"),
})

export default tool({
  description:
    "MANDATORY interactive question tool. You MUST use this tool instead of listing options as plain text whenever: (1) the user asks you to choose between options, alternatives, or styles, (2) the user says 'give me options', 'which one', 'let me pick', 'send me choices', or similar, (3) you need any decision or preference from the user before proceeding, (4) there are multiple valid approaches and the user should decide. NEVER list options as numbered text in your response — ALWAYS use this tool to present them as an interactive card. The user will see a clickable card with your options and can select their preference. Wait for their response before continuing.",
  args: {
    questions: z.array(QuestionItem).describe("Questions to ask the user"),
  },
  async execute(args) {
    const requestId = crypto.randomUUID().slice(0, 12)
    const taskId = process.env.MITRA_TASK_ID ?? "unknown"
    const questionFile = path.join("/tmp", `mitra-question-${taskId}-${requestId}.json`)
    const responseFile = path.join("/tmp", `mitra-question-${taskId}-${requestId}-response.json`)

    fs.writeFileSync(
      questionFile,
      JSON.stringify({ requestId, questions: args.questions }, null, 2),
    )

    const POLL_INTERVAL_MS = 1000
    const TIMEOUT_MS = 120_000
    const start = Date.now()

    while (Date.now() - start < TIMEOUT_MS) {
      if (fs.existsSync(responseFile)) {
        try {
          const raw = fs.readFileSync(responseFile, "utf-8")
          const response = JSON.parse(raw)

          try { fs.unlinkSync(questionFile); fs.unlinkSync(responseFile) } catch {}

          const answers: string[][] = response.answers || []
          const formatted = args.questions
            .map((q, i) => `"${q.question}" = "${(answers[i] || []).join(", ")}"`)
            .join("; ")

          return `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`
        } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    try { fs.unlinkSync(questionFile) } catch {}
    return "The user did not respond within the timeout period. Continue without their input or ask the question as plain text in your response."
  },
})
