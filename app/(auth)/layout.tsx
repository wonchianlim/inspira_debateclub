import { AppShell } from "@/components/layout/app-shell";

/**
 * 认证页面的布局：居中的窄栏，避免表单在宽屏上被拉得过宽。
 *
 * 复用 AppShell 以保证地标结构与"跳到主要内容"链接在所有页面一致。
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navItems={[{ href: "/", label: "首页" }]}>
      <div className="mx-auto w-full max-w-sm">{children}</div>
    </AppShell>
  );
}
