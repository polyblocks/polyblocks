import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import clsx from "clsx";
export const Button = React.forwardRef(({ variant = "default", size = "default", className, children, ...props }, ref) => (_jsx("button", { ref: ref, className: clsx("pb-btn", variant === "primary" && "pb-btn-primary", variant === "danger" && "pb-btn-danger", variant === "icon" && "pb-btn-icon", size === "sm" && "pb-btn-sm", className), ...props, children: children })));
Button.displayName = "Button";
export const Card = React.forwardRef(({ className, children, ...props }, ref) => (_jsx("div", { ref: ref, className: clsx("pb-card", className), ...props, children: children })));
Card.displayName = "Card";
export const Input = React.forwardRef(({ className, ...props }, ref) => (_jsx("input", { ref: ref, className: clsx("pb-input", className), ...props })));
Input.displayName = "Input";
export const Select = React.forwardRef(({ className, children, ...props }, ref) => (_jsx("select", { ref: ref, className: clsx("pb-select", className), ...props, children: children })));
Select.displayName = "Select";
export const Badge = ({ variant = "utility", className, children, ...props }) => (_jsx("span", { className: clsx("pb-badge", `pb-badge-${variant}`, className), ...props, children: children }));
export const StatusDot = ({ status, className, ...props }) => (_jsx("span", { className: clsx("pb-status-dot", `pb-status-dot-${status}`, className), ...props }));
//# sourceMappingURL=index.js.map