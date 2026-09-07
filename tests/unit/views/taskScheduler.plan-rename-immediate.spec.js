// T39 Step 1 A (58d5cf4) introduced "plan rename immediate via updateScheduleEntry".
// T40 (2026-06-06) DISABLED that path: :183 vendor confirmed no schedule rename
// API exists, and the PUT path triggered backend update_schedule handler at
// api_public.py:21216 which forcibly resets schedule_name back to the URL old
// name -> renamed=[] -> reconcile DELETE the whole scheme + tasks (G4.1 海星
// incident). See KNOWN_PITFALLS #21.
//
// This spec is kept as historical anchor but now locks in the disabled
// behaviour: submitDialog(mode='edit', type='plan') MUST short-circuit via
// $message.warning and MUST NOT call updateScheduleEntry. Detailed coverage
// lives in taskScheduler.plan-rename-disabled.spec.js (template + guard).

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

import { updateScheduleEntry } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

const vueSet = (obj, key, val) => { obj[key] = val }
const vueDelete = (obj, key) => { delete obj[key] }

function makeCtx(overrides = {}) {
  const plan = overrides.plan || {
    id: 'plan-1',
    name: '夏季作息',
    originName: '夏季作息',
    isNew: false,
    status: '启用',
    tasks: []
  }
  const dialog = overrides.dialog || {
    visible: true,
    type: 'plan',
    mode: 'edit',
    form: { name: '夏令作息' }
  }
  return {
    dialog,
    persisting: false,
    $set: vueSet,
    $delete: vueDelete,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    getSelected: jest.fn(() => [plan]),
    getPlanDraftSourcePlans: jest.fn(() => Promise.resolve([plan])),
    clonePlanList: (list) => JSON.parse(JSON.stringify(list)),
    findPlanIndexById: methods.findPlanIndexById,
    persistPlanDraftLocally: jest.fn(() => Promise.resolve()),
    hasPlanDraft: false,
    draftState: { planBaseSnapshot: [] },
    commitPlanOperations: methods.commitPlanOperations,
    executePlanOperations: methods.executePlanOperations,
    serializePlanForApi: methods.serializePlanForApi,
    buildScheduleFromPlan: methods.buildScheduleFromPlan,
    stripOnceEphemeralPlanTasks: (tasks) => tasks || [],
    applyPlanState: jest.fn(),
    planSaveError: jest.fn(),
    loadModules: jest.fn(() => Promise.resolve()),
    buildScheduleTaskFromPlan: jest.fn((task) => task),
    modules: { plans: [] },
    addByType: jest.fn(),
    persist: jest.fn(),
    persistBroadcastDraftLocally: jest.fn(),
    createPlanImmediate: jest.fn(() => Promise.resolve(true)),
    submitDialog: methods.submitDialog
  }
}

describe('TaskSchedulerPage submitDialog plan rename — DISABLED by T40 (was T39 Step 1 A)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does NOT call updateScheduleEntry even for an existing remote plan (T40 guard)', async() => {
    const ctx = makeCtx()

    await ctx.submitDialog.call(ctx)

    // The 58d5cf4 path would have hit updateScheduleEntry exactly once. After
    // T40 the guard short-circuits before any remote write.
    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.warning).toHaveBeenCalledWith(
      '暂不支持改方案名,如需更名请删除后重建'
    )
    // No success toast in the disabled path.
    expect(ctx.$message.success).not.toHaveBeenCalled()
  })

  it('still refuses the brand-new local plan case for the same reason (warning route)', async() => {
    const localPlan = {
      id: 'plan-2',
      name: '新建',
      originName: '',
      isNew: true,
      status: '启用',
      tasks: []
    }
    const ctx = makeCtx({
      plan: localPlan,
      dialog: { visible: true, type: 'plan', mode: 'edit', form: { name: '改名' } }
    })

    await ctx.submitDialog.call(ctx)

    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.persistPlanDraftLocally).not.toHaveBeenCalled()
    // Either the T40 guard or the older "save first" warning is acceptable —
    // both correctly avoid the remote PUT. Currently T40 guard wins because
    // it sits earlier in submitDialog.
    expect(ctx.$message.warning).toHaveBeenCalled()
    expect(ctx.dialog.visible).toBe(true)
  })

  it('leaves the dialog open and does not flip success regardless of remote stub setup', async() => {
    // Even if a (defensive) test arranges updateScheduleEntry to resolve, the
    // guard prevents it from being reached. We assert the no-op + dialog stay.
    updateScheduleEntry.mockResolvedValueOnce({ status: 'ok' })
    const ctx = makeCtx()

    await ctx.submitDialog.call(ctx)

    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.success).not.toHaveBeenCalled()
    expect(ctx.dialog.visible).toBe(true)
  })
})
