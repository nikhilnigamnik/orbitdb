import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'

interface MarkdownViewProps {
  children: string
  className?: string
}

/** Renders model/markdown text with Tailwind-styled elements (no prose plugin). */
export function MarkdownView({ children, className }: MarkdownViewProps) {
  return (
    <div className={cn('text-[12.5px] leading-relaxed text-text-muted', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-1.5 mt-3 text-[14px] font-semibold text-text first:mt-0" {...p} />,
          h2: (p) => <h2 className="mb-1.5 mt-3 text-[13px] font-semibold text-text first:mt-0" {...p} />,
          h3: (p) => (
            <h3 className="mb-1 mt-2.5 text-[12.5px] font-semibold text-text first:mt-0" {...p} />
          ),
          p: (p) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-1.5 list-disc space-y-0.5 pl-5" {...p} />,
          ol: (p) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5" {...p} />,
          li: (p) => <li className="marker:text-text-subtle" {...p} />,
          strong: (p) => <strong className="font-semibold text-text" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          a: (p) => (
            <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
          ),
          hr: (p) => <hr className="my-3 border-border" {...p} />,
          blockquote: (p) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-text-subtle" {...p} />
          ),
          pre: (p) => (
            <pre
              className="my-2 overflow-auto rounded-md border border-border bg-surface-elevated/50 p-3 font-mono text-[11px] leading-relaxed"
              {...p}
            />
          ),
          code: ({ className: codeClass, children, ...rest }) => {
            const isBlock = /language-/.test(codeClass ?? '')
            if (isBlock) {
              return (
                <code className={cn('text-text-muted', codeClass)} {...rest}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[11px] text-text"
                {...rest}
              >
                {children}
              </code>
            )
          },
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[11.5px]" {...p} />
            </div>
          ),
          th: (p) => (
            <th className="border border-border px-2 py-1 text-left font-medium text-text" {...p} />
          ),
          td: (p) => <td className="border border-border px-2 py-1" {...p} />
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
