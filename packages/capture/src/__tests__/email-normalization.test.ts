import { describe, it, expect } from 'vitest'

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
