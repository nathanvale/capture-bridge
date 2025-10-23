import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Email Normalization - AC01: Strip HTML Tags', () => {
  describe('stripHtmlTags', () => {
    it('should strip simple HTML tags', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '<p>Hello</p>'
      const result = stripHtmlTags(input)

      expect(result).toBe('Hello')
    })

    it('should strip nested HTML tags', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '<div><p>Content</p></div>'
      const result = stripHtmlTags(input)

      expect(result).toBe('Content')
    })

    it('should decode HTML entities', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '&nbsp;&amp;&lt;&gt;&quot;'
      const result = stripHtmlTags(input)

      expect(result).toBe(' &<>"')
    })

    it('should remove script and style tags completely', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '<script>alert("xss")</script><p>Text</p><style>body{color:red}</style>'
      const result = stripHtmlTags(input)

      expect(result).toBe('Text')
    })

    it('should preserve whitespace in text content', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '<p>Multiple   spaces</p>'
      const result = stripHtmlTags(input)

      expect(result).toBe('Multiple   spaces')
    })

    it('should handle malformed HTML with unclosed tags', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '<div><p>Unclosed paragraph'
      const result = stripHtmlTags(input)

      expect(result).toBe('Unclosed paragraph')
    })

    it('should handle empty string', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const result = stripHtmlTags('')

      expect(result).toBe('')
    })

    it('should handle plain text without HTML', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = 'Just plain text'
      const result = stripHtmlTags(input)

      expect(result).toBe('Just plain text')
    })

    it('should handle complex HTML email structure', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = `
        <html>
          <head><title>Email</title></head>
          <body>
            <h1>Hello World</h1>
            <p>This is a <strong>test</strong> email.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `
      const result = stripHtmlTags(input)

      // Should extract all text content, preserving natural spacing
      expect(result).toContain('Hello World')
      expect(result).toContain('This is a test email.')
      expect(result).toContain('Item 1')
      expect(result).toContain('Item 2')
    })

    it('should prevent XSS payload from being executed', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const xssPayload = '<img src=x onerror="alert(1)">'
      const result = stripHtmlTags(xssPayload)

      // Should not contain any executable code
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).not.toContain('onerror')
      expect(result).not.toContain('alert')
    })

    it('should handle typical email body in under 1ms', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      // Generate ~5KB HTML email
      const largeHtml = '<div>' + '<p>Content line</p>'.repeat(200) + '</div>'

      const start = performance.now()
      stripHtmlTags(largeHtml)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1) // < 1ms per typical email body
    })

    it('should handle HTML with line breaks and preserve text flow', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const input = '<p>First line</p>\n<p>Second line</p>'
      const result = stripHtmlTags(input)

      expect(result).toContain('First line')
      expect(result).toContain('Second line')
    })

    it('should decode numeric HTML entities', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      // &#65; = 'A', &#66; = 'B'
      const input = '<p>&#65;&#66;&#67;</p>'
      const result = stripHtmlTags(input)

      expect(result).toBe('ABC')
    })

    it('should decode hexadecimal HTML entities', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      // &#x41; = 'A', &#x42; = 'B'
      const input = '<p>&#x41;&#x42;&#x43;</p>'
      const result = stripHtmlTags(input)

      expect(result).toBe('ABC')
    })
  })
})

describe('Email Normalization - AC02: Normalize Whitespace', () => {
  describe('normalizeWhitespace', () => {
    it('should trim leading and trailing whitespace', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = '  hello world  '
      const result = normalizeWhitespace(input)

      expect(result).toBe('hello world')
    })

    it('should collapse multiple spaces to single space', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = 'hello    world'
      const result = normalizeWhitespace(input)

      expect(result).toBe('hello world')
    })

    it('should collapse tabs and mixed whitespace to single space', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = 'hello\t\tworld'
      const result = normalizeWhitespace(input)

      expect(result).toBe('hello world')
    })

    it('should convert CRLF line endings to LF', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = 'line1\r\nline2\r\nline3'
      const result = normalizeWhitespace(input)

      expect(result).toBe('line1\nline2\nline3')
    })

    it('should convert all line ending types to LF', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = 'line1\r\nline2\nline3\r'
      const result = normalizeWhitespace(input)

      expect(result).toBe('line1\nline2\nline3')
    })

    it('should collapse multiple blank lines to single blank line', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = 'line1\n\n\nline2'
      const result = normalizeWhitespace(input)

      expect(result).toBe('line1\n\nline2')
    })

    it('should handle empty string', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const result = normalizeWhitespace('')

      expect(result).toBe('')
    })

    it('should collapse whitespace-only string to empty string', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = '   \n  \t  '
      const result = normalizeWhitespace(input)

      expect(result).toBe('')
    })

    it('should preserve single internal spaces', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = 'hello world test'
      const result = normalizeWhitespace(input)

      expect(result).toBe('hello world test')
    })

    it('should handle complex mixed whitespace', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = '  hello\t\tworld  \n\n\n  test  '
      const result = normalizeWhitespace(input)

      expect(result).toBe('hello world\n\ntest')
    })

    it('should normalize actual email text after HTML stripping', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const htmlEmail = `
        <html>
          <body>
            <p>Hello     World</p>


            <p>This   is   a   test</p>
          </body>
        </html>
      `

      const stripped = stripHtmlTags(htmlEmail)
      const normalized = normalizeWhitespace(stripped)

      // Should have clean text with normalized whitespace
      expect(normalized).toContain('Hello World')
      expect(normalized).toContain('This is a test')
      expect(normalized).not.toContain('    ') // No multiple spaces
    })

    it('should process typical email body in under 1ms', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      // Generate ~5KB text with various whitespace issues
      const largeText = 'Content line  \t\t  with   spaces\r\n'.repeat(100)

      const start = performance.now()
      normalizeWhitespace(largeText)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1) // < 1ms for 5KB text
    })

    it('should be deterministic - same input always produces same output', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const input = '  hello\t\tworld  \r\n\r\n\r\n  test  '

      const result1 = normalizeWhitespace(input)
      const result2 = normalizeWhitespace(input)
      const result3 = normalizeWhitespace(input)

      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('should work seamlessly with stripHtmlTags in pipeline', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const htmlEmail = '<p>Hello    World</p>\r\n\r\n<p>Test</p>'

      const result = normalizeWhitespace(stripHtmlTags(htmlEmail))

      expect(result).toBe('Hello World\n\nTest')
    })
  })
})

