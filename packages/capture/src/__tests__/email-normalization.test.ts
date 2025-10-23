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
