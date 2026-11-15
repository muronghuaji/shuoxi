# 说戏技能格式

## 1. 说明

说戏的技能不是可执行脚本。

一个技能由：

- 文本指令；
- 声明式工具；
- 可选参考资料；
- 输出类型；
- 模型档位；

组成。

运行技能时，软件会：

1. 读取当前作品和章节；
2. 根据 `tools` 收集本地数据；
3. 把工具数据注入提示词；
4. 调用 AI；
5. 显示结果。

技能不会：

- 执行命令；
- 访问网络；
- 写文件；
- 自动修改正文；
- 调用其他技能。

## 2. JSON 格式

```json
{
  "id": "custom.my-skill",
  "name": "我的技能",
  "description": "这个技能做什么",
  "category": "检查",
  "output": "advice",
  "profile": "general",
  "tools": ["chapter", "characters", "story_state"],
  "instructions": "给模型的详细指令。",
  "resources": [
    {
      "name": "参考标准",
      "text": "这里放参考内容。"
    }
  ],
  "version": 1
}
```

## 3. 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| id | 是 | 唯一 id；导入时会自动改成 custom.* |
| name | 是 | 技能名 |
| description | 否 | 说明 |
| category | 否 | 检查 / 润色 / 结构 / 自定义 |
| output | 否 | advice 或 rewrite |
| profile | 否 | general 或 writing |
| tools | 否 | 工具名数组 |
| instructions | 是 | 技能指令 |
| resources | 否 | 参考资料，最多 8 条 |
| version | 否 | 版本号 |

## 4. 输出类型

### advice

只输出：

- 问题；
- 建议；
- 审查结果。

适合：

- 场景诊断；
- 连续性审查；
- 章节收尾。

### rewrite

输出改写后的文本。

适合：

- 对白打磨；
- 局部润色；
- 去肢体动作腔。

结果只显示，不会自动替换正文。

## 5. 工具

工具不是外部执行器，而是本地数据注入器。

### chapter

注入当前章节正文，最多 12000 字。

### selection

注入当前选中文本，最多 4000 字。

没有选中文本时会说明。

### characters

注入前 12 个角色的：

- 名字；
- 定位；
- 身份；
- 核心矛盾；
- 语气登记。

### story_state

注入：

- 当前剧情摘要；
- 最近 8 个事件；
- 未解决线索。

### recent_chapters

注入最近 3 章的摘要或结尾。

### stats

注入：

- 字数；
- 段落数；
- 含对白段落数；
- 平均段长。

## 6. 工具声明示例

```json
{
  "id": "custom.continuity",
  "name": "连续性检查",
  "category": "检查",
  "output": "advice",
  "profile": "general",
  "tools": ["chapter", "characters", "story_state", "recent_chapters"],
  "instructions": "检查本章是否违反人物认知、位置、时间和事件设定。只输出问题列表。",
  "version": 1
}
```

## 7. 参考资料

`resources` 会作为独立区块加入提示词：

```text
【技能资料·名称】
内容
```

适合放：

- 检查表；
- 风格标准；
- 对话示例；
- 禁用词；
- 场景模板。

不要放：

- 大段受版权保护的小说；
- 与作品冲突的设定；
- 超长资料。

## 8. 导入导出

写作页 → 技能 → 导入 / 导出。

导出格式：

```json
{
  "app": "shuoxi",
  "version": 1,
  "skills": []
}
```

也支持直接导入单个技能对象或技能数组。

### SKILL.md / ZIP 技能包

也支持轻量技能包：

```text
去肢体动作腔.zip
└─ 去肢体动作腔/
   ├─ SKILL.md
   └─ references/
      ├─ 反例.md
      └─ 正例.md
```

`SKILL.md` 用 frontmatter 描述元数据，正文作为执行说明：

```markdown
---
name: 去肢体动作腔
description: 减少装饰性肢体动作
category: 润色
output: rewrite
profile: writing
tools:
  - selection
  - chapter
  - characters
  - stats
---

每 3 个自然段最多保留 1 处身体动作。
```

支持：

- `.md` 单文件导入；
- `.zip` 技能包导入；
- `references/`、`assets/`、`examples/` 下的 md / txt / json 作为参考资料；
- 导出当前技能为 `.zip`。

限制：

- 不执行脚本；
- 不联网；
- 遇到 exe、dll、js、bat 等可执行文件会拒绝整个技能包；
- 最多 8 个参考资料；
- 单个文件和解压后的总文本有大小上限。

## 9. 优先级

技能输出只是参考。

不会自动覆盖：

- 正文；
- 人物档案；
- 事件；
- 同步状态。

## 10. 安全限制

不支持：

- 脚本；
- 命令；
- 网络请求；
- 文件读写；
- 外部工具；
- 自动多步工具循环。

这样做是为了避免导入技能时执行任意代码。
