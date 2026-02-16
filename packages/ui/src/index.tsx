import React from "react";
import clsx from "clsx";

// ─── Button ─────────────────────────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "icon";
  size?: "default" | "sm";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "pb-btn",
        variant === "primary" && "pb-btn-primary",
        variant === "danger" && "pb-btn-danger",
        variant === "icon" && "pb-btn-icon",
        size === "sm" && "pb-btn-sm",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ─── Card ───────────────────────────────────────────────────────────────────

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={clsx("pb-card", className)} {...props}>
      {children}
    </div>
  ),
);
Card.displayName = "Card";

// ─── Input ──────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={clsx("pb-input", className)} {...props} />
  ),
);
Input.displayName = "Input";

// ─── Select ─────────────────────────────────────────────────────────────────

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={clsx("pb-select", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

// ─── Badge ──────────────────────────────────────────────────────────────────

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "trigger" | "market" | "data" | "logic" | "risk" | "action" | "utility";
}

export const Badge: React.FC<BadgeProps> = ({ variant = "utility", className, children, ...props }) => (
  <span className={clsx("pb-badge", `pb-badge-${variant}`, className)} {...props}>
    {children}
  </span>
);

// ─── StatusDot ──────────────────────────────────────────────────────────────

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "active" | "paused" | "stopped" | "error";
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, className, ...props }) => (
  <span className={clsx("pb-status-dot", `pb-status-dot-${status}`, className)} {...props} />
);
