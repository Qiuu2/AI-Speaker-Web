/**
 * T62 critic r1 f1 FIX coverage — per-row broadcast draft must NOT raise the
 * global "保存上传" badge, AND the staged value must show immediately.
 *
 * The r1 f1 leak: recordBroadcastInlineDraft mutated the modules.broadcasts row
 * (optimistic value + _draftPatch marker) → the deep watcher (:1804) fired →
 * the REAL syncBroadcastDraftState diffed the mutated row vs the synced base
 * snapshot (canonicalizeBroadcastRowForCompare keeps field values + does NOT
 * strip draft markers) → dirtyScopes染'broadcasts' → hasSchedulerDirtyScope
 * fallback (scope present) → badge false-positive even with broadcastDirtyIds=[].
 *
 * The fix stores the draft OFF the row (broadcastRowDrafts, keyed by task id)
 * and the cells read an overlay. So this spec wires the REAL recompute chain
 * (syncBroadcastDraftState + persistBroadcastDraftLocally + a synced base
 * snapshot) — the same non-vacuous pattern as the phantom-dirty repro spec —
 * then stages edits and INVOKES the real sync, asserting the badge stays clean.
 *
 * Reverse-truth (documented): if recordBroadcastInlineDraft went back to
 * mutating row[field], the real sync after staging would染 dirtyScopes and the
 * badge assertion here would flip to true (this is what critic's mount-probe
 * measured: badgeAfter=true).
 */
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
  undoOnceOverride: jest.fn(),
  addBroadcastImmediate: jest.fn(),
  deleteBroadcastImmediate: jest.fn(),
  commitBroadcastFields: jest.fn()
}))

jest.mock('@/utils/schedulerStorage', () => {
  const actual = jest.requireActual('@/utils/schedulerStorage')
  return {
    ...actual,
    loadSchedulerDrafts: jest.fn(() => actual.getDefaultSchedulerDrafts())
  }
})

