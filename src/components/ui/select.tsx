import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

/** Select nativo (acessível e com boa seleção no celular), no visual dos campos. */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-field border border-input bg-surface pl-3 pr-10 text-base text-foreground transition-colors outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
    </div>
  )
}

export { Select }
