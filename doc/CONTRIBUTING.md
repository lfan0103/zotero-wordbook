# Zotero Wordbook 开发文档

## 项目概述

从 PDF 高亮提取生词，获取原句和释义，导出生词本，支持不背单词、Anki 和自定义字段 CSV。

- **目标平台**：Zotero 7 / Zotero 9
- **技术栈**：TypeScript + esbuild + zotero-plugin-toolkit
- **构建工具**：zotero-plugin-scaffold
- **Node.js 版本**：20+（使用 nvm 管理，推荐 v22）

## 目录结构

```
├── addon/                      # 静态资源（构建时复制）
│   ├── content/
│   │   └── preferences.xhtml   # 偏好设置 UI
│   ├── locale/
│   │   ├── zh-CN/              # 中文文案
│   │   └── en-US/              # 英文文案
│   └── icons/                  # 图标资源
├── doc/
│   └── screenshots/            # README 截图
├── src/                        # 主代码
│   ├── index.ts                # 入口：注册全局实例
│   ├── addon.ts                # Addon 类：生命周期 + 数据
│   ├── hooks.ts                # Zotero 生命周期钩子
│   ├── modules/
│   │   ├── annotations.ts      # 核心：标注收集、句子提取
│   │   ├── exporter.ts         # 核心：导出逻辑、文件保存
│   │   ├── wordbookMenu.ts     # 工具菜单注册
│   │   ├── preferences.ts      # 偏好面板注册
│   │   └── preferenceScript.ts # 偏好面板交互（JS）
│   └── utils/
│       ├── locale.ts           # 本地化（Fluent）
│       ├── prefs.ts            # 偏好读写封装
│       └── ztoolkit.ts         # ztoolkit 初始化
├── typings/                    # 类型声明
├── package.json                # 依赖和脚本
├── zotero-plugin.config.ts     # 构建配置
└── tsconfig.json               # TypeScript 配置
```

## 核心架构

### 生命周期

```
onStartup
  ├── initLocale()              # 初始化多语言
  ├── registerWordbookPreferences()  # 注册偏好面板
  └── onMainWindowLoad()        # 每个窗口加载
        ├── createZToolkit()    # 创建 ztoolkit 实例
        └── registerWordbookMenu()  # 注册菜单
```

### 数据流

```
PDF 阅读器高亮
    ↓
annotations.ts
    ├── collectAttachmentHighlights()   # 收集所有高亮标注
    ├── getAttachmentFullText()         # 获取 PDF 全文
    └── extractSentence()               # 提取原句（核心算法）
        ↓
exporter.ts
    ├── performExport()
    │     ├── 颜色过滤（normalizeColor）
    │     ├── 去重（seen Set）
    │     └── 按格式生成内容
    │           ├── bbdc-txt：纯文本
    │           └── csv：按字段配置生成
    └── showExportConfirmDialog()       # 确认对话框
        ↓
保存到文件
```

### 句子提取算法

位置：`src/modules/annotations.ts:extractSentence()`

1. **文本标准化**：合并空格、保留换行
2. **段落定位**：通过 `\n\n` 或 `\n` + 大写字母找段落边界
3. **句子边界**：在段落内找 `.!?` 或 `\n` + 大写字母
4. **输出**：完整句子（不加省略号）

## 开发规范

### 命名约定

- **常量**：`UPPER_SNAKE_CASE`（如 `CSV_FIELD_ORDER`）
- **函数**：`camelCase`
- **接口/类型**：`PascalCase`（如 `HighlightAnnotationDebugInfo`）
- **文件**：`kebab-case`

### 新增功能指南

#### 1. 新增模块

在 `src/modules/` 下创建文件，在 `hooks.ts` 中引用和调用。

#### 2. 新增设置项

三处修改：
1. **文案**：`addon/locale/{zh-CN,en-US}/preferences.ftl`
2. **UI**：`addon/content/preferences.xhtml`（XUL/HTML 混合）
3. **交互**：`src/modules/preferenceScript.ts`

示例（新增复选框）：
```xml
<!-- preferences.xhtml -->
<hbox align="center" style="margin: 8px 0;" flex="1">
  <html:label style="width: 100px; text-align: right; margin-right: 8px;">
    新选项
  </html:label>
  <html:input
    type="checkbox"
    preference="newPrefKey"
  />
</hbox>
```

#### 3. 新增菜单项

