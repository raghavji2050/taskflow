"use client";

import { InputHTMLAttributes, forwardRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hideLabel?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, hideLabel, type, startIcon, endIcon, ...props }, ref) => {
    const inputId = id || props.name;
    const isPassword = type === "password";
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="space-y-1.5">
        {label && !hideLabel && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "relative",
            (startIcon || endIcon || isPassword) &&
              "flex h-10 w-full items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 shadow-sm focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20",
            error && "border-red-500 focus-within:border-red-500 focus-within:ring-red-500/20"
          )}
        >
          {startIcon && (
            <span className="flex shrink-0 items-center text-[var(--muted)] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0">
              {startIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={isPassword && showPassword ? "text" : type}
            className={cn(
              startIcon || endIcon || isPassword
                ? "min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-0"
                : "flex h-10 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20",
              error && !(startIcon || endIcon || isPassword) && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
              className
            )}
            {...props}
          />
          {endIcon && !isPassword && (
            <span className="flex shrink-0 items-center text-[var(--muted)] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0">
              {endIcon}
            </span>
          )}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="flex shrink-0 rounded-md p-1 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
