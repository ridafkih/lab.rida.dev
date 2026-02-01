import type { AppViewType } from "@/components/app-view";

type NavItem = {
  label: string;
  href: string;
  view?: AppViewType;
};

export const navItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Editor", href: "/editor" },
  { label: "Settings", href: "/settings", view: "settings" },
];

type ReviewableFile = {
  path: string;
  originalContent: string;
  currentContent: string;
  status: "pending" | "dismissed";
  changeType: "modified" | "created" | "deleted";
};

export const mockReviewFiles: Record<string, ReviewableFile[]> = {
  a1b2c3: [
    {
      path: "src/auth/provider.tsx",
      originalContent: `import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>;
}`,
      currentContent: `import { createContext, useContext, useState } from "react";

type AuthState = {
  user: User | null;
  isLoading: boolean;
};

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}`,
      status: "pending",
      changeType: "modified",
    },
    {
      path: "src/auth/hooks.ts",
      originalContent: "",
      currentContent: `import { useContext } from "react";
import { AuthContext } from "./provider";

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useUser() {
  const { user } = useAuth();
  return user;
}`,
      status: "pending",
      changeType: "created",
    },
  ],
  d4e5f6: [],
  x7y8z9: [
    {
      path: "src/components/theme-toggle.tsx",
      originalContent: "",
      currentContent: `export function ThemeToggle() {
  return <button>Toggle</button>;
}`,
      status: "dismissed",
      changeType: "created",
    },
  ],
};

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
};

export const mockFileTree: FileNode[] = [
  { name: "src", path: "src", type: "directory" },
  { name: "package.json", path: "package.json", type: "file" },
  { name: "tsconfig.json", path: "tsconfig.json", type: "file" },
];

export const mockFileTreeContents: Record<string, FileNode[]> = {
  src: [
    { name: "auth", path: "src/auth", type: "directory" },
    { name: "components", path: "src/components", type: "directory" },
    { name: "index.ts", path: "src/index.ts", type: "file" },
  ],
  "src/auth": [
    { name: "provider.tsx", path: "src/auth/provider.tsx", type: "file" },
    { name: "hooks.ts", path: "src/auth/hooks.ts", type: "file" },
  ],
  "src/components": [
    { name: "button.tsx", path: "src/components/button.tsx", type: "file" },
    { name: "theme-toggle.tsx", path: "src/components/theme-toggle.tsx", type: "file" },
  ],
};

export const mockFileContents: Record<string, string> = {
  "package.json": `{
  "name": "my-app",
  "version": "1.0.0"
}`,
  "src/index.ts": `export * from "./auth";
export * from "./components";`,
  "src/auth/provider.tsx": `import { createContext } from "react";
export const AuthContext = createContext(null);`,
  "src/auth/hooks.ts": `import { useContext } from "react";
import { AuthContext } from "./provider";
export function useAuth() {
  return useContext(AuthContext);
}`,
  "src/components/button.tsx": `export function Button({ children }) {
  return <button>{children}</button>;
}`,
  "src/components/theme-toggle.tsx": `export function ThemeToggle() {
  return <button>Toggle</button>;
}`,
};
