# 0.3.3 验证记录

验证日期：2026-11-10；Windows x64、Electron 45.2.3。

## 本次改动

- PDF每批最多20页，未填写页码时默认读取前20页；长PDF提示剩余页需手动选择，不自动继续。
- PDF的20张页图可通过本机读取、AI请求校验、入库及备份恢复。资料保留格式标记，区分PDF页图与照片；旧资料和备份仍兼容。
- 照片最多6张、文件合计20MB、正文2万字符、每批6篇合计30题及原有图片体积预算保持不变。不设置AI输出token上限。
- 同步更新界面说明、页码错误提示、使用说明与启动入口。

## 验证

- npm test：28/28通过，包括20页边界、21页及累计超限拦截、12页完整范围、指定后20页、20张PDF页图备份恢复与照片6张限制。
- npx playwright test tests/import.spec.ts：8/8通过。真实21页结构PDF默认仅读取前20页，发送20张页图、确认入库后可查看全部页图，重新载入后仍可恢复；超量照片、20MB文件及2万字符约束继续有效。
- TypeScript与Vite生产构建通过。
- 发行目录release/win-unpacked/Lingo伴学.exe通过document-smoke：真实DOC/DOCX解析、损坏文件拦截、file://下PDF字体与worker、扫描PDF、文字模型/视觉请求、原资料保存、取消请求和截断响应处理。
- 打包版实测20页PDF读取、20张图片经IPC发送至本机模拟AI并保存成功；21页请求和7张照片分别被拦截，请求未携带max_tokens或max_completion_tokens。
- 便携包从上述已验证发行目录生成；audit-release通过，确认包内PDF页数20、照片数6、版本一致、模型与许可及离线PDF资源齐全，不含项目测试题、测试目录或vendor示例目录。

测试使用后台Chrome、隐藏Electron窗口、独立临时数据和本机模拟AI，测试窗口已关闭；没有调用个人AI额度或修改现有AI配置。实际识别质量取决于用户配置的模型。20页是页数上限，较长正文、较大图片及超过30题的材料仍需分批。

## 发行包

- 文件：release/Lingo-Study-0.3.3-Windows.exe
- 版本：0.3.3
- 大小：538,034,543字节
- SHA-256：1541ed91f2ed97b321396501aa4a7df53400ae85e4fc36b6608a33eeb8950a7f

采用electron-builder --win portable --x64 --prepackaged release/win-unpacked --config.compression=store快速封装；项目默认npm run pack压缩配置未改变。

[Windows桌面版](../release/Lingo-Study-0.3.3-Windows.exe) · [使用说明](../README.md) · [0.3.2历史验证](VALIDATION-0.3.2.md)