describe('Email Normalization - AC03: Compute SHA-256 Content Hash', () => {
  describe('computeEmailContentHash', () => {
    it('should compute deterministic SHA-256 hash for simple text', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const input = 'Hello World'
      const result = computeEmailContentHash(input)

      // Should be 64-character hex string
      expect(result).toMatch(/^[0-9a-f]{64}$/)

      // Should be deterministic - same input produces same hash
      const result2 = computeEmailContentHash(input)
      expect(result).toBe(result2)
    })

    it('should normalize HTML before hashing', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const htmlInput = '<p>Hello     World</p>'
      const plainInput = 'Hello World'

      const htmlHash = computeEmailContentHash(htmlInput)
      const plainHash = computeEmailContentHash(plainInput)

      // After HTML stripping and whitespace normalization, should produce same hash
      expect(htmlHash).toBe(plainHash)
    })

    it('should produce identical hashes for content with different spacing', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const input1 = 'Hello     World'
      const input2 = 'Hello\t\tWorld'
      const input3 = '  Hello World  '

      const hash1 = computeEmailContentHash(input1)
      const hash2 = computeEmailContentHash(input2)
      const hash3 = computeEmailContentHash(input3)

      // All should normalize to same content and produce same hash
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it('should produce different hashes for different content', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const input1 = 'Hello World'
      const input2 = 'Goodbye World'

      const hash1 = computeEmailContentHash(input1)
      const hash2 = computeEmailContentHash(input2)

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty string deterministically', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const result = computeEmailContentHash('')

      // Should be 64-character hex string (SHA-256 of empty string)
      expect(result).toMatch(/^[0-9a-f]{64}$/)

      // Should be deterministic
      const result2 = computeEmailContentHash('')
      expect(result).toBe(result2)

      // SHA-256 of empty string is a known value
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('should handle large email body efficiently', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      // Generate ~10KB text
      const largeBody = 'This is a test email body with some content.\n'.repeat(200)

      const start = performance.now()
      const result = computeEmailContentHash(largeBody)
      const duration = performance.now() - start

      expect(result).toMatch(/^[0-9a-f]{64}$/)
      expect(duration).toBeLessThan(50) // < 50ms for 10KB content (well under 25ms/op target)
    })

    it('should handle special characters and unicode', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const input = 'Hello 世界 🌍 with symbols @#$%^&*()'
      const result = computeEmailContentHash(input)

      // Should produce valid hash
      expect(result).toMatch(/^[0-9a-f]{64}$/)

      // Should be deterministic
      const result2 = computeEmailContentHash(input)
      expect(result).toBe(result2)
    })

    it('should normalize line endings before hashing', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const crlfInput = 'line1\r\nline2\r\nline3'
      const lfInput = 'line1\nline2\nline3'
      const mixedInput = 'line1\r\nline2\nline3\r'

      const hash1 = computeEmailContentHash(crlfInput)
      const hash2 = computeEmailContentHash(lfInput)
      const hash3 = computeEmailContentHash(mixedInput)

      // All should normalize to same line endings and produce same hash
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it('should integrate full AC01→AC02→AC03 pipeline', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      // Complex HTML email with whitespace issues
      const htmlEmail = `
        <html>
          <head><title>Test</title></head>
          <body>
            <p>Hello     World</p>


            <p>This   is   a   test</p>
          </body>
        </html>
      `

      const result = computeEmailContentHash(htmlEmail)

      // Should be valid SHA-256 hash
      expect(result).toMatch(/^[0-9a-f]{64}$/)

      // Verify the pipeline produces expected normalization
      const stripped = stripHtmlTags(htmlEmail)
      const normalized = normalizeWhitespace(stripped)

      // Should contain the title and body text, normalized
      expect(normalized).toContain('Test')
      expect(normalized).toContain('Hello World')
      expect(normalized).toContain('This is a test')

      // Should be deterministic - same input produces same hash
      const result2 = computeEmailContentHash(htmlEmail)
      expect(result).toBe(result2)
    })

    it('should demonstrate collision resistance - different inputs produce different hashes', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const hashes = new Set<string>()

      // Generate 1000 different inputs
      for (let i = 0; i < 1000; i++) {
        const input = `Test email content number ${i} with unique data`
        const hash = computeEmailContentHash(input)
        hashes.add(hash)
      }

      // All hashes should be unique (no collisions)
      expect(hashes.size).toBe(1000)
    })

    it('should process typical 5KB email body in under 1ms', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      // Generate ~5KB text (typical email size)
      const typicalEmail = 'This is a typical email body with some content and formatting.\n'.repeat(100)

      const start = performance.now()
      computeEmailContentHash(typicalEmail)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1) // < 1ms for typical email
    })
  })
})

