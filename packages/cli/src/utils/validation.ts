import { z } from 'zod'

/**
 * Validation schema for voice capture command
 * Accepts file path, optional transcription flag, tags, and priority
 */
export const captureVoiceSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  transcribe: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
})

/**
 * Validation schema for email capture command
 * Accepts .eml file path
 */
export const captureEmailSchema = z.object({
  filePath: z.string().min(1, 'Email file path is required'),
})

/**
 * Validation schema for capture list command
 * Accepts optional source filter and limit
 */
export const captureListSchema = z.object({
  source: z.enum(['voice', 'email']).optional(),
  limit: z.number().int().positive().optional(),
})

/**
 * Validation schema for capture show command
 * Accepts ULID identifier (minimum 26 characters)
 */
export const captureShowSchema = z.object({
  id: z.string().min(26, 'ID must be at least 26 characters (ULID format)'),
})

/**
 * Validation schema for doctor command
 * Accepts optional verbose flag
 */
export const doctorSchema = z.object({
  verbose: z.boolean().default(false),
})

/**
 * Validation schema for ledger list command
 * Accepts optional source filter and limit
 */
export const ledgerListSchema = z.object({
  source: z.enum(['voice', 'email']).optional(),
  limit: z.number().int().positive().optional(),
})

/**
 * Validation schema for ledger inspect command
 * Accepts ULID identifier (minimum 26 characters)
 */
export const ledgerInspectSchema = z.object({
  id: z.string().min(26, 'ID must be at least 26 characters (ULID format)'),
})

/**
 * Type definitions inferred from schemas
 */
export type CaptureVoiceInput = z.infer<typeof captureVoiceSchema>
export type CaptureEmailInput = z.infer<typeof captureEmailSchema>
export type CaptureListInput = z.infer<typeof captureListSchema>
export type CaptureShowInput = z.infer<typeof captureShowSchema>
export type DoctorInput = z.infer<typeof doctorSchema>
export type LedgerListInput = z.infer<typeof ledgerListSchema>
export type LedgerInspectInput = z.infer<typeof ledgerInspectSchema>

/**
 * Structured validation error
 */
export interface ValidationError {
  field: string
  message: string
}

/**
 * Validation result - success or failure with aggregated errors
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] }

/**
 * Validates input against a Zod schema
 * Returns parsed data on success, or aggregated errors on failure
 *
 * @param schema - Zod schema to validate against
 * @param input - Input data to validate
 * @returns ValidationResult with parsed data or errors
 */
export const validateInput = <T>(schema: z.ZodSchema<T>, input: unknown): ValidationResult<T> => {
  const result = schema.safeParse(input)

  if (result.success) {
    return { success: true, data: result.data }
  }

  // Aggregate all validation errors
  const errors: ValidationError[] = result.error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
    message: err.message,
  }))

  return { success: false, errors }
}
