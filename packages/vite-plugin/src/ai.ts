import { Agent } from '@cursor/sdk'

export interface CursorAiOptions {
  apiKey?: string
  model?: string
}

export async function runAiPrompt(
  prompt: string,
  root: string,
  options: CursorAiOptions,
): Promise<string> {
  const apiKey = options.apiKey ?? process.env.CURSOR_API_KEY
  if (!apiKey) throw new Error('CURSOR_API_KEY is required to use AI editing')

  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: options.model ?? 'composer-2.5' },
    tools: ['read', 'glob', 'grep'],
    local: { cwd: root },
  })

  if (result.status !== 'finished') throw new Error(result.error?.message ?? 'Cursor agent did not finish')
  return result.result ?? ''
}