describe('Email Normalization - AC04: Update Capture Content Hash', () => {
  describe('updateCaptureContentHash', () => {
    let db: any
    const databases: any[] = []

    beforeEach(async () => {
      // Import Database constructor
      const DatabaseModule = await import('better-sqlite3')
      const Database = DatabaseModule.default

      // Create in-memory database
      db = new Database(':memory:')
      databases.push(db)

      // Initialize schema
      const { initializeDatabase } = await import('@capture-bridge/storage')
      initializeDatabase(db)
    })

    afterEach(() => {
      // Close all databases
      for (const database of databases) {
        database.close()
      }
      databases.length = 0

      // Force GC
      if (global.gc) global.gc()
    })

    it('should update capture with computed hash and raw content', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      // Insert test capture
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Update with normalized content
      const rawContent = '<p>Hello     World</p>'
      updateCaptureContentHash(db, captureId, rawContent)

      // Verify stored values
      const result = db.prepare('SELECT raw_content, content_hash FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
        content_hash: string
      }

      expect(result.raw_content).toBe(rawContent)
      expect(result.content_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should store original raw_content without normalization', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Raw content with HTML and whitespace
      const rawContent = '<div><p>Hello     World</p>\r\n\r\n<p>Test</p></div>'
      updateCaptureContentHash(db, captureId, rawContent)

      const result = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }

      // Should store original, not normalized
      expect(result.raw_content).toBe(rawContent)
      expect(result.raw_content).toContain('<div>')
      expect(result.raw_content).toContain('\r\n')
    })

    it('should compute hash from normalized content', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      const rawContent = '<p>Hello     World</p>'
      updateCaptureContentHash(db, captureId, rawContent)

      const result = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId) as {
        content_hash: string
      }

      // Should match hash computed by AC03
      const expectedHash = computeEmailContentHash(rawContent)
      expect(result.content_hash).toBe(expectedHash)
    })

    it('should use parameterized SQL queries for security', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Attempt SQL injection in raw content
      const sqlInjection = "'; DROP TABLE captures; --"
      updateCaptureContentHash(db, captureId, sqlInjection)

      // Verify table still exists and content is escaped
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='captures'")
        .all() as Array<{ name: string }>

      expect(tables).toHaveLength(1)

      const result = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }

      expect(result.raw_content).toBe(sqlInjection)
    })

    it('should be idempotent - same update twice produces consistent result', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      const rawContent = 'Test content'

      // Update twice
      updateCaptureContentHash(db, captureId, rawContent)
      updateCaptureContentHash(db, captureId, rawContent)

      // Verify single row with correct values
      const allResults = db.prepare('SELECT * FROM captures').all()
      expect(allResults).toHaveLength(1)

      const result = db.prepare('SELECT raw_content, content_hash FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
        content_hash: string
      }

      expect(result.raw_content).toBe(rawContent)
      expect(result.content_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle empty raw_content', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      updateCaptureContentHash(db, captureId, '')

      const result = db.prepare('SELECT raw_content, content_hash FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
        content_hash: string
      }

      expect(result.raw_content).toBe('')
      expect(result.content_hash).toBe(computeEmailContentHash(''))
    })

    it('should update 100 captures in under 100ms', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      // Insert 100 captures
      const stmt = db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `)

      const captureIds: string[] = []
      for (let i = 0; i < 100; i++) {
        const id = `01HQW3P7XKZM2YJVT8YFGQSZ${i.toString().padStart(3, '0')}`
        stmt.run(id)
        captureIds.push(id)
      }

      // Measure update time
      const start = performance.now()

      for (const id of captureIds) {
        updateCaptureContentHash(db, id, `Test content ${id}`)
      }

      const duration = performance.now() - start

      expect(duration).toBeLessThan(100) // < 100ms for 100 updates

      // Verify all updates
      const results = db.prepare('SELECT COUNT(*) as count FROM captures WHERE content_hash IS NOT NULL').get() as {
        count: number
      }
      expect(results.count).toBe(100)
    })

    it('should handle database transaction properly', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Update should work within transaction context
      db.prepare('BEGIN').run()
      updateCaptureContentHash(db, captureId, 'Test content')
      db.prepare('COMMIT').run()

      const result = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }

      expect(result.raw_content).toBe('Test content')
    })

    it('should work with captures table schema', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      updateCaptureContentHash(db, captureId, 'Test content')

      // Verify all columns are correct
      const result = db
        .prepare('SELECT id, source, raw_content, content_hash, status FROM captures WHERE id = ?')
        .get(captureId) as {
        id: string
        source: string
        raw_content: string
        content_hash: string
        status: string
      }

      expect(result.id).toBe(captureId)
      expect(result.source).toBe('email')
      expect(result.raw_content).toBe('Test content')
      expect(result.content_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(result.status).toBe('staged')
    })

    it('should integrate with email polling pipeline', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      // Simulate email polling → staging → normalization flow
      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      const gmailMessageId = 'msg_12345'
      const metaJson = JSON.stringify({
        channel: 'email',
        channel_native_id: gmailMessageId,
      })

      // 1. Email polling creates staged capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', ?)
      `
      ).run(captureId, metaJson)

      // 2. Normalization updates with raw_content + hash
      const emailBody = '<p>Hello World</p>'
      updateCaptureContentHash(db, captureId, emailBody)

      // 3. Verify pipeline integration
      const result = db
        .prepare('SELECT raw_content, content_hash, status FROM captures WHERE id = ?')
        .get(captureId) as {
        raw_content: string
        content_hash: string
        status: string
      }

      expect(result.raw_content).toBe(emailBody)
      expect(result.content_hash).toBe(computeEmailContentHash(emailBody))
      expect(result.status).toBe('staged')
    })
  })
})

