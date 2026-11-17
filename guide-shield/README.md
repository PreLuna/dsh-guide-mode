# guide-shield

独立 Host 服务，保护已结算指导不把迟到通知重新注入父会话。支持 DSH `0.2.1-rc.3` / Cordis `4.0.5`。

## 行为

- 包装父会话的 `followup` / `steer` / `inject`；
- 对已确认的指导保留一次性结算凭据，按精确父对象分组；
- 投递时消费凭据；新同 ID 生命周期、父释放或服务卸载时清理；
- 每父最多 128 条、10 分钟惰性过期，仅保存 ID/时间；
- panel 热更新或禁用不卸载 shield；
- 服务自身卸载会失活并释放包装；
- 第三方保留的旧 wrapper 直通原方法。

## 状态

启动后检查：

```text
/guide/api/state → settlementShield.mode = active
                   settlementShield.inject = true
```

缺服务时 panel 报告 `off` / `host-service-unavailable`。单独卸载 shield 会有意解除防护。

## 安装

由 manager 六组件安装/升级流程管理，配置位于 `guide-shield/cordis.patch.yml`，默认 `enabled:true`、`inject:true`。不要与旧 panel 自定义 shield override 同时生效。

## 边界

- 不覆盖服务自身卸载/HMR、整个 subagent/sessions 服务替换；
- 不承诺硬崩溃的数据耐久性；
- 不承诺未知宿主版本；
- shield 与 panel 的生命周期独立，回退需配套源码版本和 profile。

## 验证

```powershell
node guide-panel/scripts/lifecycle-smoke.mjs
```

使用隔离 profile、panel 复制件和真实 Host 进程，不访问真实 desktop、不调用外部模型。
