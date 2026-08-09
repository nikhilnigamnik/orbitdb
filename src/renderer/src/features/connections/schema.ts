import { z } from 'zod'

export const connectionSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
    engine: z.enum(['postgres', 'mysql', 'd1', 'sqlite']),
    environment: z.enum(['dev', 'stage', 'prod']),
    host: z.string(),
    port: z
      .number({ invalid_type_error: 'Port must be a number' })
      .int('Port must be an integer')
      .min(0, 'Port must be at least 0')
      .max(65535, 'Port must be at most 65535'),
    database: z.string(),
    user: z.string(),
    password: z.string(),
    ssl: z.boolean(),
    accountId: z.string().optional().default(''),
    databaseId: z.string().optional().default(''),
    apiToken: z.string().optional().default(''),
    filePath: z.string().optional().default('')
  })
  .superRefine((val, ctx) => {
    if (val.engine === 'd1') {
      if (!val.accountId.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accountId'],
          message: 'Account ID is required'
        })
      if (!val.databaseId.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['databaseId'],
          message: 'Database ID is required'
        })
      if (!val.apiToken.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['apiToken'],
          message: 'API token is required'
        })
    } else if (val.engine === 'sqlite') {
      if (!val.filePath.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['filePath'],
          message: 'Database file is required'
        })
    } else {
      if (!val.host.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['host'],
          message: 'Host is required'
        })
      if (val.port < 1)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['port'],
          message: 'Port must be at least 1'
        })
      if (!val.user.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['user'],
          message: 'User is required'
        })
    }
  })

export type ConnectionFormValues = z.infer<typeof connectionSchema>
