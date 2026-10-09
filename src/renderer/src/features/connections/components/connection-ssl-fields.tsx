import { Switch } from '@renderer/components/ui/switch'

interface ConnectionSslFieldsProps {
  ssl: boolean
  sslVerify: boolean
  onChangeSsl: (ssl: boolean) => void
  onChangeSslVerify: (sslVerify: boolean) => void
}

/**
 * "Use SSL" alone used to mean encrypted-but-unverified, and said so in its
 * label. The verification switch now carries that meaning, so the first row can
 * say what it does and the second says what it costs to turn off.
 */
export function ConnectionSslFields({
  ssl,
  sslVerify,
  onChangeSsl,
  onChangeSslVerify
}: ConnectionSslFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-text">
        <span>Use SSL</span>
        <Switch checked={ssl} onCheckedChange={onChangeSsl} />
      </label>
      {ssl && (
        <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-text">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>Verify server certificate</span>
            <span className="text-text-subtle">
              {sslVerify
                ? 'Refuses a self-signed certificate or one issued for another host.'
                : 'Encrypted, but the server is not checked to be who it claims.'}
            </span>
          </span>
          <Switch checked={sslVerify} onCheckedChange={onChangeSslVerify} />
        </label>
      )}
    </div>
  )
}
