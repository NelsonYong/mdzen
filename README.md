# mdpeek

本地 Markdown 预览服务器，支持热更新（HMR）、目录导航、代码高亮和 Admonition 语法块。

## 安装

```bash
# 全局安装（推荐）
npm install -g mdpeek

# 或使用 pnpm
pnpm add -g mdpeek
```

无需配置，安装后即可使用。

---

## 快速开始

在任意包含 `.md` 或 `.mdc` 文件的目录下运行：

```bash
mdpeek
```

打开浏览器访问 `http://localhost:3456`，即可看到当前目录下所有 Markdown 文件的列表。

---

## 如何预览指定目录

使用 `-d` 选项指定文档根目录：

```bash
mdpeek -d ./docs
mdpeek -d /Users/me/notes
```

启动后访问 `http://localhost:3456`，左侧以树形结构展示所有 `.md` / `.mdc` 文件，点击即可预览。

## 如何使用自定义端口

默认端口为 `3456`，使用 `-p` 更换：

```bash
mdpeek -d ./docs -p 8080
```

之后访问 `http://localhost:8080`。

## 如何停止服务

在另一个终端窗口执行：

```bash
mdpeek stop
```

如果启动时使用了自定义端口，停止时也需指定：

```bash
mdpeek stop -p 8080
```

---

## 文档实时更新

保存 Markdown 文件后，浏览器中的内容会**自动局部刷新**，无需手动重载页面。右上角的绿色圆点表示连接状态：

| 颜色 | 含义 |
|---|---|
| 绿色 | 已连接，监听中 |
| 黄色 | 正在更新内容 |
| 红色 | 连接断开，5 秒后自动重连 |

---

## Admonition 语法块

在 Markdown 中使用 `:::` 语法插入高亮提示块：

```markdown
:::info
这是一条普通信息。
:::

:::tip 最佳实践
可以在类型后面自定义标题。
:::

:::warning
操作前请注意备份。
:::

:::danger
此操作不可逆。
:::
```

支持的类型：`info` · `tip` · `warning` · `danger` · `caution` · `note`

---

## Frontmatter 显示

文件顶部的 YAML frontmatter 会以结构化样式展示在正文上方：

```markdown
---
title: 我的文档
author: Alice
draft: false
tags: guide, tutorial
---

正文内容...
```

`boolean` 值以绿/红徽章显示，逗号分隔的值以标签形式展示。

---

## CLI 参考

### 启动服务

```
mdpeek [选项]
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `-d <路径>` | 当前目录 | 指定文档根目录（绝对路径或相对路径） |
| `-p <端口>` | `3456` | 指定监听端口 |
| `-h, --help` | — | 显示帮助信息 |

### 停止服务

```
mdpeek stop [-p <端口>]
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `-p <端口>` | `3456` | 停止指定端口上运行的服务 |

---

## 运行环境

- Node.js ≥ 18.0.0

## 许可证

ISC