在 `src/modules/wordbookMenu.ts` 中：
```typescript
const itemNew = doc.createXULElement("menuitem");
itemNew.setAttribute("label", getString("menuitem-new-label"));
itemNew.addEventListener("command", async () => {
  // 执行逻辑
});
menupopup.appendChild(itemNew);
```

#### 4. 新增本地化文案

在 `addon/locale/zh-CN/addon.ftl`：
```fluent
menuitem-new-label = 新功能
```

## 关键技术点

### 1. XUL vs HTML 元素

Zotero 使用 XUL（XML User Interface Language），和 HTML 混合使用：

| 场景 | 元素类型 | 创建方式 |
|------|---------|---------|
| 菜单、工具栏 | XUL | `doc.createXULElement("menu")` |
| 对话框内容 | HTML | `doc.createElement("div")` |
| 表单控件 | HTML | `doc.createElement("input")` |

### 2. 偏好存储

简单值（字符串、布尔）：
```typescript
// 使用 prefs.ts 封装
getPref("targetHighlightColor");  // 读取
setPref("targetHighlightColor", "#aaaaaa");  // 写入
```

复杂对象（如 CSV 字段配置）：
```typescript
// JSON 序列化后存储
const config = JSON.stringify(fields);
Zotero.Prefs.set("extensions.zotero.wordbook.csvFieldConfig", config, true);
```

### 3. ztoolkit.Dialog

创建对话框：
```typescript
const dialog = new ztoolkit.Dialog(rows, cols);
dialog.addCell(row, col, { tag: "p", ... }, mergeCol);
dialog.addButton("确认", "confirm").addButton("取消", "cancel");
dialog.setDialogData(dialogData).open("标题");
```

**注意**：
- checkbox 必须通过 `addCell` 独立添加，ztoolkit 才能追踪状态
- `mergeCol=true` 让元素跨列
- 使用 `dialogData[id]` 获取 checkbox 状态

### 4. 颜色处理

标准化比较：
```typescript
function normalizeColor(color: string): string {
  return color.trim().toLowerCase();
}
```

## 构建和调试

### 环境准备

```bash
# 使用 nvm 切换 Node 版本
nvm use 22

# 安装依赖
npm install
```

### 常用命令

```bash
npm start        # 开发模式，热重载
npm run build    # 生产构建（生成 .scaffold/build/*.xpi）
```

### 调试技巧

1. **查看日志**：Zotero → Tools → Developer → Error Console
2. **输出调试**：`Zotero.debug("[Wordbook] message")`
3. **插件日志**：`ztoolkit.log("message")`（自动带前缀）
4. **检查元素**：右键 → Inspect（需要开启开发者工具）

### 常见问题

#### 构建失败

```
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
```
**原因**：Node 版本过低（< 20）
**解决**：`nvm use 22`

#### 偏好不保存

**检查点**：
- `getPref` 的 key 是否在 `PluginPrefsMap` 中定义
- 复杂对象是否已 JSON 序列化
- 是否通过 `Zotero.Prefs.set` 的第三个参数 `true`（用户偏好）

#### UI 不生效

**检查点**：
- ftl 文件是否包含新 key
- XHTML 是否通过构建（检查 `.scaffold/build`）
- CSS 是否被覆盖（使用 `!important` 或更具体的选择器）

## UI 设计规范

### 对齐标准

```
标签（固定宽度 100px，右对齐） | 控件（flex="1"，占满剩余）
```

### 输入框样式

```css
height: 28px;
border: 1px solid #ccc;
border-radius: 0;
padding: 2px 6px;
```

### Menulist 样式

```css
background-color: white;
border: 1px solid #ccc;
border-radius: 0;
-moz-appearance: none;
height: 28px;
padding: 2px 6px;
```

### 对话框规范

- 标题：`getString("dialog-title")`（多语言）
- 消息文本：`margin: 24px 32px; min-width: 280px;`
- 按钮：确认在右，取消在左（符合 macOS 习惯）

## 扩展方向

### 近期计划

- **颜色选择器**：将 `<input type="text">` 改为 `<input type="color">`
- **生词预览**：在 Zotero 中新增面板/标签页，展示所有单词卡片
- **Anki 牌组**：直接生成 `.apkg` 格式（需研究 Anki 文件结构）

### 技术债务

- 句子提取算法：学术 PDF 格式多样，需持续优化边界检测
- 国际化：部分提示文本仍硬编码中文，需补全 `addon.ftl`
- 测试：目前无自动化测试，建议添加单元测试（annotations.ts 的 extractSentence）

## License

本项目基于 Zotero Plugin Template 开发，采用 AGPL-3.0-or-later 协议。
