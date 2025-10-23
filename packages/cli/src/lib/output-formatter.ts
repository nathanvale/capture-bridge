/**
 * Output Formatter
 *
 * Provides functions for formatting CLI output in both JSON and human-friendly modes.
 *
 * @see spec-cli-tech.md §7 Output Conventions
 * @see CLI_FOUNDATION-AC06: JSON output mode (--json flag)
 */

/**
 * ANSI escape sequence regex for stripping color codes
 * Matches patterns like \x1b[32m (green), \x1b[0m (reset), etc.
 */
// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Required for ANSI stripping
const ANSI_REGEX = /\x1b\[\d+m/g

/**
 * Format data as JSON with 2-space indentation
 *
 * @param data - Data to format as JSON
 * @returns JSON string with 2-space indentation
 */
export const formatJSON = <T>(data: T): string => {
  return JSON.stringify(data, undefined, 2)
}

/**
 * Strip all ANSI escape sequences from text
 *
 * Removes color codes and other ANSI formatting to ensure clean JSON output.
 *
 * @param text - Text potentially containing ANSI codes
 * @returns Text with all ANSI codes removed
 */
export const stripANSI = (text: string): string => {
  return text.replace(ANSI_REGEX, '')
}

/**
 * Format message with human-friendly styling
 *
 * Applies color codes using chalk-style patterns for terminal output.
 * When no style is specified, returns plain text.
 *
 * @param message - Message to format
 * @param style - Optional style to apply (success/error/warn)
 * @returns Formatted message with ANSI color codes (or plain if no style)
 */
export const formatHuman = (message: string, style?: 'success' | 'error' | 'warn'): string => {
  if (!style) {
    return message
  }

  // Apply ANSI color codes based on style
  switch (style) {
    case 'success':
      return `\x1b[32m${message}\x1b[0m` // Green
    case 'error':
      return `\x1b[31m${message}\x1b[0m` // Red
    case 'warn':
      return `\x1b[33m${message}\x1b[0m` // Yellow
    default:
      return message
  }
}
