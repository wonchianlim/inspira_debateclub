/**
 * 中文文案。
 *
 * ⚠️ 类型标注为 `Messages`（由 `en.ts` 推导）——
 * **少任何一个键都会在 typecheck 时报错。**
 */
import type { Messages } from "./en";

export const zh: Messages = {
  common: {
    appName: "INSPIRA 辩论俱乐部",
    appNameFull: "INSPIRA 辩论俱乐部管理系统",
    skipToContent: "跳到主要内容",
    retry: "重试",
    loading: "正在加载…",
    save: "保存",
    cancel: "取消",
    back: "返回",
  },

  state: {
    loadingTitle: "正在加载…",
    loadingBody: "正在从服务器读取数据…",
    emptyTitle: "暂无内容",
    emptyBody: "还没有任何记录。创建之后会显示在这里。",
    errorTitle: "出错了",
    errorBody: "页面加载时出现问题。可以点下面重试；若持续失败，请把当前页面地址发给管理员。",
    forbiddenTitle: "没有访问权限",
    forbiddenBody: "你的账号角色无法访问这个区域。如果你认为这是错误的，请联系俱乐部管理员。",
    successTitle: "操作成功",
    successBody: "设置已保存。",
    notFoundTitle: "页面不存在",
    notFoundBody: "这个地址没有对应的页面。可能是链接已失效，或者地址输入有误。",
    backHome: "返回首页",
  },

  nav: {
    mainNav: "主导航",
    overview: "概览",
    home: "首页",
    events: "活动",
    notifications: "通知",
    clubManagement: "俱乐部管理",
    admin: "系统管理",
    signOut: "登出",
    language: "语言",
  },

  auth: {
    signInTitle: "登录",
    email: "邮箱",
    password: "密码",
    signInButton: "登录",
    noAccount: "还没有账号？",
    registerLink: "注册",
    forgotPasswordLink: "忘记密码？",

    registerTitle: "注册账号",
    confirmPassword: "确认密码",
    registerButton: "注册",
    haveAccount: "已经有账号了？",
    signInLink: "登录",

    forgotTitle: "重置密码",
    forgotBody: "输入你的邮箱，我们会发一封重置密码的邮件给你。",
    forgotButton: "发送重置链接",

    resetTitle: "设置新密码",
    newPassword: "新密码",
    resetButton: "更新密码",

    genericSignInError: "邮箱或密码不正确。",
    genericSignUpError: "注册失败，请稍后再试或更换邮箱。",
    tooManyAttempts: "操作过于频繁，请稍后再试。",
  },
};
