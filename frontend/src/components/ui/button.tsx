import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-innotech text-white hover:bg-innotech-dark focus-visible:ring-innotech",
        bull: "bg-bull text-white hover:bg-bull/90 focus-visible:ring-bull",
        success: "bg-pass text-white hover:bg-emerald-700 focus-visible:ring-pass",
        danger: "bg-fail text-white hover:bg-red-700 focus-visible:ring-fail",
        destructive: "bg-fail text-white hover:bg-red-700 focus-visible:ring-fail",
        outline: "border border-[var(--line-strong)] bg-[var(--card)] text-[var(--ink2)] hover:bg-[var(--soft)]",
        ghost: "text-[var(--ink2)] hover:bg-[var(--soft)]",
        link: "text-innotech underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = "Button";
