// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 依据 docs/dependencies.md 第 5 节：
 * package.json 中的版本号必须**精确**，不得使用 ^ ~ > < * x 等范围写法。
 *
 * 原因（INSPIRA_DEEPSEEK_MASTER_SPEC.md 第 5.1 节）：范围写法会让不同时间、
 * 不同机器安装出不同版本，产生"我这里是好的、你那里报错"的故障。
 * 这个测试让该规则在 CI 中自动生效，而不是只写在文档里。
 *
 * 本文件使用 node 环境（见首行 pragma）：它只读文件，不需要 jsdom。
 */

const packageJsonPath = resolve(process.cwd(), "package.json");

/** 精确版本：可选的 v 前缀 + 数字.数字.数字，可带 -prerelease 与 +build。 */
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

type PackageManifest = {
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readManifest(): PackageManifest {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageManifest;
}

describe("package.json 版本锁定", () => {
  const manifest = readManifest();

  const groups: Array<[string, Record<string, string> | undefined]> = [
    ["dependencies", manifest.dependencies],
    ["devDependencies", manifest.devDependencies],
  ];

  for (const [groupName, group] of groups) {
    describe(groupName, () => {
      const entries = Object.entries(group ?? {});

      it("至少声明了一个依赖", () => {
        expect(entries.length).toBeGreaterThan(0);
      });

      it.each(entries)("%s 使用精确版本（当前为 %s）", (_name, version) => {
        expect(version).toMatch(EXACT_SEMVER);
      });

      it("不使用范围符号或动态标签", () => {
        const offenders = entries
          .filter(([, version]) => /[\^~><*]|^\s*(latest|next|\*)\s*$/.test(version))
          .map(([name, version]) => `${name}@${version}`);

        expect(offenders).toEqual([]);
      });
    });
  }

  it("项目自身为 private，避免被误发布", () => {
    expect(manifest.private).toBe(true);
  });
});
