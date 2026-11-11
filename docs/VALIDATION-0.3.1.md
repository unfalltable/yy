# 0.3.1 验证记录

验证日期：2026-11-09；Windows x64、Node.js 24.19.0、Electron 45.2.3。

本版按用户要求取消AI输出token上限：请求不发送max_tokens或max_completion_tokens参数，移除统一配置及界面中的8000 tokens提示。实际输出长度由所选模型和服务端决定；服务端截断时会给出提示。

文件与分批规则继续保留：单文件及本批合计20MB、PDF每批6页、照片或Word图片6张、正文2万字符、提取最多6篇合计30题、文章出题每次1篇5题。不自动续批或重试。

## 本次验证

- npm test：22/22通过。
- npm run pack：TypeScript、生产构建和Windows便携包生成通过。
- 最终发行目录中的Lingo伴学.exe运行document-smoke通过。检查真实桌面IPC发送到本机模拟服务的请求：图片模型与文字模型请求均不包含max_tokens和max_completion_tokens。
- 同一检查还覆盖DOC/DOCX内嵌图片、损坏文件、file://下PDF文字页/扫描页、原图核对、确认入库、图片超量拦截、取消和服务端输出截断。
- 最终发行目录程序运行electron-smoke通过：沙箱、Windows密钥加密、本机对话与ASR、目标流程、本地3D、陪练界面和数据重载。
- node scripts/audit-release.cjs通过：版本一致，Word线程、PDF离线资源、模型与许可完整，不含项目测试题和开发目录。
- 本次为token策略修改，未重复全量界面测试；上一版19项界面测试记录见[0.3.0历史验证](VALIDATION-0.3.0.md)。

检查使用独立临时数据目录、隐藏窗口和本机模拟服务，未调用用户付费AI接口，测试窗口均已关闭。真实模型的识别与出题质量尚未验收。既有6项打包工具链中危开发依赖问题仍保留，本次未升级依赖或强制降级。

## 发行包

- 文件：release/Lingo-Study-0.3.1-Windows.exe
- 版本：0.3.1
- 大小：137,319,132字节
- SHA-256：14e3cb50d8726e7bf3b2eeddf3feccce6db012db466e037bcd52e1477fded841

[Windows桌面版](../release/Lingo-Study-0.3.1-Windows.exe)

题型、扫描件识别及跟读能力限制继续见[使用说明](../README.md)。
