import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "glow" | "glass";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent-hover)] focus-visible:ring-[var(--ring)] active:scale-[0.98]",
  glow:
    "bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent-hover)] focus-visible:ring-[var(--ring)] active:scale-[0.98]",
  glass:
    "border border-[var(--border)] bg-[var(--surface-1)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] active:scale-[0.98]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface-1)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)]",
  danger:
    "bg-[var(--destructive)] text-white shadow-sm hover:opacity-90 focus-visible:ring-red-500 active:scale-[0.98]",
  ghost:
    "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 min-h-8 px-3 text-xs rounded-lg touch-target",
  md: "h-9 min-h-9 px-4 text-sm rounded-lg touch-target",
  lg: "h-10 min-h-10 px-5 text-sm rounded-lg touch-target",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const spinnerSize =
      size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-4 w-4" : "h-4 w-4";

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-[var(--duration-fast)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <span
              className={cn(
                "shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
                spinnerSize
              )}
              aria-hidden="true"
            />
            {loadingText ? <span>{loadingText}</span> : null}
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
