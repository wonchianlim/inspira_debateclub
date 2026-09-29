# 决策记录（Architecture Decision Records）

本目录保存 INSPIRA 项目的重要技术决策，供非技术产品负责人与后续实现者查阅。每个决策一个文件，**一经记录不再修改内容**；需要改变时新建一条并注明取代关系。

文件命名：`NNNN-简短英文标题.md`

## 记录格式

```markdown
# ADR-NNNN：标题

- 状态：提议 / 已接受 / 已取代（被 ADR-XXXX 取代）
- 日期：YYYY-MM-DD
- 相关：规范章节、其他 ADR

## 背景
为什么必须做这个决定。

## 决定
决定了什么。

## 影响
变简单了什么，变复杂了什么，谁需要做什么。

## 备选方案
考虑过但未采用的方案，以及原因。

## 待确认
仍未解决、需要产品负责人回答的问题。
```

## 索引

| 编号 | 决策 | 状态 |
|---|---|---|
| [0001](0001-auth-and-profile-identity.md) | 认证服务与档案身份合并为一个 UUID | 提议 |
| [0002](0002-migrations-and-data-access.md) | 结构变更只走迁移；数据访问分三种客户端 | 提议 |
| [0003](0003-ballot-templates.md) | Ballot 采用共享表 + 按赛制版本化模板 | 提议 |
| [0004](0004-background-email-processing.md) | 邮件采用事务内入队 + 定时投递 | 提议 |
| [0005](0005-pairing-determinism.md) | 配对与裁判推荐使用确定性启发式算法 | 提议 |
| [0006](0006-roster-snapshots.md) | 开赛即锁定并快照名单 | 提议 |
| [0007](0007-auth-through-own-domain.md) | 认证调用经自有域名转发 | 提议 |
| [0008](0008-package-manager.md) | 使用 npm 作为包管理器 | 提议 |

> 所有 ADR 在 Phase 0 结束时状态为"提议"，需要产品负责人在批准 Phase 0 时一并确认。
