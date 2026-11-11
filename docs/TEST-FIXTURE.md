# 测试数据与角色

测试题库只使用 [TITLE_FIELD]、[STEM_FIELD] 等结构占位字段，不含可作为英语练习的生成内容，也不进入发行包。内置学习题库保持为空。

scripts/make-document-fixtures.cjs 生成文字PDF、扫描PDF、DOCX、照片与TXT结构占位材料，位于 tests/fixtures，用于验证真实解析和文件流程。

tests/fixtures/legacy.doc 来自 [morungos/node-word-extractor](https://github.com/morungos/node-word-extractor/blob/main/__tests__/data/test01.doc) 的MIT许可测试材料，用于验证旧Word二进制格式。该项目许可见 [LICENSE](https://github.com/morungos/node-word-extractor/blob/main/LICENSE)。未将此材料作为学习题目，亦不进入发行包。

两个发行模型见 [模型许可](../assets/AVATAR-LICENSES.md)。默认模型会在浏览器与Windows桌面测试中真实加载，不跳过3D检查。.tools/fixtures中的VRM为校验副本，不进入发行包；发行资产位于assets/。
