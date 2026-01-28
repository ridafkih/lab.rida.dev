import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "../utils/cn";

type AvatarSize = "xs" | "sm" | "md" | "lg";
type PresenceStatus = "online" | "offline" | "busy";

export type AvatarProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "size"> & {
  size?: AvatarSize;
  fallback?: string;
  presence?: PresenceStatus;
};

const sizeStyles: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

const presenceStyles: Record<PresenceStatus, string> = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  busy: "bg-destructive",
};

const presenceSizeStyles: Record<AvatarSize, string> = {
  xs: "h-1.5 w-1.5 right-0 bottom-0",
  sm: "h-2 w-2 right-0 bottom-0",
  md: "h-2.5 w-2.5 right-0 bottom-0",
  lg: "h-3 w-3 right-0.5 bottom-0.5",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({
  className,
  size = "md",
  src,
  alt = "",
  fallback,
  presence,
  ...props
}: AvatarProps) {
  const [error, setError] = useState(false);
  const showFallback = !src || error;

  return (
    <span className={cn("relative inline-block", sizeStyles[size])}>
      {showFallback ? (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center bg-muted text-muted-foreground font-medium",
            className,
          )}
        >
          {fallback ? getInitials(fallback) : "?"}
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full object-cover", className)}
          onError={() => setError(true)}
          {...props}
        />
      )}
      {presence && (
        <span
          className={cn(
            "absolute block rounded-full ring-2 ring-background",
            presenceStyles[presence],
            presenceSizeStyles[size],
          )}
        />
      )}
    </span>
  );
}

export type AvatarGroupProps = {
  children: React.ReactNode;
  max?: number;
  size?: AvatarSize;
  className?: string;
};

export function AvatarGroup({ children, max = 4, size = "md", className }: AvatarGroupProps) {
  const avatars = Array.isArray(children) ? children : [children];
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((avatar, i) => (
        <span key={i} className="ring-2 ring-background inline-block">
          {avatar}
        </span>
      ))}
      {remaining > 0 && (
        <span
          className={cn(
            "flex items-center justify-center bg-muted text-muted-foreground font-medium ring-2 ring-background",
            sizeStyles[size],
          )}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
