import { shallowMount } from '@vue/test-utils'
import AiAssistantFloat from '@/components/AiAssistantFloat.vue'
import axios from 'axios'
import { emitAssistantRefresh } from '@/utils/assistantRefreshBus'

jest.mock('axios', () => {
  const mockApi = {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn()
      }
    }
  }
  return {
    get: jest.fn(),
    create: jest.fn(() => mockApi),
    __mockApi: mockApi
  }
})

jest.mock('@/utils/assistantRefreshBus', () => ({
  emitAssistantRefresh: jest.fn(),
  onAssistantRefresh: jest.fn(),
  offAssistantRefresh: jest.fn()
}))

const elementStubs = [
  'el-button',
  'el-tooltip',
  'el-drawer',
  'el-input',
  'el-tabs',
  'el-tab-pane',
  'el-collapse',
  'el-collapse-item',
  'el-popover',
  'el-select',
  'el-option',
  'el-tag',
  'el-input-number',
  'el-date-picker',
  'el-radio-group',
  'el-radio-button'
]

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function createWrapper(rootOverrides = {}) {
  const root = {
    $emit: jest.fn(),
    $on: jest.fn(),
    $off: jest.fn(),
    ...rootOverrides
  }
  const wrapper = shallowMount(AiAssistantFloat, {
    stubs: elementStubs,
    mocks: {
      $message: { warning: jest.fn(), error: jest.fn(), success: jest.fn() },
      $notify: jest.fn(),
      $root: root
    }
  })
  return { wrapper, root }
}

describe('AiAssistantFloat dialog state detail', () => {
  afterEach(() => {
    axios.get.mockReset()
    axios.__mockApi.get.mockReset()
    axios.__mockApi.put.mockReset()
    axios.__mockApi.post.mockReset()
  })

  it('stores dialog_state_detail in message meta and renders confirm badge', async () => {
    const { wrapper } = createWrapper()
    axios.__mockApi.get.mockClear()
    axios.__mockApi.post.mockResolvedValue({
      data: {
        reply: '上一个问题我还在等您补充。',
        output_speech: '上一个问题我还在等您补充。',
        intent: 'adjust_volume',
        confidence: 0,
        dialog_state_detail: 'confirm_interrupt_switch',
        missing_slots: [],
        diagnostics: [],
        action_log: [],
        pending_action: null
      }
    })

    await wrapper.vm.submitAssistantText('执行新的')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.conversation).toHaveLength(2)
    expect(wrapper.vm.conversation[1].meta.dialog_state_detail).toBe('confirm_interrupt_switch')
    expect(wrapper.text()).toContain('切换确认')
  })

  it('does not refresh UI on confirm_interrupt_switch without action log', async () => {
    const { wrapper } = createWrapper()
    axios.__mockApi.get.mockClear()
    emitAssistantRefresh.mockClear()
    axios.__mockApi.post.mockResolvedValue({
      data: {
        reply: '上一个问题我还在等您补充。',
        output_speech: '上一个问题我还在等您补充。',
        intent: 'adjust_volume',
        confidence: 0,
        dialog_state_detail: 'confirm_interrupt_switch',
        missing_slots: [],
        diagnostics: [],
        action_log: [],
        pending_action: null
      }
    })

    await wrapper.vm.submitAssistantText('执行新的')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(axios.__mockApi.get).not.toHaveBeenCalled()
    expect(emitAssistantRefresh).not.toHaveBeenCalled()
  })

  it('stores ask_missing_slot without refreshing UI', async () => {
    const { wrapper } = createWrapper()
    axios.__mockApi.get.mockClear()
    emitAssistantRefresh.mockClear()
    axios.__mockApi.post.mockResolvedValue({
      data: {
        reply: '请补充时间。',
        output_speech: '请补充时间。',
        intent: 'move_schedule',
        confidence: 0.92,
        dialog_state_detail: 'ask_missing_slot',
        missing_slots: ['source_time'],
        diagnostics: [],
        action_log: [],
        pending_action: null
      }
    })

    await wrapper.vm.submitAssistantText('把周五任务挪走')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.conversation).toHaveLength(2)
    expect(wrapper.vm.conversation[1].meta.dialog_state_detail).toBe('ask_missing_slot')
    expect(wrapper.vm.conversation[1].meta.missing_slots).toEqual(['source_time'])
    expect(axios.__mockApi.get).not.toHaveBeenCalled()
    expect(emitAssistantRefresh).not.toHaveBeenCalled()
  })

  it('stores pending_action_followup without refreshing UI', async () => {
    const { wrapper } = createWrapper()
    axios.__mockApi.get.mockClear()
    emitAssistantRefresh.mockClear()
    axios.__mockApi.post.mockResolvedValue({
      data: {
        reply: '请确认是否切换并继续。',
        output_speech: '请确认是否切换并继续。',
        intent: 'move_schedule',
        confidence: 0.87,
        dialog_state_detail: 'pending_action_followup',
        missing_slots: [],
        diagnostics: [],
        action_log: [],
        pending_action: {
          title: '请选择一个候选目标',
          choices: [
            { id: 'choice-1', label: '周五任务', value: 'friday-task' }
          ]
        }
      }
    })

    await wrapper.vm.submitAssistantText('继续执行新的操作')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.conversation).toHaveLength(2)
    expect(wrapper.vm.conversation[1].meta.dialog_state_detail).toBe('pending_action_followup')
    expect(wrapper.vm.conversation[1].meta.pending_action).toEqual(
      expect.objectContaining({
        title: '请选择一个候选目标',
        choices: [
          expect.objectContaining({
            key: 'choice-1',
            label: '周五任务',
            value: 'friday-task'
          })
        ]
      })
    )
    expect(axios.__mockApi.get).not.toHaveBeenCalled()
    expect(emitAssistantRefresh).not.toHaveBeenCalled()
  })

  it('refreshes UI for complete v3.1 intents even without action log', async () => {
    const { wrapper } = createWrapper()
    axios.__mockApi.get.mockClear()
    emitAssistantRefresh.mockClear()
    axios.__mockApi.post.mockResolvedValue({
      data: {
        reply: '已创建作息。',
        output_speech: '已创建作息。',
        intent: 'create_schedule',
        confidence: 1,
        dialog_state_detail: 'complete',
        missing_slots: [],
        diagnostics: [],
        action_log: [],
        pending_action: null,
        slots: { schedule_name: '夏季作息' }
      }
    })
    axios.__mockApi.get.mockResolvedValue({
      data: {
        schedules: []
      }
    })

    await wrapper.vm.submitAssistantText('创建夏季作息')
    await flushPromises()
    await flushPromises()

    expect(axios.__mockApi.get).toHaveBeenCalled()
    expect(emitAssistantRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'create_schedule',
        dialog_state_detail: 'complete'
      })
    )
  })
})
