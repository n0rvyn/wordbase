/** Public workbench links reviewed from the approved design's visible #apps page,
 * https://norvyn-design-study.n0rvyn.chatgpt.site/#apps (2026-11-03).
 * Kept local: no visitor-time GitHub requests, inferred release or maintenance claims.
 */
import repositorySnapshot from '../data/public-repositories.json';

const categories = {
  plugin: ['插件', 'Plugin'], tool: ['工具与库', 'Tools & libraries'],
  app: ['应用', 'App'], experiment: ['实验', 'Experiment'], config: ['配置', 'Configuration'],
} as const;
const entries = [
  ['transbridge', 'plugin', 'Python', '为 Codex／ChatGPT 桌面连接 Garmin Connect 的本地插件集。', 'Local plugins connecting Codex and ChatGPT to Garmin Connect.'],
  ['claudex', 'app', 'Swift', '把 Claude Code 请求接入 ChatGPT 授权模型的 macOS 本地网关。', 'A local macOS gateway connecting Claude Code requests to ChatGPT-authorized models.'],
  ['personal-os', 'plugin', 'Python', '涵盖知识整理、领域情报与内容制作的 Claude Code 插件集。', 'Claude Code plugins for knowledge, research, and content creation.'],
  ['wordbase', 'tool', 'TypeScript', '支持博客、播客与应用作品的内容管理系统。', 'A content system for writing, podcasts, and a portfolio of apps.'],
  ['model-proxy', 'app', 'Swift', '在 macOS 菜单栏按模型名称把请求路由到不同提供方。', 'Route model requests to different providers from the macOS menu bar.'],
  ['indie-toolkit', 'plugin', 'Python', '面向 Apple 开发、工程工作流与 macOS 操作的 Claude Code 插件集。', 'Claude Code plugins for Apple development, engineering workflows, and macOS.'],
  ['swift-mail-core', 'tool', 'Swift', '基于 Network.framework 的 Swift IMAP 与 SMTP 客户端库。', 'Swift IMAP and SMTP clients built on Network.framework.'],
  ['Pico', 'app', 'Swift', '以 SwiftUI 与 SwiftData 构建的 macOS 本地照片库源码。', 'A local macOS photo library built with SwiftUI and SwiftData.'],
  ['swift-llm-gateway', 'tool', 'Swift', '为 Swift 应用封装 Anthropic 与 OpenAI 兼容模型路由。', 'Anthropic and OpenAI-compatible model routing for Swift apps.'],
  ['aipilot', 'plugin', 'TypeScript', '在 Obsidian 内尝试 AI 对话、文本润色与笔记上下文。', 'AI conversation, text editing, and note context inside Obsidian.'],
  ['cross-mind-consensus', 'experiment', 'Python', '探索多模型共识、角色讨论与结果比较的实验项目。', 'Experiments in model consensus, role-based discussion, and result comparison.'],
  ['dupclean', 'tool', 'Python', '用文件哈希识别重复文件，支持保留规则与备份选项。', 'Find duplicate files using hashes, with retention rules and backup options.'],
  ['cursor-rules', 'tool', 'Python', '面向多语言工程实践的 Cursor 规则与配置示例。', 'Cursor rules and configuration examples for engineering workflows.'],
  ['obsidian-deduplicator', 'tool', 'TypeScript', '面向 Obsidian 文件去重的工具源码。', 'Source for deduplicating Obsidian files.'],
  ['sysperftest', 'tool', 'Python', '在多台 Linux 主机上编排性能基准测试的脚本。', 'Scripts orchestrating performance benchmarks across Linux hosts.'],
  ['obsidian-notes-sync', 'plugin', 'TypeScript', '在 Obsidian 与远程笔记服务之间同步笔记的插件源码。', 'Source for syncing notes between Obsidian and a remote note service.'],
  ['obsidian-css-test', 'experiment', 'TypeScript', '基于 Obsidian 示例插件的样式与接口试验。', 'An Obsidian plugin experiment for styles and interfaces.'],
  ['fileoperator', 'experiment', 'Python', '比较大量小文件目录删除方式耗时的实验脚本。', 'Experiments comparing deletion methods for directories of small files.'],
  ['n0rvyn', 'config', '文档 / 配置', 'GitHub 个人主页的说明与配置。', 'GitHub profile documentation and configuration.'],
] as const;
const curated = entries.map(([name, category, language, zh, en]) => ({
  name, category, language, zh, en, categoryZh: categories[category][0], categoryEn: categories[category][1],
  url: `https://github.com/n0rvyn/${name}`,
}));
export const publicProjects = repositorySnapshot.map(repo => {
  const copy = curated.find(item => item.name === repo.name);
  return { name: repo.name, category: copy?.category ?? 'tool', language: repo.language ?? copy?.language ?? '—',
    zh: copy?.zh ?? repo.description ?? '', en: copy?.en ?? repo.description ?? '',
    categoryZh: copy?.categoryZh ?? '工具与库', categoryEn: copy?.categoryEn ?? 'Tools & libraries',
    url: repo.html_url, archived: repo.archived, fork: repo.fork };
});