describe('Email Normalization - AC05: Attachment Count Logged in meta_json', () => {
  describe('countAttachments', () => {
    it('should count zero attachments for text-only message', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_123',
        payload: {
          mimeType: 'text/plain',
          body: { data: 'text content' },
        },
      }

      const count = countAttachments(message)
      expect(count).toBe(0)
    })

    it('should count single attachment with filename and attachmentId', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_456',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: 'email body' },
            },
            {
              mimeType: 'application/pdf',
              filename: 'document.pdf',
              body: { attachmentId: 'att_123', size: 12345 },
            },
          ],
        },
      }

      const count = countAttachments(message)
      expect(count).toBe(1)
    })

    it('should count multiple attachments', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_789',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: 'email body' },
            },
            {
              mimeType: 'image/jpeg',
              filename: 'photo.jpg',
              body: { attachmentId: 'att_456', size: 54321 },
            },
            {
              mimeType: 'application/pdf',
              filename: 'report.pdf',
              body: { attachmentId: 'att_789', size: 98765 },
            },
            {
              mimeType: 'application/vnd.ms-excel',
              filename: 'data.xlsx',
              body: { attachmentId: 'att_012', size: 23456 },
            },
          ],
        },
      }

      const count = countAttachments(message)
      expect(count).toBe(3)
    })

    it('should not count parts without filename as attachments', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_mixed',
        payload: {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: 'plain text' },
            },
            {
              mimeType: 'text/html',
              body: { data: '<p>HTML text</p>' },
            },
            {
              mimeType: 'application/octet-stream',
              // No filename = not counted as attachment
              body: { data: 'inline data' },
            },
          ],
        },
      }

      const count = countAttachments(message)
      expect(count).toBe(0)
    })

    it('should count nested attachments in multipart/related', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_nested',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'multipart/related',
              parts: [
                {
                  mimeType: 'text/html',
                  body: { data: '<p>HTML</p>' },
                },
                {
                  mimeType: 'image/png',
                  filename: 'logo.png',
                  body: { attachmentId: 'att_logo', size: 5432 },
                },
              ],
            },
            {
              mimeType: 'application/pdf',
              filename: 'document.pdf',
              body: { attachmentId: 'att_doc', size: 12345 },
            },
          ],
        },
      }

      const count = countAttachments(message)
      expect(count).toBe(2)
    })

    it('should handle message with no payload', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = { id: 'msg_empty' }

      const count = countAttachments(message)
      expect(count).toBe(0)
    })

    it('should handle empty parts array', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_empty_parts',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [],
        },
      }

      const count = countAttachments(message)
      expect(count).toBe(0)
    })

    it('should be deterministic - same message always produces same count', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_determ',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            { mimeType: 'text/plain', body: { data: 'body' } },
            { mimeType: 'application/pdf', filename: 'doc.pdf', body: { attachmentId: 'att_1' } },
            { mimeType: 'image/jpeg', filename: 'img.jpg', body: { attachmentId: 'att_2' } },
          ],
        },
      }

      const count1 = countAttachments(message)
      const count2 = countAttachments(message)
      const count3 = countAttachments(message)

      expect(count1).toBe(2)
      expect(count2).toBe(2)
      expect(count3).toBe(2)
    })

    it('should complete in under 50ms for message with 10 attachments', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      // Generate message with 10 attachments
      const parts: any[] = [{ mimeType: 'text/plain', body: { data: 'body' } }]
      for (let i = 0; i < 10; i++) {
        parts.push({
          mimeType: 'application/pdf',
          filename: `doc${i}.pdf`,
          body: { attachmentId: `att_${i}`, size: 12345 },
        })
      }

      const message = {
        id: 'msg_perf',
        payload: {
          mimeType: 'multipart/mixed',
          parts,
        },
      }

      const start = performance.now()
      const count = countAttachments(message)
      const duration = performance.now() - start

      expect(count).toBe(10)
      expect(duration).toBeLessThan(50) // < 50ms
    })

    it('should not download attachments - only count from API metadata', async () => {
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_no_download',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'application/pdf',
              filename: 'large.pdf',
              body: { attachmentId: 'att_large', size: 10485760 }, // 10MB - not downloaded
            },
          ],
        },
      }

      const start = performance.now()
      const count = countAttachments(message)
      const duration = performance.now() - start

      expect(count).toBe(1)
      // Should be instant since no download
      expect(duration).toBeLessThan(10)
    })
  })

  describe('integration with meta_json', () => {
    let db: any
    const databases: any[] = []

    beforeEach(async () => {
      const DatabaseModule = await import('better-sqlite3')
      const Database = DatabaseModule.default

      db = new Database(':memory:')
      databases.push(db)

      const { initializeDatabase } = await import('@capture-bridge/storage')
      initializeDatabase(db)
    })

    afterEach(() => {
      for (const database of databases) {
        database.close()
      }
      databases.length = 0

      if (global.gc) global.gc()
    })

    it('should store attachment_count in meta_json when staging email', async () => {
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'

      // Insert initial capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Update with metadata including attachment count
      const metadata = {
        channel: 'email',
        channel_native_id: 'msg_123@example.com',
        message_id: 'msg_123@example.com',
        from: 'sender@example.com',
        subject: 'Test Email',
        date: '2025-10-13T10:00:00Z',
        attachment_count: 2,
      }

      updateCaptureWithMetadata(db, captureId, metadata)

      const result = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get(captureId) as {
        meta_json: string
      }

      const parsedMeta = JSON.parse(result.meta_json)
      expect(parsedMeta.attachment_count).toBe(2)
    })

    it('should store zero attachment_count when no attachments', async () => {
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      const metadata = {
        channel: 'email',
        channel_native_id: 'msg_456@example.com',
        message_id: 'msg_456@example.com',
        from: 'sender@example.com',
        subject: 'Plain Email',
        date: '2025-10-13T11:00:00Z',
        attachment_count: 0,
      }

      updateCaptureWithMetadata(db, captureId, metadata)

      const result = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get(captureId) as {
        meta_json: string
      }

      const parsedMeta = JSON.parse(result.meta_json)
      expect(parsedMeta.attachment_count).toBe(0)
    })

    it('should preserve existing meta_json fields when adding attachment_count', async () => {
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'

      const initialMeta = JSON.stringify({
        channel: 'email',
        channel_native_id: 'msg_789@example.com',
        custom_field: 'preserved',
      })

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', ?)
      `
      ).run(captureId, initialMeta)

      const metadata = {
        channel: 'email',
        channel_native_id: 'msg_789@example.com',
        message_id: 'msg_789@example.com',
        from: 'sender@example.com',
        subject: 'Test',
        date: '2025-10-13T12:00:00Z',
        attachment_count: 1,
        custom_field: 'preserved',
      }

      updateCaptureWithMetadata(db, captureId, metadata)

      const result = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get(captureId) as {
        meta_json: string
      }

      const parsedMeta = JSON.parse(result.meta_json)
      expect(parsedMeta.attachment_count).toBe(1)
      expect(parsedMeta.custom_field).toBe('preserved')
    })

    it('should handle large attachment counts efficiently', async () => {
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      const metadata = {
        channel: 'email',
        channel_native_id: 'msg_large@example.com',
        message_id: 'msg_large@example.com',
        from: 'sender@example.com',
        subject: 'Many Attachments',
        date: '2025-10-13T13:00:00Z',
        attachment_count: 50,
      }

      const start = performance.now()
      updateCaptureWithMetadata(db, captureId, metadata)
      const duration = performance.now() - start

      const result = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get(captureId) as {
        meta_json: string
      }

      const parsedMeta = JSON.parse(result.meta_json)
      expect(parsedMeta.attachment_count).toBe(50)
      expect(duration).toBeLessThan(50) // < 50ms
    })
  })
})

describe('Email Normalization - AC06: Performance < 50ms for 10KB email', () => {
  describe('End-to-End Pipeline Performance', () => {
    let db: any
    const databases: any[] = []

    beforeEach(async () => {
      const DatabaseModule = await import('better-sqlite3')
      const Database = DatabaseModule.default

      db = new Database(':memory:')
      databases.push(db)

      const { initializeDatabase } = await import('@capture-bridge/storage')
      initializeDatabase(db)
    })

    afterEach(() => {
      for (const database of databases) {
        database.close()
      }
      databases.length = 0

      if (global.gc) global.gc()
    })

    it('should complete full pipeline for simple text email in under 50ms', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      // Simple 1KB text email
      const simpleEmail = 'This is a simple email body with plain text content.\n'.repeat(20) // ~1KB

      const message = {
        id: 'msg_simple',
        payload: {
          mimeType: 'text/plain',
          body: { data: 'text' },
        },
      }

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Measure full pipeline
      const start = performance.now()

      // Step 1: Count attachments
      const attachmentCount = countAttachments(message)

      // Step 2: Update content hash (HTML stripping + whitespace norm + hash)
      updateCaptureContentHash(db, captureId, simpleEmail)

      // Step 3: Update metadata
      updateCaptureWithMetadata(db, captureId, {
        channel: 'email',
        message_id: 'msg_simple',
        attachment_count: attachmentCount,
      })

      const duration = performance.now() - start

      expect(duration).toBeLessThan(50) // < 50ms for simple email
    })

    it('should complete full pipeline for 10KB email in under 50ms', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      // Generate ~10KB text email
      const largeEmail = 'This is a test email body with some realistic content and formatting.\n'.repeat(150) // ~10KB

      const message = {
        id: 'msg_large',
        payload: {
          mimeType: 'text/plain',
          body: { data: 'text' },
        },
      }

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Measure full pipeline
      const start = performance.now()

      const attachmentCount = countAttachments(message)
      updateCaptureContentHash(db, captureId, largeEmail)
      updateCaptureWithMetadata(db, captureId, {
        channel: 'email',
        message_id: 'msg_large',
        attachment_count: attachmentCount,
      })

      const duration = performance.now() - start

      expect(duration).toBeLessThan(50) // < 50ms for 10KB email (critical requirement)
      expect(largeEmail.length).toBeGreaterThanOrEqual(10000) // Verify test data size
    })

    it('should complete full pipeline for complex HTML email in under 50ms', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      // Complex HTML with many tags (~5KB)
      const complexHtml = `
        <html>
          <head>
            <title>Marketing Email</title>
            <style>body { color: #333; }</style>
          </head>
          <body>
            <div class="header">
              <h1>Welcome to Our Newsletter</h1>
              <p>Stay updated with the latest news</p>
            </div>
            <div class="content">
              <p>This is a <strong>complex</strong> email with <em>lots of</em> HTML tags.</p>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
                <li>Item 3</li>
              </ul>
              <table>
                <tr><td>Data 1</td><td>Data 2</td></tr>
                <tr><td>Data 3</td><td>Data 4</td></tr>
              </table>
            </div>
          </body>
        </html>
      `.repeat(50) // Repeat to make ~5KB

      const message = {
        id: 'msg_complex',
        payload: {
          mimeType: 'text/html',
          body: { data: 'html' },
        },
      }

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Measure full pipeline
      const start = performance.now()

      const attachmentCount = countAttachments(message)
      updateCaptureContentHash(db, captureId, complexHtml)
      updateCaptureWithMetadata(db, captureId, {
        channel: 'email',
        message_id: 'msg_complex',
        attachment_count: attachmentCount,
      })

      const duration = performance.now() - start

      expect(duration).toBeLessThan(50) // < 50ms even with complex HTML
    })

    it('should complete full pipeline for email with attachments in under 50ms', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const emailBody = 'Email with attachments.\n'.repeat(100) // ~3KB

      // Message with 5 attachments
      const message = {
        id: 'msg_attachments',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            { mimeType: 'text/plain', body: { data: 'body' } },
            {
              mimeType: 'application/pdf',
              filename: 'doc1.pdf',
              body: { attachmentId: 'att_1', size: 100000 },
            },
            {
              mimeType: 'image/jpeg',
              filename: 'photo1.jpg',
              body: { attachmentId: 'att_2', size: 200000 },
            },
            {
              mimeType: 'application/vnd.ms-excel',
              filename: 'data.xlsx',
              body: { attachmentId: 'att_3', size: 50000 },
            },
            {
              mimeType: 'image/png',
              filename: 'screenshot.png',
              body: { attachmentId: 'att_4', size: 150000 },
            },
            {
              mimeType: 'application/zip',
              filename: 'archive.zip',
              body: { attachmentId: 'att_5', size: 500000 },
            },
          ],
        },
      }

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Measure full pipeline
      const start = performance.now()

      const attachmentCount = countAttachments(message)
      updateCaptureContentHash(db, captureId, emailBody)
      updateCaptureWithMetadata(db, captureId, {
        channel: 'email',
        message_id: 'msg_attachments',
        attachment_count: attachmentCount,
      })

      const duration = performance.now() - start

      expect(attachmentCount).toBe(5)
      expect(duration).toBeLessThan(50) // < 50ms even with attachment counting
    })

    it('should be deterministic - consistent timing across runs', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_determ',
        payload: {
          mimeType: 'text/plain',
          body: { data: 'text' },
        },
      }

      // Run pipeline 10 times and measure
      const timings: number[] = []

      for (let i = 0; i < 10; i++) {
        // Use unique content for each iteration to avoid UNIQUE constraint on content_hash
        const emailBody = `Deterministic test email iteration ${i}.\n`.repeat(100) // ~2.5KB

        const captureId = `01HQW3P7XKZM2YJVT8YFGQS${i.toString().padStart(3, '0')}`
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
          VALUES (?, 'email', '', NULL, 'staged', '{}')
        `
        ).run(captureId)

        const start = performance.now()

        const attachmentCount = countAttachments(message)
        updateCaptureContentHash(db, captureId, emailBody)
        updateCaptureWithMetadata(db, captureId, {
          channel: 'email',
          message_id: `msg_determ_${i}`,
          attachment_count: attachmentCount,
        })

        const duration = performance.now() - start
        timings.push(duration)
      }

      // All runs should be under 50ms
      for (const timing of timings) {
        expect(timing).toBeLessThan(50)
      }

      // Calculate average and variance
      const avg = timings.reduce((sum, t) => sum + t, 0) / timings.length
      const variance = timings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / timings.length

      // Expect low variance (consistent performance)
      expect(variance).toBeLessThan(100) // Allow some variance but not excessive
    })

    it('should provide performance breakdown for analysis', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const complexEmail = `
        <html><body>
          <p>Test email with HTML and whitespace issues.</p>
          <ul><li>Item 1</li><li>Item 2</li></ul>
        </body></html>
      `.repeat(100) // ~5KB

      const message = {
        id: 'msg_breakdown',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [
            { mimeType: 'text/html', body: { data: 'html' } },
            { mimeType: 'application/pdf', filename: 'doc.pdf', body: { attachmentId: 'att_1' } },
          ],
        },
      }

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Measure individual operations
      const t0 = performance.now()

      // 1. Attachment counting (AC05)
      const t1 = performance.now()
      const attachmentCount = countAttachments(message)
      const t2 = performance.now()
      const attachmentTime = t2 - t1

      // 2. HTML stripping (AC01)
      const t3 = performance.now()
      const stripped = stripHtmlTags(complexEmail)
      const t4 = performance.now()
      const stripTime = t4 - t3

      // 3. Whitespace normalization (AC02)
      const t5 = performance.now()
      const normalized = normalizeWhitespace(stripped)
      const t6 = performance.now()
      const normalizeTime = t6 - t5

      // 4. Hashing (AC03)
      const t7 = performance.now()
      const hash = computeEmailContentHash(complexEmail)
      const t8 = performance.now()
      const hashTime = t8 - t7

      // 5. Database updates (AC04)
      const t9 = performance.now()
      updateCaptureContentHash(db, captureId, complexEmail)
      const t10 = performance.now()
      const dbUpdateTime1 = t10 - t9

      const t11 = performance.now()
      updateCaptureWithMetadata(db, captureId, {
        channel: 'email',
        message_id: 'msg_breakdown',
        attachment_count: attachmentCount,
      })
      const t12 = performance.now()
      const dbUpdateTime2 = t12 - t11

      const totalTime = t12 - t0

      // Log breakdown for analysis (visible in test output)
      // eslint-disable-next-line no-console -- Performance breakdown for debugging
      console.log('\n=== Performance Breakdown ===')
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`Attachment counting: ${attachmentTime.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`HTML stripping:      ${stripTime.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`Whitespace norm:     ${normalizeTime.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`Hashing:             ${hashTime.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`DB update (hash):    ${dbUpdateTime1.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`DB update (meta):    ${dbUpdateTime2.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance metrics
      console.log(`Total:               ${totalTime.toFixed(3)}ms`)
      // eslint-disable-next-line no-console -- Performance breakdown footer
      console.log('============================\n')

      // Overall budget
      expect(totalTime).toBeLessThan(50)

      // Verify results
      expect(attachmentCount).toBe(1)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(stripped.length).toBeGreaterThan(0)
      expect(normalized.length).toBeGreaterThan(0)
    })

    it('should handle worst-case scenario - 10KB HTML with 10 attachments', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      // Worst case: Large complex HTML
      const worstCaseHtml = `
        <html>
          <head>
            <style>
              body { margin: 0; padding: 20px; font-family: Arial; }
              .header { background: #333; color: white; padding: 10px; }
              .content { margin: 20px 0; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Complex Marketing Email</h1>
            </div>
            <div class="content">
              <p>This is a <strong>very complex</strong> email with <em>many</em> HTML tags.</p>
              <table border="1">
                <tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr>
                <tr><td>Data 1</td><td>Data 2</td><td>Data 3</td></tr>
              </table>
            </div>
          </body>
        </html>
      `.repeat(100) // ~10KB of complex HTML

      // Message with 10 attachments (worst case)
      const parts: any[] = [{ mimeType: 'text/html', body: { data: 'html' } }]
      for (let i = 0; i < 10; i++) {
        parts.push({
          mimeType: 'application/pdf',
          filename: `document${i}.pdf`,
          body: { attachmentId: `att_${i}`, size: 100000 },
        })
      }

      const message = {
        id: 'msg_worst',
        payload: {
          mimeType: 'multipart/mixed',
          parts,
        },
      }

      const captureId = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId)

      // Measure worst-case pipeline
      const start = performance.now()

      const attachmentCount = countAttachments(message)
      updateCaptureContentHash(db, captureId, worstCaseHtml)
      updateCaptureWithMetadata(db, captureId, {
        channel: 'email',
        message_id: 'msg_worst',
        attachment_count: attachmentCount,
      })

      const duration = performance.now() - start

      expect(worstCaseHtml.length).toBeGreaterThanOrEqual(10000) // Verify size
      expect(attachmentCount).toBe(10)
      expect(duration).toBeLessThan(50) // Must handle worst case under 50ms
    })

    it('should prevent performance regression - batch processing', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { updateCaptureWithMetadata } = await import('../normalization/capture-updater.js')
      const { countAttachments } = await import('../normalization/attachment-counter.js')

      const message = {
        id: 'msg_batch',
        payload: {
          mimeType: 'text/plain',
          body: { data: 'text' },
        },
      }

      // Insert 50 captures
      const stmt = db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `)

      const captureIds: string[] = []
      for (let i = 0; i < 50; i++) {
        const id = `01HQW3P7XKZM2YJVT8YFGQS${i.toString().padStart(3, '0')}`
        stmt.run(id)
        captureIds.push(id)
      }

      // Measure batch processing time
      const start = performance.now()

      for (const [i, id] of captureIds.entries()) {
        // Use unique content for each email to avoid UNIQUE constraint on content_hash
        const emailBody = `Batch processing test email ${i}.\n`.repeat(50) // ~2KB

        const attachmentCount = countAttachments(message)
        updateCaptureContentHash(db, id, emailBody)
        updateCaptureWithMetadata(db, id, {
          channel: 'email',
          message_id: `msg_batch_${i}`,
          attachment_count: attachmentCount,
        })
      }

      const duration = performance.now() - start

      // Should process 50 emails in under 2.5 seconds (50ms * 50)
      expect(duration).toBeLessThan(2500)

      // Average per email should be under 50ms
      const avgPerEmail = duration / 50
      expect(avgPerEmail).toBeLessThan(50)
    })
  })
})

describe('Email Normalization - AC07: Deterministic - Same Email → Same Hash', () => {
  describe('Hash Determinism Validation', () => {
    it('should produce identical hash for exact same content', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content = 'Hello World - Test Email'

      const hash1 = computeEmailContentHash(content)
      const hash2 = computeEmailContentHash(content)
      const hash3 = computeEmailContentHash(content)

      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
      expect(hash1).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce identical hash across 100 iterations (determinism proof)', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content = 'Determinism validation test - 100 iterations'
      const hashes = new Set<string>()

      // Run 100 times
      for (let i = 0; i < 100; i++) {
        const hash = computeEmailContentHash(content)
        hashes.add(hash)
      }

      // All hashes should be identical (Set size = 1)
      expect(hashes.size).toBe(1)
    })

    it('should produce identical hash for same content with different HTML markup', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content1 = '<p>Hello World</p>'
      const content2 = '<div><span>Hello World</span></div>'
      const content3 = '<h1>Hello World</h1>'
      const content4 = 'Hello World' // Plain text

      const hash1 = computeEmailContentHash(content1)
      const hash2 = computeEmailContentHash(content2)
      const hash3 = computeEmailContentHash(content3)
      const hash4 = computeEmailContentHash(content4)

      // All should normalize to "Hello World" and produce same hash
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
      expect(hash3).toBe(hash4)
    })

    it('should produce identical hash for same content with different whitespace', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content1 = 'Hello     World'
      const content2 = 'Hello\t\tWorld'
      const content3 = '  Hello World  '

      const hash1 = computeEmailContentHash(content1)
      const hash2 = computeEmailContentHash(content2)
      const hash3 = computeEmailContentHash(content3)

      // Multiple spaces and tabs should normalize to single space
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it('should produce identical hash for same content with different line endings', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const crlfContent = 'Line 1\r\nLine 2\r\nLine 3'
      const lfContent = 'Line 1\nLine 2\nLine 3'
      const mixedContent = 'Line 1\r\nLine 2\nLine 3\r'

      const hash1 = computeEmailContentHash(crlfContent)
      const hash2 = computeEmailContentHash(lfContent)
      const hash3 = computeEmailContentHash(mixedContent)

      // All line endings should normalize to LF
      expect(hash1).toBe(hash2)
      expect(hash2).toBe(hash3)
    })

    it('should produce different hashes for different content', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content1 = 'Hello World'
      const content2 = 'Goodbye World'
      const content3 = 'Hello Universe'

      const hash1 = computeEmailContentHash(content1)
      const hash2 = computeEmailContentHash(content2)
      const hash3 = computeEmailContentHash(content3)

      // All hashes should be different
      expect(hash1).not.toBe(hash2)
      expect(hash2).not.toBe(hash3)
      expect(hash1).not.toBe(hash3)
    })

    it('should produce different hashes for small content variations', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content1 = 'Test Email Content'
      const content2 = 'Test Email Contents' // Added 's'
      const content3 = 'test email content' // Different case

      const hash1 = computeEmailContentHash(content1)
      const hash2 = computeEmailContentHash(content2)
      const hash3 = computeEmailContentHash(content3)

      // Small variations should produce different hashes
      expect(hash1).not.toBe(hash2)
      expect(hash1).not.toBe(hash3)
      expect(hash2).not.toBe(hash3)
    })

    it('should handle empty content deterministically', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const hash1 = computeEmailContentHash('')
      const hash2 = computeEmailContentHash('')
      const hash3 = computeEmailContentHash('   ') // Whitespace-only normalizes to empty

      // Empty content should produce known SHA-256 empty string hash
      expect(hash1).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      expect(hash1).toBe(hash2)
      expect(hash1).toBe(hash3)
    })

    it('should handle special characters deterministically', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content = 'Special chars: @#$%^&*()_+-=[]{}|;:,.<>?/'

      const hashes = new Set<string>()
      for (let i = 0; i < 10; i++) {
        hashes.add(computeEmailContentHash(content))
      }

      expect(hashes.size).toBe(1)
    })

    it('should handle Unicode characters deterministically', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content = 'Unicode test: 世界 🌍 café naïve'

      const hash1 = computeEmailContentHash(content)
      const hash2 = computeEmailContentHash(content)

      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle very long content deterministically', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      // 50KB of content
      const longContent = 'This is a very long email body with repeating content.\n'.repeat(1000)

      const hash1 = computeEmailContentHash(longContent)
      const hash2 = computeEmailContentHash(longContent)

      expect(hash1).toBe(hash2)
    })

    it('should produce no hash collisions in test suite (statistical validation)', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const hashes = new Set<string>()

      // Generate 1000 different emails
      for (let i = 0; i < 1000; i++) {
        // eslint-disable-next-line sonarjs/pseudo-random -- Using Math.random() for test data uniqueness, not cryptography
        const content = `Email number ${i} with unique content and timestamp ${Date.now()} random ${Math.random()}`
        const hash = computeEmailContentHash(content)
        hashes.add(hash)
      }

      // All hashes should be unique (no collisions)
      expect(hashes.size).toBe(1000)
    })

    it('should validate determinism across execution contexts (multiple runs)', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const testCases = [
        'Simple email',
        '<p>HTML email</p>',
        'Email with\r\nline endings',
        '  Whitespace   issues  ',
        'Unicode 世界 test',
        'Special @#$% chars',
        '', // Empty
      ]

      // Run each test case multiple times
      for (const testCase of testCases) {
        const results = new Set<string>()

        for (let i = 0; i < 20; i++) {
          results.add(computeEmailContentHash(testCase))
        }

        // Each test case should produce exactly one unique hash
        expect(results.size).toBe(1)
      }
    })

    it('should validate 100-iteration determinism completes in under 5000ms', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content = 'Performance test email for 100 iterations'

      const start = performance.now()

      const hashes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        hashes.add(computeEmailContentHash(content))
      }

      const duration = performance.now() - start

      // Validate determinism
      expect(hashes.size).toBe(1)

      // Validate performance
      expect(duration).toBeLessThan(5000) // < 5000ms for 100 iterations
    })

    it('should maintain determinism with complex HTML email variations', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const htmlVariants = [
        '<p>Test content</p>',
        '<div><p>Test content</p></div>',
        '<html><body><p>Test content</p></body></html>',
        '<span>Test content</span>',
        '  <p>  Test content  </p>  ',
      ]

      const hashes = htmlVariants.map((variant) => computeEmailContentHash(variant))

      // All variants should normalize to same content and produce same hash
      const uniqueHashes = new Set(hashes)
      expect(uniqueHashes.size).toBe(1)
    })

    it('should validate replay safety - duplicate emails produce same hash', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      // Simulate same email captured twice
      const email1 = `
        <html>
          <body>
            <p>Meeting reminder: Tomorrow at 2pm</p>
            <p>Location: Conference Room A</p>
          </body>
        </html>
      `

      const email2 = `
        <html>
          <body>
            <p>Meeting reminder: Tomorrow at 2pm</p>
            <p>Location: Conference Room A</p>
          </body>
        </html>
      `

      const hash1 = computeEmailContentHash(email1)
      const hash2 = computeEmailContentHash(email2)

      // Hashes must be identical for deduplication to work
      expect(hash1).toBe(hash2)
    })
  })

  describe('Normalization Pipeline Determinism', () => {
    it('should validate HTML stripping is deterministic', async () => {
      const { stripHtmlTags } = await import('../normalization/html-stripper.js')

      const html = '<div><p>Test <strong>content</strong></p></div>'

      const results = new Set<string>()
      for (let i = 0; i < 50; i++) {
        results.add(stripHtmlTags(html))
      }

      expect(results.size).toBe(1)
    })

    it('should validate whitespace normalization is deterministic', async () => {
      const { normalizeWhitespace } = await import('../normalization/whitespace-normalizer.js')

      const text = '  Hello   World  \r\n\r\n  Test  '

      const results = new Set<string>()
      for (let i = 0; i < 50; i++) {
        results.add(normalizeWhitespace(text))
      }

      expect(results.size).toBe(1)
    })

    it('should validate SHA-256 hashing is deterministic', async () => {
      const { computeSHA256 } = await import('@capture-bridge/foundation')

      const input = 'Test input for SHA-256 determinism'

      const hashes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        hashes.add(computeSHA256(input))
      }

      expect(hashes.size).toBe(1)
    })

    it('should validate full pipeline is deterministic', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const complexEmail = `
        <html>
          <head><style>body { color: red; }</style></head>
          <body>
            <h1>Test Email</h1>
            <p>This is a <strong>complex</strong> email with <em>formatting</em>.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `

      const hashes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        hashes.add(computeEmailContentHash(complexEmail))
      }

      expect(hashes.size).toBe(1)
    })
  })

  describe('Edge Cases for Determinism', () => {
    it('should handle only whitespace consistently', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const whitespaceVariants = ['   ', '\t\t\t', '\n\n\n', '  \t  \n  ', '\r\n\r\n']

      const hashes = whitespaceVariants.map((variant) => computeEmailContentHash(variant))

      // All should normalize to empty string
      const uniqueHashes = new Set(hashes)
      expect(uniqueHashes.size).toBe(1)
      expect(hashes[0]).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('should handle only special characters consistently', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const specialChars = '@#$%^&*()_+-=[]{}|;:,.<>?/'

      const hashes = new Set<string>()
      for (let i = 0; i < 20; i++) {
        hashes.add(computeEmailContentHash(specialChars))
      }

      expect(hashes.size).toBe(1)
    })

    it('should handle mixed case text consistently', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const content = 'MiXeD CaSe TeXt'

      const hash1 = computeEmailContentHash(content)
      const hash2 = computeEmailContentHash(content)

      // Case is preserved (not normalized), so should be deterministic
      expect(hash1).toBe(hash2)

      // But different case should produce different hash
      const lowerCase = computeEmailContentHash('mixed case text')
      expect(hash1).not.toBe(lowerCase)
    })

    it('should handle newlines vs spaces differently', async () => {
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const withNewlines = 'Line 1\nLine 2\nLine 3'
      const withSpaces = 'Line 1 Line 2 Line 3'

      const hash1 = computeEmailContentHash(withNewlines)
      const hash2 = computeEmailContentHash(withSpaces)

      // Newlines and spaces are semantically different
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Integration: Database Deduplication Determinism', () => {
    let db: any
    const databases: any[] = []

    beforeEach(async () => {
      const DatabaseModule = await import('better-sqlite3')
      const Database = DatabaseModule.default

      db = new Database(':memory:')
      databases.push(db)

      const { initializeDatabase } = await import('@capture-bridge/storage')
      initializeDatabase(db)
    })

    afterEach(() => {
      for (const database of databases) {
        database.close()
      }
      databases.length = 0

      if (global.gc) global.gc()
    })

    it('should prevent duplicate exports using deterministic hash', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')

      // Insert first capture
      const captureId1 = '01HQW3P7XKZM2YJVT8YFGQSZ4M'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId1)

      const emailContent = '<p>Duplicate test email</p>'
      updateCaptureContentHash(db, captureId1, emailContent)

      const result1 = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId1) as {
        content_hash: string
      }

      expect(result1.content_hash).toMatch(/^[0-9a-f]{64}$/)

      // Try to insert duplicate (same content) - should fail due to UNIQUE constraint
      const captureId2 = '01HQW3P7XKZM2YJVT8YFGQSZ5N'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId2)

      // Attempting to update with duplicate content should throw UNIQUE constraint error
      expect(() => {
        updateCaptureContentHash(db, captureId2, emailContent)
      }).toThrow(/UNIQUE constraint failed/)
    })

    it('should validate hash consistency prevents duplicate files in vault', async () => {
      const { updateCaptureContentHash } = await import('../normalization/capture-updater.js')
      const { computeEmailContentHash } = await import('../normalization/email-hasher.js')

      const emailContent1 = '<p>Test email for vault deduplication 1</p>'
      const emailContent2 = '<p>Test email for vault deduplication 2</p>'
      const emailContent3 = '<p>Test email for vault deduplication 3</p>'

      const expectedHash1 = computeEmailContentHash(emailContent1)
      const expectedHash2 = computeEmailContentHash(emailContent2)
      const expectedHash3 = computeEmailContentHash(emailContent3)

      // Insert 3 captures with DIFFERENT content to avoid UNIQUE constraint
      const captureId1 = '01HQW3P7XKZM2YJVT8YFGQS000'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId1)
      updateCaptureContentHash(db, captureId1, emailContent1)

      const captureId2 = '01HQW3P7XKZM2YJVT8YFGQS001'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId2)
      updateCaptureContentHash(db, captureId2, emailContent2)

      const captureId3 = '01HQW3P7XKZM2YJVT8YFGQS002'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId3)
      updateCaptureContentHash(db, captureId3, emailContent3)

      // Verify each has correct deterministic hash
      const result1 = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId1) as {
        content_hash: string
      }
      const result2 = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId2) as {
        content_hash: string
      }
      const result3 = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId3) as {
        content_hash: string
      }

      expect(result1.content_hash).toBe(expectedHash1)
      expect(result2.content_hash).toBe(expectedHash2)
      expect(result3.content_hash).toBe(expectedHash3)

      // All hashes should be different (no collisions)
      expect(result1.content_hash).not.toBe(result2.content_hash)
      expect(result2.content_hash).not.toBe(result3.content_hash)
      expect(result1.content_hash).not.toBe(result3.content_hash)

      // Now verify determinism: same content produces same hash (would fail UNIQUE constraint)
      const captureId4 = '01HQW3P7XKZM2YJVT8YFGQS003'
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'email', '', NULL, 'staged', '{}')
      `
      ).run(captureId4)

      // Attempting to use same content as capture 1 should fail
      expect(() => {
        updateCaptureContentHash(db, captureId4, emailContent1)
      }).toThrow(/UNIQUE constraint failed/)
    })
  })
})
