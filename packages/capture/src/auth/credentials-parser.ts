import { readFile, stat } from 'node:fs/promises'

import { z } from 'zod'

// Zod schema for Gmail credentials from Google Cloud Console
const gmailCredentialsSchema = z.object({
  installed: z.object({
    client_id: z.string().min(1, 'client_id cannot be empty'),
    client_secret: z.string().min(1, 'client_secret cannot be empty'),
    redirect_uris: z.array(z.string()).min(1, 'redirect_uris must have at least one URI'),
    auth_uri: z.string().min(1, 'auth_uri cannot be empty'),
    token_uri: z.string().min(1, 'token_uri cannot be empty'),
  }),
})

export type GmailCredentials = z.infer<typeof gmailCredentialsSchema>

export const loadCredentials = async (path: string): Promise<GmailCredentials> => {
  // Check file exists and permissions
  await checkFilePermissions(path)

  // Read and parse JSON
  let rawContent: string
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is user-provided config path
    rawContent = await readFile(path, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `File not found: ${path} (credentials.json)\n` +
          `\nTo fix: Download credentials.json from Google Cloud Console and save to ${path}\n` +
          `See: docs/guides/guide-gmail-oauth2-setup.md`
      )
    }
    throw error
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch {
    throw new Error(
      `Invalid JSON in credentials file: ${path}\n` +
        `\nTo fix: Ensure the file contains valid JSON from Google Cloud Console`
    )
  }

  // Validate structure with Zod
  validateCredentials(parsed)

  return parsed
}

export const validateCredentials: (
  credentials: unknown
) => asserts credentials is GmailCredentials = (credentials) => {
  const result = gmailCredentialsSchema.safeParse(credentials)

  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `  - ${String(err.path.join('.'))}: ${err.message}`)
      .join('\n')

    throw new Error(
      `Invalid credentials.json structure:\n${errors}\n` +
        `\nExpected structure:\n` +
        `{\n` +
        `  "installed": {\n` +
        `    "client_id": "...",\n` +
        `    "client_secret": "...",\n` +
        `    "redirect_uris": ["http://localhost"],\n` +
        `    "auth_uri": "https://...",\n` +
        `    "token_uri": "https://..."\n` +
        `  }\n` +
        `}`
    )
  }
}

export const checkFilePermissions = async (path: string): Promise<void> => {
  let stats
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is user-provided config path
    stats = await stat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${path} (credentials.json)`)
    }
    throw error
  }

  const mode = stats.mode & Number.parseInt('777', 8)

  if (mode !== 0o600) {
    throw new Error(`Insecure file permissions: ${mode.toString(8)} (expected 0600)`)
  }
}
