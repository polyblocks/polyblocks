import React from "react";
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "primary" | "danger" | "icon";
    size?: "default" | "sm";
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
}
export declare const Card: React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>>;
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
}
export declare const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
}
export declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLSelectElement>>;
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "trigger" | "market" | "data" | "logic" | "risk" | "action" | "utility";
}
export declare const Badge: React.FC<BadgeProps>;
export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
    status: "active" | "paused" | "stopped" | "error";
}
export declare const StatusDot: React.FC<StatusDotProps>;
//# sourceMappingURL=index.d.ts.map