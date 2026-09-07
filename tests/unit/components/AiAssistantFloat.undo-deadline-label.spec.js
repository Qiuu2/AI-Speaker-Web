// T80: the undo window now lasts until the latest affected task passes (often
// hours), so the button label shows a "截止 HH:MM" deadline for the far case
// instead of a bare "(Ns)" countdown; the final stretch (<=120s) keeps the live
// seconds countdown. Cosmetic only.

import { shallowMount } from '@vue/test-utils'
import AiAssistantFloat from '@/components/AiAssistantFloat.vue'

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

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function msgWithExpiry(expiresAt, summary = '') {
  return { meta: { undo_token: { kind: 'once_override', override_ids: ['ov-1'], summary, expires_at: expiresAt }}}
}

describe('T80 undoButtonLabel — deadline vs countdown', () => {
  let vm
  beforeEach(() => {
    vm = createWrapper().vm
  })

  it('shows 截止 HH:MM for a far-future (hours away) expiry, not a big (Ns)', () => {
    const far = new Date(Date.now() + 3 * 60 * 60 * 1000) // +3h
    const label = vm.undoButtonLabel(msgWithExpiry(fmt(far)))
    expect(label).toContain('截止')
    expect(label).not.toMatch(/\(\d+s\)/) // no bare seconds countdown
  })

  it('keeps the live (Ns) countdown in the final stretch (<=120s)', () => {
    const soon = new Date(Date.now() + 30 * 1000) // +30s
    const label = vm.undoButtonLabel(msgWithExpiry(fmt(soon)))
    expect(label).toMatch(/\(\d+s\)/)
    expect(label).not.toContain('截止')
  })

  it('includes the summary clause in the deadline label', () => {
    const far = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const label = vm.undoButtonLabel(msgWithExpiry(fmt(far), 'cancel_schedule'))
    expect(label).toContain('「cancel_schedule」')
    expect(label).toContain('截止')
  })

  it('undoDeadlineLabel formats same-day as 截止 HH:MM', () => {
    const today = new Date()
    today.setHours(23, 5, 0, 0)
    const out = vm.undoDeadlineLabel({ expires_at: fmt(today) })
    expect(out).toBe('截止 23:05')
  })

  it('undoDeadlineLabel includes the date when expiry is a later day', () => {
    const later = new Date(Date.now() + 26 * 60 * 60 * 1000) // ~tomorrow
    later.setHours(8, 30, 0, 0)
    const out = vm.undoDeadlineLabel({ expires_at: fmt(later) })
    expect(out).toMatch(/^截止 \d+月\d+日 08:30$/)
  })

  it('still shows 撤销已过期 once the deadline has passed', () => {
    const past = new Date(Date.now() - 60 * 1000)
    expect(vm.undoButtonLabel(msgWithExpiry(fmt(past)))).toBe('撤销已过期')
  })
})
