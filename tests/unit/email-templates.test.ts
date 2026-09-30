// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type EmailTemplateKey, renderEmail } from "@/lib/domain/email-templates";

/**
 * 邮件模板（Phase 9 的 "templates"）。
 *
 * 纯函数，因此可以穷举测试 —— 不需要数据库、不需要网络、不花钱。
 */

const KEYS: EmailTemplateKey[] = ["ballot_published", "ballot_overdue"];

describe("每个模板都能渲染出完整内容", () => {
  it("两个模板都有主题、纯文本、HTML 三部分，且都不为空", () => {
    for (const key of KEYS) {
      const rendered = renderEmail(key, {
        studentName: "张三",
        judgeName: "李老师",
        eventTitle: "秋季内部赛",
        matchText: "第 3 场",
        roundText: "初赛",
        minutesOverdue: 45,
        appUrl: "https://example.invalid/x",
      });
      expect(rendered.subject.trim(), key).not.toBe("");
      expect(rendered.text.trim(), key).not.toBe("");
      expect(rendered.html.trim(), key).not.toBe("");
    }
  });

  it("主题里带上活动名，收件人一眼知道是哪一场", () => {
    const rendered = renderEmail("ballot_published", { eventTitle: "秋季内部赛" });
    expect(rendered.subject).toContain("秋季内部赛");
  });

  it("纯文本与 HTML 都提到了关键信息", () => {
    const rendered = renderEmail("ballot_published", { eventTitle: "秋季内部赛" });
    expect(rendered.text).toContain("秋季内部赛");
    expect(rendered.html).toContain("秋季内部赛");
  });

  it("结尾都写明是系统自动发送（学生不该回信给一个发信地址）", () => {
    for (const key of KEYS) {
      const rendered = renderEmail(key, {});
      expect(rendered.text, key).toContain("请勿回复");
      expect(rendered.html, key).toContain("请勿回复");
    }
  });
});

describe("缺失数据不产生空白或 undefined", () => {
  it("没有学生姓名时用「同学」这样的称呼，而不是留空", () => {
    const rendered = renderEmail("ballot_published", { eventTitle: "某活动" });
    expect(rendered.text).not.toContain("undefined");
    expect(rendered.text).not.toContain("null");
    expect(rendered.html).not.toContain("undefined");
  });

  it("完全没有数据也能渲染出可读的信（不崩、不出现 undefined）", () => {
    for (const key of KEYS) {
      const rendered = renderEmail(key, {});
      for (const part of [rendered.subject, rendered.text, rendered.html]) {
        expect(part, key).not.toContain("undefined");
        expect(part, key).not.toContain("null");
        expect(part, key).not.toContain("[object Object]");
      }
    }
  });

  it("没有 appUrl 时不生成一条空的链接", () => {
    const rendered = renderEmail("ballot_published", { eventTitle: "某活动" });
    expect(rendered.html).not.toContain('href=""');
    expect(rendered.text).not.toContain("查看：\n");
  });
});

/**
 * ⚠️ 数据里有学生姓名、活动名 —— 它们来自用户输入。
 * 直接插进 HTML 会形成注入。
 */
describe("HTML 转义（防注入）", () => {
  it("活动名里的尖括号被转义，不会变成标签", () => {
    const rendered = renderEmail("ballot_published", {
      eventTitle: '<script>alert("x")</script>',
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("引号也会被转义（属性注入）", () => {
    const rendered = renderEmail("ballot_published", { eventTitle: '"onmouseover="alert(1)' });
    expect(rendered.html).not.toContain('"onmouseover=');
    expect(rendered.html).toContain("&quot;");
  });

  it("纯文本**不**转义（那是纯文本，转义反而会让它显示成 &lt;）", () => {
    const rendered = renderEmail("ballot_published", { eventTitle: "<b>粗体</b>" });
    expect(rendered.text).toContain("<b>粗体</b>");
  });
});

describe("未知模板键要抛错，而不是静默发出一封空信", () => {
  it("未知键抛错（收件人不会收到一封莫名其妙的白信）", () => {
    expect(() => renderEmail("不存在的模板" as EmailTemplateKey, {})).toThrow();
  });
});

describe("确定性", () => {
  it("相同输入重复渲染结果一致", () => {
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(renderEmail("ballot_overdue", { judgeName: "李老师", matchText: "第 2 场" })),
    );
    expect(new Set(runs).size).toBe(1);
  });
});
