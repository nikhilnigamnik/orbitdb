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
    <div className={cn('text-sm leading-6 text-text', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => (
            <h1 className="mt-5 mb-2 text-base font-semibold text-text first:mt-0" {...p} />
          ),
          h2: (p) => (
            <h2 className="mt-4 mb-1.5 text-[15px] font-semibold text-text first:mt-0" {...p} />
          ),
          h3: (p) => <h3 className="mt-3 mb-1 text-sm font-semibold text-text first:mt-0" {...p} />,
          p: (p) => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-2 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li className="marker:text-text-subtle" {...p} />,
          strong: (p) => <strong className="font-semibold text-text" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          a: (p) => (
            <a
              className="font-medium text-accent-text underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          hr: (p) => <hr className="my-4 border-border" {...p} />,
          blockquote: (p) => (
            <blockquote
              className="my-2 border-l-2 border-border-strong pl-3 text-text-muted"
              {...p}
            />
          ),
          pre: (p) => (
            <pre
              className="my-3 overflow-auto rounded-lg border border-border bg-surface-sunken p-3 font-mono text-xs leading-relaxed text-text"
              {...p}
            />
          ),
          code: ({ className: codeClass, children, ...rest }) => {
            const isBlock = /language-/.test(codeClass ?? '')
            if (isBlock) {
              return (
                <code className={cn('text-text', codeClass)} {...rest}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="rounded-md border border-border bg-surface-sunken px-1 py-px font-mono text-[12px] text-text"
                {...rest}
              >
                {children}
              </code>
            )
          },
          table: (p) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border">
              <table
                className="w-full border-collapse text-xs [&_tr:last-child_td]:border-b-0"
                {...p}
              />
            </div>
          ),
          th: (p) => (
            <th
              className="h-8 border-r border-b border-border px-2.5 text-left font-medium text-text-muted last:border-r-0"
              {...p}
            />
          ),
          td: (p) => (
            <td className="h-8 border-r border-b border-border px-2.5 last:border-r-0" {...p} />
          )
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
