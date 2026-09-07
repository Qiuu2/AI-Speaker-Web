// T75: a one-time (mode=once) cancel auto-restores at its end time, so the
// "撤销" button is redundant and must be hidden — even though the backend still
// sends an undo_token. A permanent cancel (or any other undo-bearing turn) must
// still show it. Pure FE gate (shouldShowUndo / isOnceCancelActionLog); no
// props/emit/backend change.

import { shallowMount } from '@vue/test-utils'
import AiAssistantFloat from '@/components/AiAssistantFloat.vue'
import axios from 'axios'

jest.mock('axios', () => {
  const mockApi = {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() }}
  }
  return { get: jest.fn(), create: jest.fn(() => mockApi), __mockApi: mockApi }
})

const elementStubs = [
  'el-button', 'el-tooltip', 'el-drawer', 'el-input', 'el-tabs', 'el-tab-pane',
  'el-collapse', 'el-collapse-item', 'el-popover', 'el-select', 'el-option',
  'el-tag', 'el-input-number', 'el-date-picker', 'el-radio-group', 'el-radio-button'
]

function createWrapper() {
  return shallowMount(AiAssistantFloat, {
    stubs: elementStubs,
    mocks: {
      $message: { warning: jest.fn(), error: jest.fn(), success: jest.fn() },
      $notify: jest.fn(),
      $root: { $emit: jest.fn(), $on: jest.fn(), $off: jest.fn() }
    }
  })
}

// a valid once_override undo token (the shape backend emits for cancel undo).
const UNDO_TOKEN = {
  kind: 'once_override',
  override_ids: ['ov-1'],
  summary: 'cancel_schedule',
  expires_at: '2099-01-01 00:00:00'
}

function cancelLog(mode) {
  return [{ action: 'cancel_schedule', mode, schedule_name: '夏季作息', task_ids: ['1001'], details: {}}]
}

describe('T75 isOnceCancelActionLog', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
  })

  it('true for a cancel_schedule + once entry', () => {
    expect(vm.isOnceCancelActionLog(cancelLog('once'))).toBe(true)
  })

  it('false for a permanent cancel', () => {
    expect(vm.isOnceCancelActionLog(cancelLog('permanent'))).toBe(false)
  })

  it('false for a once entry of a different intent', () => {
    expect(vm.isOnceCancelActionLog([{ action: 'move_schedule', mode: 'once' }])).toBe(false)
  })

  it('false for empty / non-array', () => {
    expect(vm.isOnceCancelActionLog([])).toBe(false)
    expect(vm.isOnceCancelActionLog(null)).toBe(false)
    expect(vm.isOnceCancelActionLog(undefined)).toBe(false)
  })
})

describe('T75 shouldShowUndo gate', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
  })

  it('hides undo for a once-cancel message (has token but cancel_once_no_undo)', () => {
    const msg = { meta: { undo_token: UNDO_TOKEN, cancel_once_no_undo: true }}
    expect(vm.hasUndoToken(msg.meta)).toBe(true) // token IS present
    expect(vm.shouldShowUndo(msg)).toBe(false) // but the gate hides it
  })

  it('shows undo for a permanent-cancel message (token, not once)', () => {
    const msg = { meta: { undo_token: UNDO_TOKEN, cancel_once_no_undo: false }}
    expect(vm.shouldShowUndo(msg)).toBe(true)
  })

  it('shows undo when the flag is absent but a token exists (other intents)', () => {
    const msg = { meta: { undo_token: UNDO_TOKEN }}
    expect(vm.shouldShowUndo(msg)).toBe(true)
  })

  it('hides undo when there is no token at all', () => {
    expect(vm.shouldShowUndo({ meta: { cancel_once_no_undo: false }})).toBe(false)
    expect(vm.shouldShowUndo({ meta: {}})).toBe(false)
    expect(vm.shouldShowUndo(null)).toBe(false)
  })
})

describe('T75 end-to-end render — once-cancel hides the undo button', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function mockChat(mode) {
    axios.__mockApi.post.mockResolvedValue({
      data: {
        reply: '搞定，这次取消已经设好啦，事后会自动恢复~',
        output_speech: '搞定，这次取消已经设好啦,事后会自动恢复~',
        intent: 'cancel_schedule',
        confidence: 1,
        missing_slots: [],
        diagnostics: [],
        undo_token: UNDO_TOKEN,
        action_log: cancelLog(mode)
      }
    })
  }

  it('once-cancel: meta.cancel_once_no_undo=true and the undo panel is NOT rendered', async() => {
    const wrapper = createWrapper()
    jest.spyOn(wrapper.vm, 'fetchAssistantLogs').mockImplementation(() => Promise.resolve())
    mockChat('once')

    await wrapper.vm.submitAssistantText('一次性取消今天的任务')
    await wrapper.vm.$nextTick()

    const aiMsg = wrapper.vm.conversation[wrapper.vm.conversation.length - 1]
    expect(aiMsg.meta.cancel_once_no_undo).toBe(true)
    expect(wrapper.vm.shouldShowUndo(aiMsg)).toBe(false)
    expect(wrapper.find('.undo-panel').exists()).toBe(false)
  })

  it('permanent-cancel: meta.cancel_once_no_undo=false and the undo panel IS rendered', async() => {
    const wrapper = createWrapper()
    jest.spyOn(wrapper.vm, 'fetchAssistantLogs').mockImplementation(() => Promise.resolve())
    mockChat('permanent')

    await wrapper.vm.submitAssistantText('永久取消今天的任务')
    await wrapper.vm.$nextTick()

    const aiMsg = wrapper.vm.conversation[wrapper.vm.conversation.length - 1]
    expect(aiMsg.meta.cancel_once_no_undo).toBe(false)
    expect(wrapper.vm.shouldShowUndo(aiMsg)).toBe(true)
    expect(wrapper.find('.undo-panel').exists()).toBe(true)
  })
})
