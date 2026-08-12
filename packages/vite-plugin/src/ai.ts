import { Agent } from '@cursor/sdk'
import type { DesignerAiRequest } from '@vue-designer/shared'

export interface CursorAiOptions {
  apiKey?: string
  model?: string
}

export function extractVueSource(result: string): string {
  const matches = [...result.matchAll(/```vue\s*\r?\n([\s\S]*?)\r?\n```/g)]
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error('Cursor did not return exactly one Vue source block')
  }
  return matches[0][1]
}

export async function generateVueSource(
  request: DesignerAiRequest,
  root: string,
  options: CursorAiOptions,
): Promise<string> {
  const apiKey = options.apiKey ?? process.env.CURSOR_API_KEY
  if (!apiKey) throw new Error('CURSOR_API_KEY is required to use AI editing')

  const result = await Agent.prompt(`You are editing a Vue Single-File Component in a visual designer.
Apply the user's request to the complete current source below. Focus on the selected source, but make any related changes elsewhere in the SFC that are required for a correct implementation.
Use the read, glob, and grep tools when project context would help. Do not modify files, describe the change, or return a patch. Preserve unrelated code and formatting. Return exactly one complete Vue SFC in a single \`\`\`vue code fence with no text outside it.

Document: ${request.path}
Selected node id: ${request.selection.nodeId}
Selected source range: ${request.selection.range.start}-${request.selection.range.end}
User request:
${request.prompt}

Selected source:
<selected-source>
${request.selection.source}
</selected-source>

Complete current SFC:
<current-source>
${request.source}
</current-source>`, {
    apiKey,
    model: { id: options.model ?? 'composer-2.5' },
    tools: ['read', 'glob', 'grep'],
    local: { cwd: root },
  })

  if (result.status !== 'finished') throw new Error(result.error?.message ?? 'Cursor agent did not finish')
  return extractVueSource(result.result ?? '')
}