import { commitBroadcastFields } from '@/api/dataService'
import { hasSchedulerDirtyScope, getDefaultSchedulerDrafts } from '@/utils/schedulerStorage'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// A clean, already-synced broadcast tab: one synced row, no draft residue,
// dirtyScopes empty. Wires the REAL syncBroadcastDraftState +
// persistBroadcastDraftLocally so staging-then-sync runs the production
// dirty-recompute chain (non-vacuous — mirrors phantom-dirty-repro spec).
function makeCleanCtx() {
  const syncedRow = {
    id: '500', taskid: '500', name: '早读铃', volume: 50,
    audio: '上课.mp3', mediaid: '303', time: '07:30:00',
    durationMode: 'loop', loop: 1,
    weekdays: ['周一'], location: [['zone-1', 'T1']],
    terminalids: ['9'], terminalnames: ['T1']
  }
  const ctx = {
    addingBroadcast: false,
    broadcastsLoaded: true,
    suspendBroadcastDraftSync: false,
    audioOptions: [{ value: '默认.mp3', label: '默认.mp3' }],
    modules: { broadcasts: [JSON.parse(JSON.stringify(syncedRow))] },
    lastSyncedBroadcasts: [JSON.parse(JSON.stringify(syncedRow))],
    lastSyncedBroadcastBaseSnapshot: [],
    draftState: getDefaultSchedulerDrafts(),
    broadcastDraftSyncSuspendedCount: 0,
    broadcastInlineErrors: {},
    broadcastInlineSaving: {},
    broadcastRowFinishing: {},
    broadcastRowDrafts: {},
    weekdaysOptions: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    $nextTick: (cb) => { if (typeof cb === 'function') cb(); return Promise.resolve() },
    $set: (target, key, value) => { target[key] = value; return value },
    $delete: (target, key) => { delete target[key] },

    cloneRows: methods.cloneRows,
    prepareBroadcastRows: methods.prepareBroadcastRows,
    buildBroadcastBaseSnapshot: methods.buildBroadcastBaseSnapshot,
    areBroadcastRowsEqual: methods.areBroadcastRowsEqual,
    currentBroadcastBaseSnapshot: methods.currentBroadcastBaseSnapshot,
    normalizeWeekdays: methods.normalizeWeekdays,
    normalizeRealTaskId: (value) => {
      const text = String(value ?? '').trim()
      return /^\d+$/.test(text) && text !== '0' ? text : ''
    },
    repairStoredLocationBinding: () => {},
    resolveLocationFromRow: (row) => (Array.isArray(row?.location) ? row.location : []),
    toDurationSeconds: (value) => {
      if (typeof value === 'number') return value
      const text = String(value || '').trim()
      if (!text) return 0
      if (/^\d+$/.test(text)) return Number(text)
      return 0
    },
    formatDurationHms: (value) => String(value || '00:05:00'),

    // T62 draft machinery under test
    broadcastRowDraftKey: methods.broadcastRowDraftKey,
    broadcastRowDraftEntry: methods.broadcastRowDraftEntry,
    isBroadcastRowDirty: methods.isBroadcastRowDirty,
    broadcastDraftValue: methods.broadcastDraftValue,
    broadcastDraftWeekdays: methods.broadcastDraftWeekdays,
    broadcastDraftDuration: methods.broadcastDraftDuration,
    recordBroadcastInlineDraft: methods.recordBroadcastInlineDraft,
    commitBroadcastInlineName: methods.commitBroadcastInlineName,
    commitBroadcastInlineVolume: methods.commitBroadcastInlineVolume,
    commitBroadcastInlineTime: methods.commitBroadcastInlineTime,
    commitBroadcastInlineAudio: methods.commitBroadcastInlineAudio,
    commitBroadcastInlineWeekdays: methods.commitBroadcastInlineWeekdays,
    commitBroadcastInlineLocation: methods.commitBroadcastInlineLocation,
    commitBroadcastInlineDuration: methods.commitBroadcastInlineDuration,
    resolveBroadcastDurationCandidate: methods.resolveBroadcastDurationCandidate,
    isBroadcastManualOnly: methods.isBroadcastManualOnly,
    toggleBroadcastRowWeekday: methods.toggleBroadcastRowWeekday,
    commitBroadcastRowFinish: methods.commitBroadcastRowFinish,
    cancelBroadcastRowDraft: methods.cancelBroadcastRowDraft,
    clearBroadcastRowDraft: methods.clearBroadcastRowDraft,
    broadcastInlineCellKey: methods.broadcastInlineCellKey,
    clearBroadcastInlineCellError: methods.clearBroadcastInlineCellError,
    buildBroadcastInlinePayload: methods.buildBroadcastInlinePayload,
    backfillBroadcastsFromRemote: jest.fn(() => Promise.resolve()),

    // REAL recompute chain — running this after staging is what would染 the
    // scope if the draft leaked onto the row.
    syncBroadcastDraftState: methods.syncBroadcastDraftState,
    persistBroadcastDraftLocally: methods.persistBroadcastDraftLocally,
    clearBroadcastDraftState: methods.clearBroadcastDraftState,
    setBroadcastRows: methods.setBroadcastRows
  }
  ctx.lastSyncedBroadcastBaseSnapshot = ctx.buildBroadcastBaseSnapshot(ctx.modules.broadcasts)
  return ctx
}

function firstRow(ctx) {
  return ctx.modules.broadcasts[0]
}

