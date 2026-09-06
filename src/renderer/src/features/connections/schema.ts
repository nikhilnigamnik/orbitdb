import { z } from 'zod'

import { CONNECTION_COLORS, MAX_FOLDER_NAME_LENGTH } from '@renderer/config/site'

export const connectionSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
    engine: z.enum(['postgres', 'mysql', 'd1']),
    environment: z.enum(['dev', 'stage', 'prod']),
    // Trimmed here rather than at the store: '  ' and '' are the same folder,
    // and a header rendered from an untrimmed name would sort away from its twin.
    folder: z
      .string()
      .trim()
      .max(MAX_FOLDER_NAME_LENGTH, 'Folder name is too long')
      .optional()
      .default(''),
    // Derived rather than re-listed: the class and label maps are keyed on
    // ConnectionColor so tsc catches a colour missing from them, but a hand-kept
    // copy here would only fail at save time, on a field with no form control.
    color: z.enum(CONNECTION_COLORS).optional(),
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
    sshEnabled: z.boolean().optional().default(false),
    sshHost: z.string().optional().default(''),
    sshPort: z
      .number({ invalid_type_error: 'SSH port must be a number' })
      .int('SSH port must be an integer')
      .min(0, 'SSH port must be at least 0')
      .max(65535, 'SSH port must be at most 65535')
      .optional()
      .default(22),
    sshUser: z.string().optional().default(''),
    sshAuthMethod: z.enum(['password', 'key', 'agent']).optional().default('agent'),
    sshPassword: z.string().optional().default(''),
    sshPrivateKey: z.string().optional().default(''),
    sshPassphrase: z.string().optional().default(''),
    sshHostKeyFingerprint: z.string().optional().default('')
  })
  .superRefine((val, ctx) => {
    if (val.sshEnabled && val.engine !== 'd1') {
      if (!val.sshHost.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sshHost'],
          message: 'SSH host is required'
        })
      if (val.sshPort < 1)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sshPort'],
          message: 'SSH port must be at least 1'
        })
      if (!val.sshUser.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sshUser'],
          message: 'SSH user is required'
        })
      // The agent supplies its own credential, so only these two need one here.
      if (val.sshAuthMethod === 'password' && !val.sshPassword)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sshPassword'],
          message: 'SSH password is required'
        })
      if (val.sshAuthMethod === 'key' && !val.sshPrivateKey.trim())
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sshPrivateKey'],
          message: 'Choose a private key file'
        })
    }
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
