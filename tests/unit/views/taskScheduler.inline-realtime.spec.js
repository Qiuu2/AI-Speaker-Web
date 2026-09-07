jest.mock('@/api/dataService', () => ({
  fetchAllAudio: jest.fn(),
  fetchAllLoc: jest.fn(),
  fetchAllTerminalData: jest.fn(),
  fetchAllTask: jest.fn(),
  fetchBroadcasts: jest.fn(),
  fetchLivecasts: jest.fn(),
  fetchBroadcastSchedulesSummary: jest.fn(),
  fetchTaskOverrides: jest.fn(),
  fetchScheduleTasks: jest.fn(),
  setTaskStatus: jest.fn(),
  setScheduleStatus: jest.fn(),
  createScheduleEntry: jest.fn(),
  updateScheduleEntry: jest.fn(),
  deleteScheduleEntry: jest.fn(),
  updateBroadcastSchedules: jest.fn(),
  updateAllTask: jest.fn(),
  updateSingleTask: jest.fn(),
  deleteSingleTask: jest.fn(),
  updateOnceOverrideTask: jest.fn(),
  deleteOnceOverrideTask: jest.fn(),
  undoOnceOverride: jest.fn()
}))

jest.mock('@/utils/schedulerStorage', () => ({
  getDefaultSchedulerData: jest.fn(() => ({ plans: [], broadcasts: [], livecasts: [] })),
  getDefaultSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planBaseSnapshot: [], dirtyScopes: [] })),
  loadSchedulerDrafts: jest.fn(() => ({ plans: [], planDirtyIds: [], planBaseSnapshot: [], dirtyScopes: [] }))
}))

import { updateSingleTask } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// Minimal Vue reactivity shims for invoking methods in isolation.
const vueSet = (obj, key, val) => { obj[key] = val }
const vueDelete = (obj, key) => { delete obj[key] }

// A controllable promise so a test can assert state *during* an in-flight save.
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function makeCtx(overrides = {}) {
  const plan = overrides.plan || {
    id: 'plan-1',
    name: '夏季作息',
    tasks: [{ id: 'row-1', taskid: '73001', time: '07:00:00', audio: '上课铃.mp3' }]
  }
  const task = overrides.task || plan.tasks[0]
  return {
    plan,
    task,
    inlineTaskEditor: {
      active: true,
      plan,
      task,
      field: overrides.field || 'time',
      value: overrides.value !== undefined ? overrides.value : '07:45:00',
      status: 'idle',
      savedAt: 0
    },
    inlineEditErrors: {},
    $set: vueSet,
    $delete: vueDelete,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    $confirm: jest.fn(() => Promise.resolve()),
    toTime: (value) => value,
    isMidnightTime: () => false,
    findTaskIndexById: methods.findTaskIndexById,
    sortTasksByTime: jest.fn(),
    getPlanDraftSourcePlans: jest.fn(() => Promise.resolve([plan])),
    clonePlanList: (list) => JSON.parse(JSON.stringify(list)),
    findPlanIndexById: (list, id) => list.findIndex((p) => String(p.id) === String(id)),
    persistPlanDraftLocally: jest.fn(() => Promise.resolve()),
    hasPlanDraft: false,
    draftState: { planBaseSnapshot: [] },
    // real methods under test / reused
    inlineEditCellKey: methods.inlineEditCellKey,
    clearInlineEditCellError: methods.clearInlineEditCellError,
    buildSingleTaskPatch: methods.buildSingleTaskPatch,
    commitInlineTaskEditRemote: methods.commitInlineTaskEditRemote,
    resetInlineTaskEdit: methods.resetInlineTaskEdit
  }
}

