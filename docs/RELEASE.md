# 发布与桌面打包

## 当前状态

- 目标版本：v3.38.2
- 桌面端：Electron 33
- 打包：`asar: true`
- 签名：未配置证书；`signAndEditExecutable: false`，安装包会显示未知发布者
- 自动更新：未接入
- 发布前必须重新构建 `dist`，不要直接使用旧 release

## 命令

```bash
pnpm check
pnpm pack:dir
pnpm dist
```

- `pack:dir`：生成 `release/win-unpacked/`，用于启动冒烟和免安装验证。
- `dist`：生成 NSIS 安装包；当前未签名，只用于内部测试。
- 不要在没有备份的情况下覆盖 `release/` 里的历史安装包。

## 标题栏

打包版使用 Electron 无边框窗口（`frame: false`）+ preload IPC 自绘标题栏。标题栏包含最小化 / 最大化 / 关闭，颜色跟随主题，页面顶部保留 38px 拖拽区，避免 Windows 原生白条和系统按钮颜色不一致。

## 桌面冒烟

```powershell
.\release\win-unpacked\Shuoxi.exe --smoke-test
```

预期：

- 本地静态服务启动；
- 窗口加载首页；
- 生成 `electron-smoke.png`；
- 退出码为 0。

如果 asar 后资源读取失败，优先检查：

1. `electron/main.cjs` 中的 `dist` 路径和 `preload` 路径；
2. `electron/appProtocol.cjs` 的 `fs.readFile` 是否能读取 asar 内资源；
3. `package.json build.files` 是否遗漏 `dist/**/*` 或 `electron/**/*`。

## 签名

当前没有代码签名证书。正式发布前需要：

1. 准备 Windows 代码签名证书；
2. 在 CI 或本机设置 `CSC_LINK` / `CSC_KEY_PASSWORD`；
3. 移除 `signAndEditExecutable: false`；
4. 重新执行 `pnpm dist`；
5. 在干净 Windows 机器上验证安装、启动、卸载。

没有证书时不要宣称“已签名”。

## 安全边界

- API Key 由渲染层保存，当前仍在 localStorage；迁移到 Windows 凭据管理器尚未完成。
- 本地 `/llm-api` 代理已拒绝非本机 Origin。
- 本地服务只监听 `127.0.0.1`。
- 发布包不包含 API Key、作品数据或用户设置。
- 项目备份不导出 API Key。

## 发布前检查

- [ ] `pnpm check`
- [ ] `pnpm test:e2e`
- [ ] `pnpm test:e2e:backup`
- [ ] `pnpm test:e2e:save`
- [ ] `pnpm test:e2e:find`
- [ ] `pnpm pack:dir`
- [ ] `--smoke-test` 启动
- [ ] 干净 Windows 安装 / 卸载
- [ ] 版本号统一：package.json / version.ts / README / 安装包
- [ ] 备份源码
- [ ] 不把 API Key、测试小说、截图缓存打进安装包
