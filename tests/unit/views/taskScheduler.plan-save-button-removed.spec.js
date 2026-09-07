// 笔 7a-3: T39 "保存上传" 按钮 plans 分支删. 完整 SFC 渲染对 jest 来说太
// 重(jsdom + element-ui), 这里改用 SFC 源文件 + grep 验证 button 的可见性
// 条件已经从 unconditional 改成 hasBroadcastDraft-gated.

import fs from 'fs'
import path from 'path'

const SFC_PATH = path.resolve(__dirname, '../../../src/views/task-scheduler/index.vue')

describe('T39 笔 7a-3 save-upload button gated on hasBroadcastDraft only', () => {
  let source

  beforeAll(() => {
    source = fs.readFileSync(SFC_PATH, 'utf-8')
  })

  it('the "保存上传" button now carries v-if="hasBroadcastDraft" so plan-tab edits stop summoning it', () => {
    // 'save-cta' is the class anchor for the header save button. The
    // surrounding tag in the source should bear the v-if directive.
    const ctaIndex = source.indexOf('class="save-cta"')
    expect(ctaIndex).toBeGreaterThan(-1)
    // pull the el-button tag that contains save-cta (looking backwards for
    // the opening <el-button).
    const openTagStart = source.lastIndexOf('<el-button', ctaIndex)
    expect(openTagStart).toBeGreaterThan(-1)
    const tagOpen = source.slice(openTagStart, ctaIndex)
    expect(tagOpen).toMatch(/v-if="hasBroadcastDraft"/)
  })

  it('save button text still reads 保存上传 (we did not break the broadcast path label)', () => {
    expect(source).toMatch(/保存上传/)
  })

  it('savePendingChanges click handler is still wired (only the visibility gate changed)', () => {
    expect(source).toMatch(/@click="savePendingChanges"/)
  })
})
