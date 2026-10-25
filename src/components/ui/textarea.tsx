import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 resize-y rounded-field border border-input bg-surface px-3 py-2.5 text-base leading-snug text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
