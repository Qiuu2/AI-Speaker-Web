// 笔 7a-2: T39 plans tab 草稿 badge tag 删除验证(template-level static check).
// 通过 import 出 .vue 单文件组件的 template 源(SFC compiler 已经把它放进
// 组件对象的 render / staticRenderFns,但更稳的做法是用 vue-template-compiler
// 解析 raw file). 这里取最直接的: fs 读 src raw, grep 文案存在性,作为
// "header 模板里不再出现 '作息方案草稿待上传' / '当前显示作息方案草稿' tag"
// 的非空洞断言.

import fs from 'fs'
import path from 'path'

const SFC_PATH = path.resolve(__dirname, '../../../src/views/task-scheduler/index.vue')

describe('T39 笔 7a-2 plan-draft badge removal (template)', () => {
  let source

  beforeAll(() => {
    source = fs.readFileSync(SFC_PATH, 'utf-8')
  })

  it('removes the header "作息方案草稿待上传" badge tag', () => {
    expect(source).not.toMatch(/作息方案草稿待上传/)
  })

  it('removes the plans-tab toolbar "当前显示作息方案草稿" badge tag', () => {
    expect(source).not.toMatch(/当前显示作息方案草稿/)
  })

  it('keeps the file-broadcast badge tag (T36 BSJ lane is independent)', () => {
    expect(source).toMatch(/文件广播草稿待上传/)
  })

  it('keeps "放弃方案草稿" buttons (badge gone, manual discard left as escape hatch for legacy state)', () => {
    expect(source).toMatch(/放弃方案草稿/)
  })
})
