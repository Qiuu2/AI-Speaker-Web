// T40 (2026-06-06): plan rename UX disabled in task-scheduler/index.vue.
//
// Background: :183 vendor has no schedule rename API. The 58d5cf4 attempt to
// route rename through updateScheduleEntry triggered backend update_schedule
// handler at api_public.py:21205 which at L21216 forcibly sets
// schedule["schedule_name"] = <URL old name>. The resulting schedule_sync_delta
// sees renamed=[] and the reconciler deletes the entire scheme + tasks
// (G4.1 海星作息 incident on 2026-06-06: scheme + 14 tasks vaporized).
//
// This spec locks in two defenses:
//   1. plans dropdown no longer renders the "修改方案" menu item (template check).
//   2. even if submitDialog({mode:'edit', type:'plan', ...}) is called
//      programmatically, it must call $message.warning AND must NOT call
//      updateScheduleEntry.
//
// See KNOWN_PITFALLS #21 for the full incident write-up.

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

import fs from 'fs'
import path from 'path'
import { updateScheduleEntry } from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const SFC_PATH = path.resolve(__dirname, '../../../src/views/task-scheduler/index.vue')
const { methods } = TaskSchedulerPage

const vueSet = (obj, key, val) => { obj[key] = val }
const vueDelete = (obj, key) => { delete obj[key] }

function makeCtx() {
  const plan = {
    id: 'plan-1',
    name: '海星作息',
    originName: '海星作息',
    isNew: false,
    status: '启用',
    tasks: []
  }
  const dialog = {
    visible: true,
    type: 'plan',
    mode: 'edit',
    form: { name: '海星作息-改名尝试' }
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

describe('T40 plan rename disabled (template + submitDialog guard)', () => {
  let source

  beforeAll(() => {
    source = fs.readFileSync(SFC_PATH, 'utf-8')
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('removes the "修改方案" dropdown item from the plans toolbar', () => {
    // The dropdown-item that previously emitted command="edit" with the label
    // "修改方案" must be gone from the template. We assert via the rendered
    // <el-dropdown-item ...>修改方案</el-dropdown-item> form so an explanatory
    // comment that mentions the string by name does not falsely satisfy this.
    expect(source).not.toMatch(/<el-dropdown-item[^>]*>\s*修改方案\s*<\/el-dropdown-item>/)
    // Sibling dropdown items still present (sanity check the dropdown itself
    // wasn't accidentally torn out).
    expect(source).toMatch(/<el-dropdown-item[^>]*>\s*复制方案\s*<\/el-dropdown-item>/)
    expect(source).toMatch(/<el-dropdown-item[^>]*>\s*批量修改\s*<\/el-dropdown-item>/)
  })

  it('submitDialog(mode=edit, type=plan) shows warning and does NOT call updateScheduleEntry', async() => {
    const ctx = makeCtx()

    await ctx.submitDialog.call(ctx)

    expect(updateScheduleEntry).not.toHaveBeenCalled()
    expect(ctx.$message.warning).toHaveBeenCalledWith(
      '暂不支持改方案名,如需更名请删除后重建'
    )
    // Dialog left open so the caller can recover; PO can hit cancel.
    expect(ctx.dialog.visible).toBe(true)
  })
})
