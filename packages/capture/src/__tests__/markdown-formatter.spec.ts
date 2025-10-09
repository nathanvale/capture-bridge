import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Markdown Formatter [AC02]', () => {
  const databases: Database.Database[] = []

  beforeEach(async () => {
    // Test setup
  })

  afterEach(async () => {
    // 5-step cleanup
    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const db of databases) {
      try {
        if (db.open) db.close()
      } catch {
        // Safe to ignore
      }
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should generate markdown with frontmatter and transcript', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    // Create captures table
    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        raw_content TEXT,
        content_hash TEXT,
        meta_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert test capture
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ1'
    const createdAt = '2025-10-09T21:00:00.000Z'
    const rawContent = 'Remember to buy groceries for the weekend party'
    const contentHash = 'abc123def456'

    db.prepare(`INSERT INTO captures (id, source, status, raw_content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      captureId,
      'voice',
      'transcribed',
      rawContent,
      contentHash,
      createdAt
    )

    // Import function under test
    const { formatMarkdown } = await import('../export/markdown-formatter.js')

    // Get capture
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
      id: string
      source: string
      raw_content: string
      content_hash: string
      created_at: string
    }

    // Format markdown
    const markdown = formatMarkdown(capture)

    // Verify frontmatter
    expect(markdown).toContain('---')
    expect(markdown).toContain(`id: ${captureId}`)
    expect(markdown).toContain(`source: voice`)
    expect(markdown).toContain(`captured_at: ${createdAt}`)
    expect(markdown).toContain(`content_hash: ${contentHash}`)

    // Verify transcript content
    expect(markdown).toContain(rawContent)

    // Verify structure (frontmatter at top, then content)
    const lines = markdown.split('\n')
    expect(lines[0]).toBe('---')
    expect(lines[lines.length - 1]).toBe('') // Trailing newline
  })

  it('should handle email source captures', async () => {
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        raw_content TEXT,
        content_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ2'
    const rawContent = 'Email body content here'

    db.prepare(`INSERT INTO captures (id, source, status, raw_content, content_hash) VALUES (?, ?, ?, ?, ?)`).run(
      captureId,
      'email',
      'transcribed',
      rawContent,
      'hash456'
    )

    const { formatMarkdown } = await import('../export/markdown-formatter.js')
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
      id: string
      source: string
      raw_content: string
      content_hash: string
      created_at: string
    }

    const markdown = formatMarkdown(capture)

    expect(markdown).toContain('source: email')
    expect(markdown).toContain(rawContent)
  })
})
