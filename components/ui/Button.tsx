import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Shown beside the spinner when loading. Omit for icon-only buttons. */
  loadingText?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent-hover)] focus-visible:ring-[var(--accent)]",
  secondary:
    "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm hover:bg-[var(--surface-hover)]",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-500",
  ghost:
    "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-10 px-5 text-sm rounded-lg",
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
          "inline-flex items-center justify-center gap-1.5 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
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
