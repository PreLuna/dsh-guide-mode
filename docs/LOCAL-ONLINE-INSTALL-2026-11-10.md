# 本机切换到网络发布包的安装测试

2026-11-10（Asia/Shanghai），用户明确要求将日常安装来源切换到网上下载的对应版本，并确认工作已保存、允许重启 desktop。此次为本机一次性运维切换，不等于通用 5E 迁移界面及全部故障场景已经实现。后续 2026-11-16 已通过 manager 升级将本机 manager 从 1.2.0 升到 1.3.0，六组件仍为 1.1.0；见 [manager 升级证据](../evidence/live-manager-upgrade-2026-11-16/live-manager-upgrade-result.json)。

## 结果

已将 `C:/Users/wang/.dsh/profiles/desktop` 中七个指导模式自有包从工作区 `link:` 切换为真实网络下载、SHA 校验后的发布包，重启并通过实际管理页核对：manager 1.2.0，六组件均 1.1.0 / ready。发布目录来自 [guide-v1.3.0](https://github.com/PreLuna/dsh-guide-mode/releases/tag/guide-v1.3.0)，历史组件附件按清单所引用的固定 tag 下载，未用本地重新打包的包代替网络下载。

安装声明中的 `file:.../.guide-manager/package-cache/<sha256>.tgz` 是网络发布包的稳定校验缓存，不再是开发源码 link。保留这种来源是为了让既有升级、修复和离线恢复逻辑可以精确定位包。管理器默认公开仓库配置仍生效。

逐个校验实际安装文件与远端 tgz 的 SHA，并确认包目录不再指向原源码。源码与发布包的差异仅为 CRLF/LF，未发现功能代码变化；源码目录未删除、未改写。其他直接依赖的 spec / 解析版本保持不变，其他 link 的锁文件相对路径标准化后仍指向原目录。`cordis.patch.yml` 和 `pnpm-workspace.yaml` 字节未变。未执行模型推理。

## 测试与切换顺序

1. 匿名获取正式清单、核对 tag/commit，下载七个对应版本并检验 SHA / tar / 名称 / 版本。
2. 保存日常四文件及七个包的随包源码快照，比较本地与发布内容。
3. 使用日常配置的独立副本，验证安装后核对失败时恢复四文件及原 link，再成功切换并启动独立桌面，六组件全部 ready。
4. 用户确认允许重启后，仅停止经可执行文件、PID、创建时间和命令行核实的日常 desktop 树；另一独立 DSH 进程保持运行。
5. 在官方 profile 锁内使用宿主的 pnpm 安装。仅移除七个经核实的 junction 入口及旧锁解析项，不递归处理源码；其他依赖、bundle 和启停配置保留。
6. 临时启用 loopback 调试连接，通过真实管理页检查运行状态并截图；结束后清理测试实例，以普通参数重新启动日常桌面。

发现 pnpm 会沿用同版本 link 的旧锁解析：仅改变 manifest、unlink 或强制安装都不足以证明来源已切换。最终仅清除七个待迁移包的旧 importer 解析项，再进行显式安装，并核对实际目录和文件内容。失败的隔离尝试及日志全部保留，日常切换只在成功验证后进行。

## 备份与证据

独立备份目录：`C:/Users/wang/.dsh/profiles/desktop/.guide-manager/source-switch-backups/1794272997632`。包含操作前四文件、原 link/source 记录及 `sources/` 下七个可校验源码 tgz。原开发目录仍保留。

运行回执：profile 下 `.guide-manager/source-switch-result.json`，状态为 `verified-running`，包含各包远端 tag / asset / commit 和 SHA。详细计划、下载物、差异、失败/成功日志、隔离及日常截图见 [验收目录报告](../evidence/install-online-2026-11-10/report.md)。

如需恢复原开发安装，须先停止该 desktop，在官方写锁内恢复备份四文件、使用原 link 重新安装依赖图，再重启检查；不要在运行中的 profile 直接覆盖锁文件。源码路径发生变化时需要先从保存的源码 tgz 制定恢复来源，不能冒称原 link 已恢复。本轮已验证普通失败自动恢复，未验证源码目录丢失或任意断电中断恢复；这些仍属于后续通用 5E 工作。
