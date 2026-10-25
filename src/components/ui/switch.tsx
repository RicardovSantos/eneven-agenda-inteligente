"use client"

import { cn } from "cn"

/** Interruptor (role="switch"): 44px de área de toque, trilho de 44x24. */
function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Nome acessível (o texto visível fica ao lado, fora do botão). */
  label: string
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group flex size-11 shrink-0 items-center justify-center rounded-field disabled:opacity-50",
        className
      )}
    >
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-ink-muted/45"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[left]",
            checked ? "left-[22px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  )
}

export { Switch }
