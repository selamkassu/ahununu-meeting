import React from "react";

export interface LogoProps {
  size?: number | string;
  className?: string;
  withText?: boolean;
  textVariant?: "light" | "dark";
  subtitle?: string;
}

export function Logo({
  size = 40,
  className = "",
  withText = false,
  textVariant = "dark",
  subtitle = "Meeting Management Portal",
}: LogoProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt="Ahununu Logistics Logo"
        style={{ width: dimension, height: dimension, minWidth: dimension, minHeight: dimension }}
        className="rounded-full object-contain shrink-0 drop-shadow-sm select-none"
      />
      {withText && (
        <div className="flex flex-col">
          <span
            className={`font-display font-bold leading-tight ${
              textVariant === "light" ? "text-white" : "text-slate2-800"
            } ${typeof size === "number" && size < 32 ? "text-xs" : "text-sm"}`}
          >
            Ahununu Logistics
          </span>
          {subtitle && (
            <span
              className={`text-[11px] leading-tight ${
                textVariant === "light" ? "text-white/60" : "text-slate2-400"
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default Logo;
