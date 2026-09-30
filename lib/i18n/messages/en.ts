/**
 * 英文文案（**默认语言**）。
 *
 * ⚠️ 这个文件定义**形状**。`zh.ts` 必须满足同一形状，
 * 因此漏翻译会在 `npm run typecheck` 时报错，而不是让用户看到一个键名。
 *
 * 组织方式：按界面区域分组，与路由结构对应。
 */
export const en = {
  common: {
    appName: "INSPIRA Debate Club",
    appNameFull: "INSPIRA Debate Club Management System",
    skipToContent: "Skip to main content",
    retry: "Try again",
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    back: "Back",
  },

  state: {
    loadingTitle: "Loading…",
    loadingBody: "Fetching data from the server…",
    emptyTitle: "Nothing here yet",
    emptyBody: "Once records are created, they will appear here.",
    errorTitle: "Something went wrong",
    errorBody:
      "There was a problem loading this page. You can try again below; if it keeps failing, send this page's address to your administrator.",
    forbiddenTitle: "No access",
    forbiddenBody:
      "Your account role cannot access this area. If you believe this is a mistake, contact a club administrator.",
    successTitle: "Done",
    successBody: "Your changes have been saved.",
    notFoundTitle: "Page not found",
    notFoundBody:
      "There is no page at this address. The link may have expired, or the address may be mistyped.",
    backHome: "Back to home",
  },

  nav: {
    mainNav: "Main navigation",
    overview: "Overview",
    home: "Home",
    events: "Events",
    notifications: "Notifications",
    clubManagement: "Club management",
    admin: "Administration",
    signOut: "Sign out",
    language: "Language",
  },

  auth: {
    signInTitle: "Sign in",
    email: "Email",
    password: "Password",
    signInButton: "Sign in",
    noAccount: "Don't have an account?",
    registerLink: "Register",
    forgotPasswordLink: "Forgot your password?",

    registerTitle: "Create an account",
    confirmPassword: "Confirm password",
    registerButton: "Register",
    haveAccount: "Already have an account?",
    signInLink: "Sign in",

    forgotTitle: "Reset your password",
    forgotBody: "Enter your email address and we will send you a link to reset your password.",
    forgotButton: "Send reset link",

    resetTitle: "Choose a new password",
    newPassword: "New password",
    resetButton: "Update password",

    genericSignInError: "Incorrect email or password.",
    genericSignUpError: "Registration failed. Please try again later or use a different email.",
    tooManyAttempts: "Too many attempts. Please try again later.",
  },
} as const;

/**
 * 把字面量类型放宽成 string。
 *
 * ⚠️ 没有这一步的话，`as const` 会让每个值变成**字面量类型**
 * （`appName` 的类型会是 `"INSPIRA Debate Club"`），
 * 于是中文根本没法赋值 —— 而**报的错会是"字符串类型不匹配"，
 * 不是"少了某个键"**。
 *
 * 那种错误看似也能拦住问题，但它拦的是**错误的原因**：
 * 漏翻译时你看到的会是一堆莫名其妙的类型错误，而不是"zh 少了 nav.signOut"。
 *
 * 这一步只放宽**值的类型**，键的结构仍然被强制。
 */
type DeepWiden<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepWiden<T[K]>;
};

/** 文案的形状。`zh.ts` 必须满足它 —— 少一个键就编译不过。 */
export type Messages = DeepWiden<typeof en>;
