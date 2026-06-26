# AI私塾

AI驱动的英语学习应用，内置57,000+词汇库，支持AI口语陪练、语法纠错、写作批改、智能练习等多种学习模式。

## 功能特色

### 词汇学习
- **5大词库分类**：小学、初中、高中、四六级、考研、托福雅思、新概念等77个词本
- **5种背词模式**：翻转卡片、拼写、遮挡回忆、听力填词、语境填空
- **艾宾浩斯复习**：基于遗忘曲线的智能复习推荐
- **听写模式**：全屏沉浸式听写练习

### 智能练习
- **多种题型**：单选、多选、判断、填空、简答
- **5种练习模式**：顺序、随机、限时、竞速、闯关
- **错题本**：自动收录错题，支持按题型分析薄弱点

### AI学习助手
- **口语陪练**：多场景角色扮演对话（餐厅、医院、酒店、机场等）
- **语法纠错**：AI实时批改语法错误并解释
- **写作批改**：AI评分与改进建议
- **复习推荐**：基于学习数据的个性化复习建议

### 数据统计
- 每日学习数据追踪
- 累计成就与连续学习天数
- 学习效能指标

## 技术栈

- **框架**：Expo 55 + React Native 0.83
- **UI**：NativeWind 4.2 + shadcn/ui (new-york)
- **路由**：Expo Router 55 (file-based)
- **数据库**：Expo SQLite (本地) + Supabase (云端)
- **AI**：DeepSeek API (云端)

## 快速开始

### 环境要求
- Node.js 18+
- npm
- Android Studio (构建Android)

### 安装

```bash
git clone https://github.com/WuYu707/AI-Sishu.git
cd AI-Sishu
npm install
```

### 配置

复制 `.env.example` 为 `.env`，填入以下配置：

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_APP_ID=your_app_id
```

### 开发

```bash
npx expo start
```

### 构建 Android APK

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

> **注意**：Windows 环境请使用 `gradlew.bat` 替代 `./gradlew`

## 下载

前往 [Releases](https://github.com/WuYu707/AI-Sishu/releases) 页面下载最新 APK。

当前版本：**v0.1.60** (44.6 MB, 仅支持 ARM64)

## 项目结构

```
src/
├── app/
│   └── (app)/
│       ├── (tabs)/          # 底部导航（首页、AI、统计、我的）
│       ├── wordbook/         # 词库管理与背词
│       ├── practice/         # 练习与错题本
│       ├── ai-study/         # AI学习（口语、语法、写作、复习推荐）
│       └── settings/         # 设置（AI配置、OCR、外观、语言等）
├── lib/
│   ├── AppContext.tsx        # 全局状态管理
│   ├── aiService.ts         # AI服务调用
│   ├── database.ts          # SQLite 数据库
│   └── wordbank.json         # 57K+ 词汇数据
└── components/               # 公共组件
```

## 许可证

[Apache License 2.0](LICENSE)

Copyright 2026 WuYu707
