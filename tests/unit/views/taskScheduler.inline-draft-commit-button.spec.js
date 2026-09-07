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

import { updateSingleTask, updateScheduleEntry } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods, data: dataFn } = TaskSchedulerPage

const vueSet = (obj, key, val) => { obj[key] = val }
const vueDelete = (obj, key) => { delete obj[key] }

// Pulls in a few defaults the production component creates in data() so the
// helpers we wire on `methods` don't trip over undefined refs in jsdom.
const baseData = (() => {
  try {
    return dataFn ? dataFn.call({}) : {}
  } catch (err) {
    return {}
  }
})()

function makeBaseCtx(overrides = {}) {
  const plan = overrides.plan || {
    id: 'plan-1',
    name: '夏季作息',
    originName: '夏季作息',
    isNew: false,
    tasks: []
  }
  const task = overrides.task
  const ctx = {
    persisting: false,
    modules: { plans: [plan], broadcasts: [], livecasts: [] },
    audioOptions: [{ value: '上课铃.mp3', label: '上课铃.mp3' }],
    inlineTaskEditor: {
      active: false,
      plan: null,
      task: null,
      field: '',
      value: '',
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
    sortTasksByTime: jest.fn(),
    findTaskIndexById: methods.findTaskIndexById,
    findPlanIndexById: methods.findPlanIndexById,
    inlineEditCellKey: methods.inlineEditCellKey,
    clearInlineEditCellError: methods.clearInlineEditCellError,
    buildSingleTaskPatch: methods.buildSingleTaskPatch,
    commitInlineTaskEdit: methods.commitInlineTaskEdit,
    commitInlineTaskEditRemote: methods.commitInlineTaskEditRemote,
    commitInlineTaskFinish: methods.commitInlineTaskFinish,
    cancelInlineTaskDraft: methods.cancelInlineTaskDraft,
    resetInlineTaskEdit: methods.resetInlineTaskEdit,
    newPlanTask: methods.newPlanTask,
    createDraftTaskId: () => `draft-${Math.random().toString(36).slice(2, 8)}`,
    defaultLocation: () => [],
    // Real commitPlanOperations / serializePlanForApi mirror so case 2 and
    // case 5 exercise the production code paths rather than a stub.
    commitPlanOperations: methods.commitPlanOperations,
    executePlanOperations: methods.executePlanOperations,
    applyPlanState: jest.fn(),
    planSaveError: jest.fn(),
    loadModules: jest.fn(() => Promise.resolve()),
    serializePlanForApi: methods.serializePlanForApi,
    buildScheduleFromPlan: methods.buildScheduleFromPlan,
    buildScheduleTaskFromPlan: methods.buildScheduleTaskFromPlan,
    stripOnceEphemeralPlanTasks: methods.stripOnceEphemeralPlanTasks,
    isOnceEphemeralTask: () => false,
    resolvePlanTaskTerminalFields: () => ({
      location: [], terminalids: [], terminalnames: [], liveterminalid: '', liveterminalname: ''
    }),
    formatScheduleDurationForApi: (d) => String(d || '1'),
    normalizeRealTaskId: (v) => {
      const digits = String(v ?? '').replace(/\D+/g, '')
      return digits || '0'
    }
  }
  if (task && !plan.tasks.includes(task)) {
    plan.tasks.push(task)
  }
  return ctx
}

// startInlineTaskEdit equivalent + then commit, simulating one cell change.
async function simulateInlineCellEdit(ctx, plan, task, field, value) {
  ctx.inlineTaskEditor = {
    active: true,
    plan,
    task,
    field,
    value,
    status: 'idle',
    savedAt: 0
  }
  await ctx.commitInlineTaskEdit.call(ctx)
}

describe('TaskSchedulerPage T42 inline draft commit-button flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('case 1: editing a cell on a draft task (taskid="0") flips _draftDirty + records _draftPatch + captures _originalSnapshot, no remote call', async() => {
    const task = {
      id: 'row-1',
      taskid: '0',
      time: '07:00:00',
      audio: '上课铃.mp3'
    }
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      originName: '夏季作息',
      isNew: false,
      tasks: [task]
    }
    const ctx = makeBaseCtx({ plan, task })

    await simulateInlineCellEdit(ctx, plan, task, 'time', '07:45:00')

    expect(updateSingleTask).not.toHaveBeenCalled()
    expect(updateScheduleEntry).not.toHaveBeenCalled()
    // Dirty flag flipped.
    expect(task._draftDirty).toBe(true)
    // _draftPatch records the field-level change.
    expect(task._draftPatch).toEqual({ time: '07:45:00' })
    // _originalSnapshot captured BEFORE mirroring the new value.
    expect(task._originalSnapshot).toBeTruthy()
    expect(task._originalSnapshot.time).toBe('07:00:00')
    // Row is mirrored so the cell UI shows the new value immediately.
    expect(task.time).toBe('07:45:00')
    // Editor returns to idle (collapsed).
    expect(ctx.inlineTaskEditor.active).toBe(false)
    // No warning toast — fail-loud reverted.
    expect(ctx.$message.warning).not.toHaveBeenCalled()
  })

  it('case 2: clicking 完成 on a dirty draft task triggers commitPlanOperations (whole-plan PUT) and clears dirty markers on ACK', async() => {
    updateScheduleEntry.mockResolvedValueOnce({ status: 'ok' })
    const task = {
      id: 'row-1',
      taskid: '0',
      time: '07:45:00',
      audio: '上课铃.mp3',
      _draftDirty: true,
      _draftPatch: { time: '07:45:00' },
      _originalSnapshot: { id: 'row-1', taskid: '0', time: '07:00:00', audio: '上课铃.mp3' }
    }
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      originName: '夏季作息',
      isNew: false,
      tasks: [task]
    }
    const ctx = makeBaseCtx({ plan, task })

    await ctx.commitInlineTaskFinish.call(ctx, plan, task)

    expect(updateScheduleEntry).toHaveBeenCalledTimes(1)
    expect(updateScheduleEntry.mock.calls[0][0]).toBe('夏季作息')
    // ACK clears the dirty markers.
    expect(task._draftDirty).toBe(false)
    expect(task._draftPatch).toEqual({})
    expect(task._originalSnapshot).toBeNull()
    // Single-task patch path is NOT used for draft tasks.
    expect(updateSingleTask).not.toHaveBeenCalled()
  })

  it('case 3: clicking 取消 on a draft task (taskid="0") drops the row (PO D: 草稿取消 = 删行)', async() => {
    const task = {
      id: 'row-2',
      taskid: '0',
      time: '07:45:00',
      audio: '上课铃.mp3',
      _draftDirty: true,
      _draftPatch: { time: '07:45:00' },
      _originalSnapshot: { id: 'row-2', taskid: '0', time: '07:00:00', audio: '上课铃.mp3' }
    }
    const keeper = { id: 'row-1', taskid: '5000', time: '06:00:00', audio: '起床铃.mp3' }
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      originName: '夏季作息',
      isNew: false,
      tasks: [keeper, task],
      taskCount: 2
    }
    const ctx = makeBaseCtx({ plan })

    ctx.cancelInlineTaskDraft.call(ctx, plan, task)

    // Draft row dropped from plan.tasks.
    expect(plan.tasks.find((t) => t.id === 'row-2')).toBeUndefined()
    expect(plan.tasks).toHaveLength(1)
    expect(plan.taskCount).toBe(1)
    // No remote calls.
    expect(updateSingleTask).not.toHaveBeenCalled()
    expect(updateScheduleEntry).not.toHaveBeenCalled()
  })

  it('case 4: clicking 取消 on an already-converted task (numeric taskid) restores field values from _originalSnapshot', async() => {
    const task = {
      id: 'row-3',
      taskid: '5000',
      time: '08:30:00',
      audio: '换班铃.mp3',
      volume: 80,
      _draftDirty: true,
      _draftPatch: { time: '08:30:00', audio: '换班铃.mp3' },
      _originalSnapshot: {
        id: 'row-3',
        taskid: '5000',
        time: '07:00:00',
        audio: '上课铃.mp3',
        volume: 50
      }
    }
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      originName: '夏季作息',
      isNew: false,
      tasks: [task]
    }
    const ctx = makeBaseCtx({ plan, task })

    ctx.cancelInlineTaskDraft.call(ctx, plan, task)

    // Row fields fully restored.
    expect(task.time).toBe('07:00:00')
    expect(task.audio).toBe('上课铃.mp3')
    expect(task.volume).toBe(50)
    // Dirty markers cleared.
    expect(task._draftDirty).toBe(false)
    expect(task._draftPatch).toEqual({})
    expect(task._originalSnapshot).toBeNull()
    // Row not removed (already-converted task is restored, not deleted).
    expect(plan.tasks.find((t) => t.id === 'row-3')).toBeDefined()
  })

  it('case 5: serializePlanForApi strips _draftDirty / _draftPatch / _originalSnapshot — they never leak to the remote payload', () => {
    const task = {
      id: 'row-9',
      taskid: '5001',
      time: '07:30:00',
      audio: '上课铃.mp3',
      duration: '05',
      durationMode: 'loop',
      loop: 1,
      weekdays: ['周一'],
      dateRange: ['2026-01-01', '2026-12-31'],
      volume: 60,
      _draftDirty: true,
      _draftPatch: { time: '07:30:00' },
      _originalSnapshot: { id: 'row-9', taskid: '5001', time: '06:00:00' }
    }
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      originName: '夏季作息',
      isNew: false,
      tasks: [task],
      status: '启用'
    }
    const ctx = makeBaseCtx({ plan, task })

    const payload = ctx.serializePlanForApi.call(ctx, plan, [plan])

    expect(payload).toBeTruthy()
    expect(Array.isArray(payload.tasks)).toBe(true)
    expect(payload.tasks).toHaveLength(1)
    const taskPayload = payload.tasks[0]
    expect(taskPayload).not.toHaveProperty('_draftDirty')
    expect(taskPayload).not.toHaveProperty('_draftPatch')
    expect(taskPayload).not.toHaveProperty('_originalSnapshot')
    // Sanity: legitimate fields still emitted.
    expect(taskPayload.starttime).toBe('07:30:00')
    expect(taskPayload.taskid).toBe('5001')
  })

  it('case 6 (regression): existing-remote task inline edit still goes per-field via updateSingleTask (legacy path preserved for non-dirty rows)', async() => {
    updateSingleTask.mockResolvedValueOnce({ status: 'ok' })
    const task = {
      id: 'row-r',
      taskid: '73001',
      time: '07:00:00',
      audio: '上课铃.mp3'
    }
    const plan = {
      id: 'plan-1',
      name: '夏季作息',
      originName: '夏季作息',
      isNew: false,
      tasks: [task]
    }
    const ctx = makeBaseCtx({ plan, task })

    await simulateInlineCellEdit(ctx, plan, task, 'time', '07:45:00')

    expect(updateSingleTask).toHaveBeenCalledTimes(1)
    expect(updateSingleTask).toHaveBeenCalledWith('夏季作息', '73001', { starttime: '07:45:00' })
    // Legacy path: never sets _draftDirty for an already-remote task on a
    // single-cell edit (immediate write happened).
    expect(task._draftDirty).toBeFalsy()
  })

  it('case 7 (regression): factory newPlanTask() defaults seed the three dirty/snapshot fields cleanly', () => {
    const ctx = makeBaseCtx()
    const t = ctx.newPlanTask.call(ctx)
    expect(t._draftDirty).toBe(false)
    expect(t._draftPatch).toEqual({})
    expect(t._originalSnapshot).toBeNull()
  })
})