describe('T62 f1 fix: per-row draft does NOT raise the global 保存上传 badge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '500', dirty_fields: [] })
  })

  it('precondition: a synced broadcast tab starts with NO dirty scope', () => {
    const ctx = makeCleanCtx()
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
  })

  // The headline f1 assertion: stage edits, then RUN the real sync (what the
  // deep watcher would call) — the badge must stay false because the real row
  // is untouched (draft lives off-row).
  it('staging name/audio then running the real sync leaves the badge FALSE', () => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)

    methods.commitBroadcastInlineName.call(ctx, row, '早读铃改')
    methods.commitBroadcastInlineAudio.call(ctx, row, '默认.mp3')
    // simulate the deep watcher firing on the (unchanged) modules.broadcasts
    ctx.syncBroadcastDraftState()

    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
    expect(ctx.draftState.broadcastDirtyIds).toEqual([])
    expect(ctx.draftState.dirtyScopes).not.toContain('broadcasts')
    // the real row was never mutated — it still equals the synced form
    expect(row.name).toBe('早读铃')
    expect(row.audio).toBe('上课.mp3')
  })

  it('clicking weekday cells then running the real sync leaves the badge FALSE', () => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)

    methods.toggleBroadcastRowWeekday.call(ctx, row, '周二')
    methods.toggleBroadcastRowWeekday.call(ctx, row, '周三')
    ctx.syncBroadcastDraftState()

    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
    // staged overlay reflects the toggles, real row weekdays untouched
    expect(methods.broadcastDraftWeekdays.call(ctx, row)).toEqual(['周一', '周二', '周三'])
    expect(row.weekdays).toEqual(['周一'])
  })

  it('badge stays FALSE through a successful 完成 (refill, off-row draft dropped)', async() => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)

    methods.commitBroadcastInlineName.call(ctx, row, '早读铃改')
    await methods.commitBroadcastRowFinish.call(ctx, row)
    ctx.syncBroadcastDraftState()

    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)
    expect(ctx.backfillBroadcastsFromRemote).toHaveBeenCalledTimes(1)
    expect(hasSchedulerDirtyScope('broadcasts', ctx.draftState)).toBe(false)
    // off-row draft fully dropped
    expect(ctx.broadcastRowDrafts['500']).toBeUndefined()
  })
})

describe('T62 PO feedback: staged value shows immediately + 完成/取消 visible', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '500', dirty_fields: [] })
  })

  // PO实测: "选了别的音频 cell 没有任何可见反应". The overlay must surface the
  // staged value so the cell shows the change, and the row must enter dirty mode
  // so 完成/取消 appear. Reverse-truth: if the cell didn't read the overlay
  // (returned row[field]), broadcastDraftValue would still be the old audio and
  // this assertion would fail.
  it('selecting an audio surfaces the staged value via the overlay + row goes dirty', () => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)

    methods.commitBroadcastInlineAudio.call(ctx, row, '默认.mp3')

    // cell :value reads this — shows the new audio immediately (no PUT)
    expect(methods.broadcastDraftValue.call(ctx, row, 'audio')).toBe('默认.mp3')
    expect(commitBroadcastFields).not.toHaveBeenCalled()
    // row is dirty → 完成/取消 column shows (template v-if="isBroadcastRowDirty")
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(true)
  })

  it('time + name edits both surface via the overlay', () => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)
    methods.commitBroadcastInlineName.call(ctx, row, '改名')
    methods.commitBroadcastInlineTime.call(ctx, row, '08:15:30')
    expect(methods.broadcastDraftValue.call(ctx, row, 'name')).toBe('改名')
    expect(methods.broadcastDraftValue.call(ctx, row, 'time')).toBe('08:15:30')
    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(true)
  })

  it('duration overlay surfaces the staged mode/loop without touching the row', () => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)
    methods.commitBroadcastInlineDuration.call(ctx, row, { loop: 5 })
    expect(methods.broadcastDraftDuration.call(ctx, row, 'mode')).toBe('loop')
    expect(methods.broadcastDraftDuration.call(ctx, row, 'loop')).toBe(5)
    // real row loop untouched
    expect(row.loop).toBe(1)
  })

  it('before any edit the row is NOT dirty (完成/取消 hidden, 编辑/删除 shown)', () => {
    const ctx = makeCleanCtx()
    expect(methods.isBroadcastRowDirty.call(ctx, firstRow(ctx))).toBe(false)
  })

  it('取消 drops the staged draft so the overlay reverts to the synced value', () => {
    const ctx = makeCleanCtx()
    const row = firstRow(ctx)
    methods.commitBroadcastInlineAudio.call(ctx, row, '默认.mp3')
    expect(methods.broadcastDraftValue.call(ctx, row, 'audio')).toBe('默认.mp3')

    methods.cancelBroadcastRowDraft.call(ctx, row)

    expect(methods.isBroadcastRowDirty.call(ctx, row)).toBe(false)
    // overlay falls back to the (untouched) row value
    expect(methods.broadcastDraftValue.call(ctx, row, 'audio')).toBe('上课.mp3')
  })
})