describe('TaskSchedulerPage inline realtime edit (P-B)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('buildSingleTaskPatch', () => {
    it('maps audio to medianame and time to starttime', () => {
      expect(methods.buildSingleTaskPatch('audio', '运动员进行曲.mp3')).toEqual({ medianame: '运动员进行曲.mp3' })
      expect(methods.buildSingleTaskPatch('time', '08:15:00')).toEqual({ starttime: '08:15:00' })
    })
    it('returns an empty patch for unknown fields', () => {
      expect(methods.buildSingleTaskPatch('volume', 80)).toEqual({})
    })
    it('passes the time value through verbatim (caller normalizes via toTime first)', () => {
      // Contract: a non-HH:MM:SS value is NOT re-normalized here; whatever the
      // caller passed is what gets sent. commitInlineTaskEdit is responsible
      // for running toTime() before calling this.
      expect(methods.buildSingleTaskPatch('time', '8:5')).toEqual({ starttime: '8:5' })
    })
  })

  it('writes an existing remote task immediately and updates the row after ACK', async() => {
    updateSingleTask.mockResolvedValueOnce({ status: 'ok' })
    const ctx = makeCtx({ field: 'time', value: '07:45:00' })

    await methods.commitInlineTaskEdit.call(ctx)

    expect(updateSingleTask).toHaveBeenCalledTimes(1)
    expect(updateSingleTask).toHaveBeenCalledWith('夏季作息', '73001', { starttime: '07:45:00' })
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled()
    expect(ctx.plan.tasks[0].time).toBe('07:45:00')
    expect(ctx.sortTasksByTime).toHaveBeenCalledWith(ctx.plan.tasks)
    expect(ctx.$message.success).toHaveBeenCalledWith('任务已保存')
    // editor exits edit mode but HOLDS the saved state (f1): not reset to idle
    // in the same tick, so the view layer can render a visible saved transition.
    expect(ctx.inlineTaskEditor.active).toBe(false)
    expect(ctx.inlineTaskEditor.status).toBe('saved')
    expect(ctx.inlineTaskEditor.savedAt).toBeGreaterThan(0)
    expect(ctx.inlineTaskEditor.task).toBe(ctx.task)
    expect(ctx.inlineTaskEditor.field).toBe('time')
  })

  it('holds the saved state until the cell is edited again, then resets to idle', () => {
    const plan = { id: 'plan-1', name: '夏季作息', tasks: [{ id: 'row-1', taskid: '73001', time: '07:45:00' }] }
    const task = plan.tasks[0]
    // simulate a cell that just finished saving and is holding 'saved'
    const ctx = {
      inlineTaskEditor: { active: false, plan: null, task, field: 'time', value: '', status: 'saved', savedAt: 123456 },
      inlineEditErrors: {},
      $set: vueSet,
      $delete: vueDelete,
      $nextTick: jest.fn(),
      $el: { querySelector: () => null },
      isOnceEphemeralTask: () => false,
      isInlineTaskEditing: methods.isInlineTaskEditing,
      inlineEditCellKey: methods.inlineEditCellKey,
      clearInlineEditCellError: methods.clearInlineEditCellError,
      $message: { info: jest.fn() }
    }
    // still holding saved before re-entry
    expect(methods.inlineEditCellSaved.call(ctx, task, 'time')).toBe(true)

    methods.startInlineTaskEdit.call(ctx, plan, task, 'time')

    expect(ctx.inlineTaskEditor.status).toBe('idle')
    expect(ctx.inlineTaskEditor.savedAt).toBe(0)
    expect(ctx.inlineTaskEditor.active).toBe(true)
    expect(methods.inlineEditCellSaved.call(ctx, task, 'time')).toBe(false)
  })

  it('inlineEditCellSaved is true only for the saved cell and without requiring active editing', () => {
    const task = { id: 'row-1', taskid: '73001' }
    const ctx = {
      inlineTaskEditor: { active: false, task, field: 'audio', status: 'saved', savedAt: 999 }
    }
    expect(methods.inlineEditCellSaved.call(ctx, task, 'audio')).toBe(true)
    expect(methods.inlineEditCellSaved.call(ctx, task, 'time')).toBe(false)
    // not saved when savedAt is unset
    const idleCtx = { inlineTaskEditor: { active: false, task, field: 'audio', status: 'idle', savedAt: 0 } }
    expect(methods.inlineEditCellSaved.call(idleCtx, task, 'audio')).toBe(false)
  })

  it('sends medianame when editing the audio cell', async() => {
    updateSingleTask.mockResolvedValueOnce({ status: 'ok' })
    const ctx = makeCtx({ field: 'audio', value: '运动员进行曲.mp3' })

    await methods.commitInlineTaskEdit.call(ctx)

    expect(updateSingleTask).toHaveBeenCalledWith('夏季作息', '73001', { medianame: '运动员进行曲.mp3' })
    expect(ctx.plan.tasks[0].audio).toBe('运动员进行曲.mp3')
  })

  it('does not mutate the local row while the write is in flight (pessimistic)', async() => {
    const d = deferred()
    updateSingleTask.mockReturnValueOnce(d.promise)
    const ctx = makeCtx({ field: 'time', value: '07:45:00' })

    const pending = methods.commitInlineTaskEdit.call(ctx)
    await Promise.resolve()

    // mid-flight: status is saving, the row is untouched
    expect(ctx.inlineTaskEditor.status).toBe('saving')
    expect(ctx.plan.tasks[0].time).toBe('07:00:00')

    d.resolve({ status: 'ok' })
    await pending
    expect(ctx.plan.tasks[0].time).toBe('07:45:00')
  })

  it('records a field-level error and leaves the row unchanged on failure', async() => {
    updateSingleTask.mockRejectedValueOnce({ response: { data: { detail: '远端拒绝' } } })
    const ctx = makeCtx({ field: 'time', value: '07:45:00' })

    await methods.commitInlineTaskEdit.call(ctx)

    expect(ctx.inlineEditErrors['row-1__time']).toBe('远端拒绝')
    expect(ctx.plan.tasks[0].time).toBe('07:00:00') // rolled back / never touched
    expect(ctx.inlineTaskEditor.status).toBe('error')
    expect(ctx.$message.error).toHaveBeenCalledWith('远端拒绝')
  })

  it('records a dirty patch on a local-draft task (taskid 0) instead of failing loud (T42 reverses T39 Step 2 D)', async() => {
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      tasks: [{ id: 'draft-1', taskid: '0', time: '07:00:00', audio: '上课铃.mp3' }]
    }
    const ctx = makeCtx({ plan, task: plan.tasks[0], field: 'time', value: '07:45:00' })

    await methods.commitInlineTaskEdit.call(ctx)

    // No per-cell remote write — the user commits the whole plan via the
    // row's blue "完成" button later (commitInlineTaskFinish).
    expect(updateSingleTask).not.toHaveBeenCalled()
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled()
    // Old T39 fail-loud warning is gone.
    expect(ctx.$message.warning).not.toHaveBeenCalled()
    // The row now carries dirty markers.
    const row = plan.tasks[0]
    expect(row._draftDirty).toBe(true)
    expect(row._draftPatch).toEqual({ time: '07:45:00' })
    expect(row._originalSnapshot).toBeTruthy()
    expect(row._originalSnapshot.time).toBe('07:00:00')
    // New value mirrored to the row so the cell shows it immediately.
    expect(row.time).toBe('07:45:00')
  })

  it('ignores a repeat trigger while a save is already in flight (idempotency gate)', async() => {
    const d = deferred()
    updateSingleTask.mockReturnValueOnce(d.promise)
    const ctx = makeCtx({ field: 'time', value: '07:45:00' })

    const first = methods.commitInlineTaskEdit.call(ctx)
    await Promise.resolve()
    // second trigger (e.g. @blur after @change) while saving
    await methods.commitInlineTaskEdit.call(ctx)

    expect(updateSingleTask).toHaveBeenCalledTimes(1)

    d.resolve({ status: 'ok' })
    await first
  })

  it('clears a prior cell error when re-entering the cell to edit', () => {
    const plan = { id: 'plan-1', name: '夏季作息', tasks: [{ id: 'row-1', taskid: '73001', time: '07:00:00' }] }
    const ctx = {
      inlineTaskEditor: { active: false },
      inlineEditErrors: { 'row-1__time': '远端拒绝' },
      $set: vueSet,
      $delete: vueDelete,
      $nextTick: jest.fn(),
      $el: { querySelector: () => null },
      isOnceEphemeralTask: () => false,
      isInlineTaskEditing: () => false,
      inlineEditCellKey: methods.inlineEditCellKey,
      clearInlineEditCellError: methods.clearInlineEditCellError,
      $message: { info: jest.fn() }
    }

    methods.startInlineTaskEdit.call(ctx, plan, plan.tasks[0], 'time')

    expect(ctx.inlineEditErrors['row-1__time']).toBeUndefined()
    expect(ctx.inlineTaskEditor.status).toBe('idle')
  })

  it('reports saving and error cell helpers correctly', () => {
    const task = { id: 'row-1', taskid: '73001' }
    const savingCtx = {
      inlineTaskEditor: { active: true, status: 'saving', task, field: 'time' },
      inlineEditErrors: {},
      inlineEditCellKey: methods.inlineEditCellKey
    }
    expect(methods.inlineEditCellSaving.call(savingCtx, task, 'time')).toBe(true)
    expect(methods.inlineEditCellSaving.call(savingCtx, task, 'audio')).toBe(false)

    const errorCtx = {
      inlineTaskEditor: { active: false },
      inlineEditErrors: { 'row-1__audio': '失败' },
      inlineEditCellKey: methods.inlineEditCellKey
    }
    expect(methods.inlineEditCellError.call(errorCtx, task, 'audio')).toBe('失败')
    expect(methods.inlineEditCellError.call(errorCtx, task, 'time')).toBe('')
  })
})
