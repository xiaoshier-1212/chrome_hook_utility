# chrome_hook_utility

这是一个 chrome 功能 hook 的仓库
用于检查，观测，chrome 健康状态

## 使用方式

1. 将 `cursor-hooks` 目录里的 `hooks` 目录和 `hooks.json` 放入到项目根目录的 `.cursor` 目录下

2. 首次在 Cursor 中执行任意 Shell 命令后，hook 会自动将 `.vscode/tasks.json` 写入项目根目录

3. VSCode 任务配置写入后，每次打开项目文件夹时会自动在后台启动 `health-monitor-mac`，无需手动执行