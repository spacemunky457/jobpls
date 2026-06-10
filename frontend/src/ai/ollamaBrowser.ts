// Browser-driven local Ollama. A hosted backend can't reach the user's localhost,
// so the model runs here in the browser and results are posted back to the API.
// The user must start Ollama with the web app origin allowed, e.g.:
//   OLLAMA_ORIGINS=http://localhost:5173 ollama serve

export function ollamaBaseUrl(): string {
  return localStorage.getItem('jobpls_ollama_url') || 'http://localhost:11434'
}
export function ollamaModel(): string {
  return localStorage.getItem('jobpls_ollama_model') || 'llama3.2'
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${ollamaBaseUrl()}/api/tags`)
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const data = await res.json()
  return (data.models || []).map((m: { name: string }) => m.name)
}

export async function chat(prompt: string, json = true): Promise<string> {
  const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel(),
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: json ? 'json' : undefined,
      // Ollama defaults to a 2048-token context, which truncates a full CV +
      // job description on input and leaves no room to generate — tailored CVs
      // came out as stubs. Give it a real window and room to write.
      options: { temperature: json ? 0.1 : 0.4, num_ctx: 8192, num_predict: 2048 },
    }),
  })
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`)
  const data = await res.json()
  return data.message?.content || ''
}

// Run a set of prepared prompts sequentially, reporting progress.
export async function runTasks(
  tasks: { job_id: number; prompt: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ job_id: number; raw: string }[]> {
  const results: { job_id: number; raw: string }[] = []
  for (let i = 0; i < tasks.length; i++) {
    try {
      const raw = await chat(tasks[i].prompt, true)
      results.push({ job_id: tasks[i].job_id, raw })
    } catch {
      // skip failures; they stay unscored and can be retried
    }
    onProgress?.(i + 1, tasks.length)
  }
  return results
}
