import { AppShell } from "@/components/layout/app-shell";
import { AuthBrandPanel } from "@/components/layout/auth-brand-panel";
import { getMessages } from "@/lib/i18n";

/**
 * 认证页面的布局（UI/UX 规范 §7.1）。
 *
 * 规范："Desktop uses a **45/55 split** and fills the viewport below any required
 * browser chrome." 移动端："Mobile removes the split; use a compact navy brand band
 * above the form."
 *
 * ⚠️ 仍然复用 `AppShell`：地标结构（header/nav/main/footer）与"跳到主要内容"链接
 * 在**所有**页面保持一致是有价值的，规范也没有要求认证页去掉浏览器外壳。
 *
 * ⚠️ 45/55 用 `lg:` 断点切换：小屏只留一条品牌带（规范说的 compact band），
 * 平板及以上才并排 —— 表单在高窄屏上挤成 45% 会更难填。
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const m = await getMessages();

  return (
    <AppShell navItems={[{ href: "/", label: m.nav.home }]}>
      <div className="grid items-start gap-6 lg:grid-cols-[45fr_55fr] lg:gap-10">
        <AuthBrandPanel />

        {/* 表单栏：居中的窄栏，规范给的 max-width 是 420px */}
        <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:justify-self-center">
          {children}
        </div>
      </div>
    </AppShell>
  );
}
