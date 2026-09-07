/**
 * T36 critic r1 f2 — after `addBroadcastRow` lands the persisted row in
 * modules.broadcasts, the synced-snapshot shadows
 * (lastSyncedBroadcasts / lastSyncedBroadcastBaseSnapshot, plus
 * draftState.broadcastBaseSnapshot when it's the active baseline) must
 * also receive the new row. Otherwise the next deep-watcher fire diffs
 * "current contains new row" against "baseline does not" and the new
 * row's id lands in broadcastDirtyIds → badge falsely claims "N 脏行"
 * even though the remote already accepted state=183.
 *
 * Reverse-truth: removing the mirror unshifts in addBroadcastRow must
 * make `phantom dirty count after add` flip to 1.
 *
 * We use:
 *   - the REAL buildBroadcastBaseSnapshot / prepareBroadcastRows /
 *     cloneRows / withBroadcastDraftSyncSuspended / start/stop
 *     suspension helpers from the SFC, so the test pins the actual
 *     emergency-shaped normalization path used by the fix.
 *   - the REAL calculateBroadcastDraftMeta seam by re-running
 *     buildBroadcastBaseSnapshot + JSON-diff (the same JSON.stringify
 *     comparison the schedulerStorage layer applies — see
 *     calculateBroadcastDraftMeta in src/utils/schedulerStorage.js).
 *   - a stub for the dataService addBroadcastImmediate, since the
 *     remote write itself is not under test here (T36 batch A.1
 *     covered that).
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
    // Force loadSchedulerDrafts to return a clean baseline so the
    // sync path the SFC calls does not pull in stale browser state.
    loadSchedulerDrafts: jest.fn(() => actual.getDefaultSchedulerDrafts())
  }
})

import {
  addBroadcastImmediate,
  commitBroadcastFields
} from '@/api/dataService'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// Mirror schedulerStorage.calculateBroadcastDraftMeta's diff seam: the
// SFC's buildBroadcastBaseSnapshot already normalizes; here we just
// compare JSON-equal per row keyed by taskid/id. If the test's
// normalization drifts from the real one, the SFC unit tests catch it
// via the existing inline-realtime / new-immediate suites.
function dirtyRowCount(currentRows, baseRows) {
  const keyOf = (row) => String(row?.taskid || row?.id || '').trim()
  const baseMap = new Map()
  baseRows.forEach((row) => { baseMap.set(keyOf(row), row) })
  let dirty = 0
  currentRows.forEach((row) => {
    const k = keyOf(row)
    const baseRow = baseMap.get(k)
    if (!baseRow || JSON.stringify(row) !== JSON.stringify(baseRow)) {
      dirty += 1
    }
  })
  return dirty
}

function makeAddCtx() {
  const ctx = {
    addingBroadcast: false,
    audioOptions: [{ value: '默认.mp3', label: '默认.mp3' }],
    modules: { broadcasts: [] },
    // Pre-seeded as if a prior loadBroadcasts had run on a remote with
    // zero rows. addBroadcastRow's contract is that
    // lastSyncedBroadcasts / lastSyncedBroadcastBaseSnapshot reflect
    // "what the remote currently has" — so we mirror that here.
    lastSyncedBroadcasts: [],
    lastSyncedBroadcastBaseSnapshot: [],
    draftState: {
      plans: [],
      planDirtyIds: [],
      planDeletedIds: [],
      planBaseSnapshot: [],
      broadcasts: [],
      broadcastDirtyIds: [],
      broadcastDeletedIds: [],
      broadcastBaseSnapshot: [],
      dirtyScopes: []
    },
    broadcastDraftSyncSuspendedCount: 0,
    $message: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
    $nextTick: (cb) => { if (typeof cb === 'function') cb(); return Promise.resolve() },

    // Real SFC methods we want to exercise (no stubs).
    cloneRows: methods.cloneRows,
    prepareBroadcastRows: methods.prepareBroadcastRows,
    buildBroadcastBaseSnapshot: methods.buildBroadcastBaseSnapshot,
    areBroadcastRowsEqual: methods.areBroadcastRowsEqual,
    currentBroadcastBaseSnapshot: methods.currentBroadcastBaseSnapshot,
    withBroadcastDraftSyncSuspended: methods.withBroadcastDraftSyncSuspended,
    withBroadcastDraftSyncSuspendedAsync: methods.withBroadcastDraftSyncSuspendedAsync,
    applyBroadcastImmediateThenClear: methods.applyBroadcastImmediateThenClear,
    startBroadcastDraftSyncSuspension: methods.startBroadcastDraftSyncSuspension,
    stopBroadcastDraftSyncSuspension: methods.stopBroadcastDraftSyncSuspension,
    patchBroadcastSyncedSnapshotForRow: methods.patchBroadcastSyncedSnapshotForRow,
    newBroadcastRow: methods.newBroadcastRow,
    buildUniqueBroadcastName: methods.buildUniqueBroadcastName,
    buildAllTaskRow: methods.buildAllTaskRow,
    addBroadcastRow: methods.addBroadcastRow,
    // T51 ①: add paths backfill canonical rows after the clear; stub to a no-op
    // here (this spec isolates the snapshot-mirror logic).
    backfillBroadcastsFromRemote: jest.fn(() => Promise.resolve()),
    // $set is the Vue 2 reactive setter; in a plain-ctx test we fall
    // back to direct assignment which is fine because the test reads
    // the object directly (no template render).
    $set: (target, key, value) => {
      target[key] = value
      return value
    },

    // Minimal stubs for the deps newBroadcastRow / buildAllTaskRow rely on.
    createBroadcastDraftId: () => `draft-${Math.random().toString(36).slice(2, 8)}`,
    defaultLocation: () => [],
    normalizeBroadcastTempId: (value, fallbackTaskId, idx) => {
      const candidates = [value, fallbackTaskId]
      for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) continue
        const text = String(candidate).trim()
        if (/^\d+$/.test(text) && text !== '0') return text
        if (text) return text
      }
      return `draft-broadcast-${idx}`
    },
    uniqueStringList: (value) => Array.from(
      new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter((item) => item))
    ),
    normalizeLocationPaths: (value) => (Array.isArray(value) ? value : []),
    formatDurationHms: (value) => String(value || '00:05:00'),
    resolveLocationFromRow: (row) => (Array.isArray(row?.location) ? row.location : []),
    normalizeWeekdays: methods.normalizeWeekdays,
    // buildAllTaskRow deps (it serializes the row into the remote payload
    // shape; we only care that it does not throw on a fresh draft).
    toTime: (value) => {
      const text = String(value || '').trim()
      if (!text) return '00:00:00'
      return text.length === 5 ? `${text}:00` : text
    },
    normalizeRealTaskId: (value) => {
      const text = String(value ?? '').trim()
      return /^\d+$/.test(text) && text !== '0' ? text : ''
    },
    formatTaskinfoDurationForApi: () => '1',
    resolvePlanTaskTerminalFields: (row) => ({
      location: Array.isArray(row?.location) ? row.location : [],
      terminalids: Array.isArray(row?.terminalids) ? row.terminalids : [],
      terminalnames: Array.isArray(row?.terminalnames) ? row.terminalnames : [],
      liveterminalid: row?.liveterminalid || '',
      liveterminalname: row?.liveterminalname || ''
    }),

    // syncBroadcastDraftState writes to localStorage via schedulerStorage;
    // we don't need to assert that side effect — the dirty-count assertion
    // works straight off the lastSyncedBroadcastBaseSnapshot shadow, which
    // is the very thing the storage layer reads.
    syncBroadcastDraftState: jest.fn(),
    persistBroadcastDraftLocally: jest.fn()
  }
  return ctx
}

describe('TaskSchedulerPage addBroadcastRow synced-snapshot mirror (T36 critic r1 f2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    addBroadcastImmediate.mockResolvedValue({ task_id: '73900' })
  })

  it('after a successful add, lastSyncedBroadcastBaseSnapshot contains the new row and dirty count is 0', async() => {
    const ctx = makeAddCtx()

    await ctx.addBroadcastRow()

    // Remote write happened exactly once.
    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)

    // The new row landed at the head of modules.broadcasts with the real taskid.
    expect(ctx.modules.broadcasts.length).toBe(1)
    expect(ctx.modules.broadcasts[0].taskid).toBe('73900')

    // The mirror unshifts (the fix) put the same row into both shadows.
    expect(ctx.lastSyncedBroadcasts.length).toBe(1)
    expect(String(ctx.lastSyncedBroadcasts[0].taskid)).toBe('73900')
    expect(ctx.lastSyncedBroadcastBaseSnapshot.length).toBe(1)
    expect(String(ctx.lastSyncedBroadcastBaseSnapshot[0].taskid)).toBe('73900')

    // The diff the storage layer would compute is empty: current rows
    // (normalized) match the baseline. Zero phantom dirty.
    const currentNormalized = ctx.buildBroadcastBaseSnapshot(ctx.modules.broadcasts)
    expect(dirtyRowCount(currentNormalized, ctx.lastSyncedBroadcastBaseSnapshot)).toBe(0)

    // syncBroadcastDraftState was called once after the mirror — that's
    // the recompute that makes the badge re-evaluate against the now-
    // consistent baseline.
    expect(ctx.syncBroadcastDraftState).toHaveBeenCalledTimes(1)
  })

  it('when draftState.broadcastBaseSnapshot is the active baseline, it also receives the new row', async() => {
    // Simulate a prior unrelated dirty edit: a row exists in the
    // baseline only on draftState.broadcastBaseSnapshot (the path
    // currentBroadcastBaseSnapshot prefers when broadcasts is a dirty
    // scope). Without the f2 fix, this snapshot would diverge from
    // modules.broadcasts and the new row would phantom-dirty here too.
    const ctx = makeAddCtx()
    const stalePriorRow = ctx.buildBroadcastBaseSnapshot([{
      id: '12345', taskid: '12345', name: '旧任务', volume: 50,
      audio: '默认.mp3', durationMode: 'loop', loop: 1, terminalids: [], terminalnames: []
    }])
    ctx.draftState = {
      ...ctx.draftState,
      broadcastBaseSnapshot: [...stalePriorRow],
      broadcastDirtyIds: ['12345'],
      dirtyScopes: ['broadcasts']
    }
    ctx.modules.broadcasts.push({
      id: '12345', taskid: '12345', name: '旧任务-改', volume: 60,
      audio: '默认.mp3', durationMode: 'loop', loop: 1, terminalids: [], terminalnames: []
    })

    await ctx.addBroadcastRow()

    expect(ctx.modules.broadcasts.length).toBe(2)
    // New row appears at the head of draftState.broadcastBaseSnapshot
    // (the mirror that setEmergency also performs for the same reason).
    expect(ctx.draftState.broadcastBaseSnapshot.length).toBe(2)
    expect(String(ctx.draftState.broadcastBaseSnapshot[0].taskid)).toBe('73900')
    // The new row is NOT counted as dirty against this baseline.
    const currentNormalized = ctx.buildBroadcastBaseSnapshot(ctx.modules.broadcasts)
    const newRowDirty = currentNormalized.filter((row) => row.taskid === '73900').some((row) => {
      const baseRow = ctx.draftState.broadcastBaseSnapshot.find((b) => b.taskid === '73900')
      return !baseRow || JSON.stringify(row) !== JSON.stringify(baseRow)
    })
    expect(newRowDirty).toBe(false)
  })

  it('when the remote rejects (no task_id), the row never lands and the shadows stay untouched', async() => {
    addBroadcastImmediate.mockResolvedValueOnce({ task_id: '' })
    const ctx = makeAddCtx()

    await ctx.addBroadcastRow()

    expect(ctx.modules.broadcasts.length).toBe(0)
    expect(ctx.lastSyncedBroadcasts.length).toBe(0)
    expect(ctx.lastSyncedBroadcastBaseSnapshot.length).toBe(0)
    expect(ctx.$message.error).toHaveBeenCalled()
  })
})

// T37 redesign — broadcast cell @change is gone (cells are read-only).
// All edits now flow through the drawer: open → mutate draft → click
// "完成编辑" → saveBroadcastTaskDrawer fires either addBroadcastImmediate
// (isNew=true, Q1=B) or commitBroadcastFields (isNew=false). The drawer
// strips mediaid (R1 silent-stale guardrail) and terminal id columns
// (terminal fail-loud guardrail) before sending; on success it patches
// the snapshot shadows so the deep watcher's next diff stays at zero
// dirty rows (no phantom badge after commit).
//
// Reverse-truth coverage (3 mandatory):
//   F1: commenting the `if (isNew) { ... addBroadcastImmediate ... }`
//       branch in saveBroadcastTaskDrawer MUST make the add drawer test
//       FAIL because addBroadcastImmediate is never called.
//   F2: commenting the `} else { ... commitBroadcastFields ... }`
//       branch in saveBroadcastTaskDrawer MUST make the edit drawer
//       test FAIL because commitBroadcastFields is never called.
//   F3: commenting `if (kind === 'broadcast') { return ... filter
//       folderid === 2 ... }` in filteredAudioOptions MUST make the
//       audio scope test FAIL (folderid=3 entries leak into the
//       broadcast drawer dropdown).
describe('TaskSchedulerPage broadcast drawer save (T37 redesign)', () => {
  function makeDrawerCtx() {
    const ctx = makeAddCtx()
    ctx.audioOptions = [
      { value: '默认.mp3', label: '默认.mp3', id: '101', folderid: 2 },
      { value: '紧急.mp3', label: '紧急.mp3', id: '202', folderid: 3 },
      { value: '上课.mp3', label: '上课.mp3', id: '303', folderid: 2 }
    ]
    ctx.taskDrawer = {
      visible: false, plan: null, task: null, draft: null,
      isNew: false, isOnceOverride: false, overrideId: '', onceTaskId: '',
      sourceSummary: '', kind: 'plan', broadcastRow: null
    }
    ctx.taskDrawerErrors = {}
    ctx.taskDrawerMidnightWarning = false
    ctx.toDurationSeconds = (value) => {
      if (typeof value === 'number') return value
      const text = String(value || '').trim()
      if (!text) return 0
      if (/^\d+$/.test(text)) return Number(text)
      const parts = text.split(':').map((seg) => Number(seg) || 0)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      if (parts.length === 2) return parts[0] * 60 + parts[1]
      return 0
    }
    ctx.normalizeDate = (value) => {
      const text = String(value || '').trim()
      if (!text) return ''
      const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (!match) return ''
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    }
    ctx.createDraftTaskId = () => `draft-${Math.random().toString(36).slice(2, 8)}`
    ctx.repairStoredLocationBinding = () => {}
    ctx.expandLocationSelection = (location) => ({
      paths: Array.isArray(location) ? location : [],
      emptyZones: []
    })
    ctx.emptyZoneLocationMessage = () => '终端地点不能为空'
    ctx.syncTerminalFieldsFromLocation = () => {}
    ctx.isMidnightTime = () => false
    ctx.focusTaskDrawerField = () => {}
    ctx.resetInlineTaskEdit = () => {}
    ctx.formatTaskinfoDurationForApi = methods.formatTaskinfoDurationForApi
      ? methods.formatTaskinfoDurationForApi
      : () => '1'
    ctx.rowDurationLabel = () => ''
    ctx.locationSummary = () => ''
    ctx.statusTag = () => 'info'
    ctx.isBroadcastManualOnly = () => false
    // Real drawer + save methods under test.
    ctx.openBroadcastTaskDrawer = methods.openBroadcastTaskDrawer
    ctx.openBroadcastTaskDrawerForAdd = methods.openBroadcastTaskDrawerForAdd
    ctx.broadcastRowToDraft = methods.broadcastRowToDraft
    ctx.draftToBroadcastRow = methods.draftToBroadcastRow
    ctx.saveBroadcastTaskDrawer = methods.saveBroadcastTaskDrawer
    ctx.saveTaskDrawer = methods.saveTaskDrawer
    ctx._saveTaskDrawerImpl = methods._saveTaskDrawerImpl
    ctx.closeTaskDrawer = methods.closeTaskDrawer
    ctx.resetTaskDrawerValidation = methods.resetTaskDrawerValidation
    ctx.validateTaskDrawerDraft = methods.validateTaskDrawerDraft
    return ctx
  }

  function computeFilteredAudioOptions(ctx) {
    const computedFn = TaskSchedulerPage.computed.filteredAudioOptions
    return computedFn.call(ctx)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    addBroadcastImmediate.mockResolvedValue({ task_id: '73900' })
    commitBroadcastFields.mockResolvedValue({ status: 'ok', task_id: '73900' })
  })

  it('openBroadcastTaskDrawer hydrates draft from row (edit mode, kind=broadcast)', () => {
    const ctx = makeDrawerCtx()
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 70,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 2,
      weekdays: ['周一', '周二'], location: [['zone-1', 'T1']],
      terminalids: ['1'], terminalnames: ['T1'],
      liveterminalid: '1', liveterminalname: 'T1',
      startdate: '2026-06-01', enddate: '2026-12-31'
    }
    ctx.openBroadcastTaskDrawer(row)
    expect(ctx.taskDrawer.visible).toBe(true)
    expect(ctx.taskDrawer.kind).toBe('broadcast')
    expect(ctx.taskDrawer.isNew).toBe(false)
    expect(ctx.taskDrawer.broadcastRow).toBe(row)
    expect(ctx.taskDrawer.draft.customName).toBe('早读铃')
    expect(ctx.taskDrawer.draft.audio).toBe('上课.mp3')
    expect(ctx.taskDrawer.draft.mediaid).toBe('303')
    expect(ctx.taskDrawer.draft.volume).toBe(70)
    expect(ctx.taskDrawer.draft.weekdays).toEqual(['周一', '周二'])
    expect(ctx.taskDrawer.draft.dateRange).toEqual(['2026-06-01', '2026-12-31'])
  })

  it('add drawer: saveBroadcastTaskDrawer (isNew=true) POSTs addBroadcastImmediate and mirrors snapshots', async() => {
    const ctx = makeDrawerCtx()
    ctx.openBroadcastTaskDrawerForAdd()
    expect(ctx.taskDrawer.isNew).toBe(true)
    expect(ctx.taskDrawer.kind).toBe('broadcast')
    ctx.taskDrawer.draft.customName = '新铃声'
    ctx.taskDrawer.draft.audio = '上课.mp3'
    ctx.taskDrawer.draft.time = '08:00:00'
    ctx.taskDrawer.draft.weekdays = ['周一']
    ctx.taskDrawer.draft.location = [['zone-1', 'T1']]
    await ctx.saveBroadcastTaskDrawer({ draft: ctx.taskDrawer.draft, isNew: true })

    expect(addBroadcastImmediate).toHaveBeenCalledTimes(1)
    expect(commitBroadcastFields).not.toHaveBeenCalled()
    expect(ctx.modules.broadcasts.length).toBe(1)
    expect(ctx.modules.broadcasts[0].taskid).toBe('73900')
    expect(ctx.modules.broadcasts[0].name).toBe('新铃声')
    expect(ctx.lastSyncedBroadcasts.length).toBe(1)
    expect(String(ctx.lastSyncedBroadcasts[0].taskid)).toBe('73900')
    // Drawer is closed after a successful add.
    expect(ctx.taskDrawer.visible).toBe(false)
  })

  it('edit drawer: saveBroadcastTaskDrawer (isNew=false) PUTs commitBroadcastFields with mediaid + terminal ids stripped', async() => {
    const ctx = makeDrawerCtx()
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9', '14'], terminalnames: ['T1', 'T2'],
      liveterminalid: '9', liveterminalname: 'T1'
    }
    ctx.modules.broadcasts.push(row)
    ctx.openBroadcastTaskDrawer(row)
    // User changed volume, audio and location.
    ctx.taskDrawer.draft.volume = 88
    ctx.taskDrawer.draft.audio = '默认.mp3'
    ctx.taskDrawer.draft.mediaid = '101'
    ctx.taskDrawer.draft.location = [['zone-2', 'T9']]

    await ctx.saveBroadcastTaskDrawer({ draft: ctx.taskDrawer.draft, isNew: false })

    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)
    expect(addBroadcastImmediate).not.toHaveBeenCalled()
    const [calledTaskId, calledPayload] = commitBroadcastFields.mock.calls[0]
    expect(calledTaskId).toBe('500')
    // R1: mediaid must be stripped so backend re-resolves by name.
    expect(calledPayload.row.mediaid).toBeUndefined()
    // Terminal id columns stripped (fail-loud guardrail).
    expect(calledPayload.row.terminalids).toBeUndefined()
    expect(calledPayload.row.liveterminalid).toBeUndefined()
    expect(calledPayload.row.taskterminal).toBeUndefined()
    expect(calledPayload.row.terminalnames).toBeUndefined()
    expect(calledPayload.row.liveterminalname).toBeUndefined()
    // Mutated fields land in payload.
    expect(calledPayload.row.volume).toBe(88)
    expect(calledPayload.row.medianame).toBe('默认.mp3')
    expect(calledPayload.row.location).toEqual([['zone-2', 'T9']])
    // dirty_fields names follow backend field key convention.
    expect(calledPayload.dirty_fields).toContain('volume')
    expect(calledPayload.dirty_fields).toContain('location')
    expect(calledPayload.dirty_fields).toContain('medianame')
    // The original row was updated in place + snapshot shadows mirror.
    expect(ctx.modules.broadcasts[0].volume).toBe(88)
    expect(ctx.modules.broadcasts[0].audio).toBe('默认.mp3')
  })

  // T37 drawer skeleton — prepower + level fields flow draft → row → PUT
  // payload + dirty_fields contains both. Probe #19 verified :183 persists
  // prepower / level; the view-layer fix (backend
  // _map_remote_taskinfo_items) exposes them on /data/all_task rows so the
  // round-trip draft.prepower → row.prepower → next openBroadcastTaskDrawer
  // re-reads the saved value.
  //
  // Reverse-truth F4: commenting `prepower: ... Number(draft.prepower) ...`
  // in draftToBroadcastRow makes calledPayload.row.prepower flip
  // undefined-or-0; the explicit `=== 15` assertion fails with
  // expected 15 received 0 (or undefined depending on field presence).
  it('edit drawer: prepower + level flow draft → row → PUT payload + dirty_fields', async() => {
    const ctx = makeDrawerCtx()
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      prepower: 0, level: 0,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.openBroadcastTaskDrawer(row)
    // Drawer hydrated draft from row.
    expect(ctx.taskDrawer.draft.prepower).toBe(0)
    expect(ctx.taskDrawer.draft.level).toBe(0)
    // User changes prepower + level in the drawer.
    ctx.taskDrawer.draft.prepower = 15
    ctx.taskDrawer.draft.level = 50

    await ctx.saveBroadcastTaskDrawer({ draft: ctx.taskDrawer.draft, isNew: false })

    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)
    const [, calledPayload] = commitBroadcastFields.mock.calls[0]
    expect(calledPayload.row.prepower).toBe(15)
    expect(calledPayload.row.level).toBe(50)
    expect(calledPayload.dirty_fields).toContain('prepower')
    expect(calledPayload.dirty_fields).toContain('level')
    // Row in modules.broadcasts patched in place.
    expect(ctx.modules.broadcasts[0].prepower).toBe(15)
    expect(ctx.modules.broadcasts[0].level).toBe(50)
  })

  it('edit drawer: commit failure 422 keeps drawer open and surfaces warning', async() => {
    const ctx = makeDrawerCtx()
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', time: '07:30:00', durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.openBroadcastTaskDrawer(row)
    ctx.taskDrawer.draft.location = [['zone-unknown']]
    commitBroadcastFields.mockRejectedValueOnce({
      response: { status: 422, data: { detail: 'location 解析不到任何终端，请重选' }}
    })

    await ctx.saveBroadcastTaskDrawer({ draft: ctx.taskDrawer.draft, isNew: false })

    expect(ctx.$message.warning).toHaveBeenCalledWith('location 解析不到任何终端，请重选')
    expect(ctx.$message.error).not.toHaveBeenCalled()
    // Drawer stays open so the user can fix and retry.
    expect(ctx.taskDrawer.visible).toBe(true)
  })

  it('filteredAudioOptions filters by folderid=2 when drawer kind=broadcast; full set otherwise', () => {
    const ctx = makeDrawerCtx()
    // Default plan kind: full set (3 items).
    ctx.taskDrawer.kind = 'plan'
    let opts = computeFilteredAudioOptions(ctx)
    expect(opts.length).toBe(3)
    // Broadcast kind: only folderid=2 (2 items).
    ctx.taskDrawer.kind = 'broadcast'
    opts = computeFilteredAudioOptions(ctx)
    expect(opts.length).toBe(2)
    expect(opts.every((o) => Number(o.folderid) === 2)).toBe(true)
    expect(opts.find((o) => o.value === '紧急.mp3')).toBeUndefined()
  })

  // T37 critic-r1 f1 — drawer "完成编辑" double-click guard.
  // The save flow is async (addBroadcastImmediate / commitBroadcastFields
  // can sit on a slow network for hundreds of ms). Without a re-entry
  // latch, a fast double-click on "完成编辑" fires saveTaskDrawer twice:
  //   isNew=true  → second call 409s on the now-duplicate task name.
  //   isNew=false → second call duplicate-commits + BSJ mirror runs twice.
  // saveTaskDrawer must flip taskDrawerSaving=true on entry, and reset
  // to false in finally (so error paths also release the latch).
  //
  // Reverse-truth: commenting `this.taskDrawerSaving = true` in
  // saveTaskDrawer MUST make this test FAIL because the assertion
  // observed taskDrawerSaving=false in the middle of an unresolved
  // commit.
  it('saveTaskDrawer flips taskDrawerSaving true during commit, resets to false after (double-click guard)', async() => {
    const ctx = makeDrawerCtx()
    ctx.taskDrawerSaving = false
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.openBroadcastTaskDrawer(row)

    // Hold commitBroadcastFields on a hand-controlled promise so the
    // saving latch is observable mid-flight.
    let releaseCommit
    const heldCommit = new Promise((resolve) => { releaseCommit = resolve })
    commitBroadcastFields.mockReturnValueOnce(heldCommit)

    const inFlight = ctx.saveTaskDrawer()
    // Yield once so the async function progresses past the first await.
    await Promise.resolve()
    expect(ctx.taskDrawerSaving).toBe(true)

    // A concurrent click during the in-flight save is a no-op (guard).
    const secondClick = ctx.saveTaskDrawer()
    await Promise.resolve()
    await secondClick
    expect(commitBroadcastFields).toHaveBeenCalledTimes(1)

    // Release the held commit and let saveTaskDrawer finish.
    releaseCommit({ status: 'ok', task_id: '500' })
    await inFlight
    expect(ctx.taskDrawerSaving).toBe(false)
  })

  it('saveTaskDrawer resets taskDrawerSaving to false even when the commit rejects', async() => {
    const ctx = makeDrawerCtx()
    ctx.taskDrawerSaving = false
    const row = {
      id: '500', taskid: '500', name: '早读铃', volume: 50,
      audio: '上课.mp3', mediaid: '303', time: '07:30:00',
      durationMode: 'loop', loop: 1,
      weekdays: ['周一'], location: [['zone-1', 'T1']],
      terminalids: ['9'], terminalnames: ['T1']
    }
    ctx.modules.broadcasts.push(row)
    ctx.openBroadcastTaskDrawer(row)
    commitBroadcastFields.mockRejectedValueOnce({
      response: { status: 422, data: { detail: 'zone_ambig' }}
    })

    await ctx.saveTaskDrawer()

    expect(ctx.taskDrawerSaving).toBe(false)
  })
})

// T37 redesign reverse-truth records (for the builder report)
//
// F1 — `add drawer: saveBroadcastTaskDrawer (isNew=true) POSTs ...`:
//   block under test: the `if (isNew) { ... resp = await
//   addBroadcastImmediate(payload) ... }` inside saveBroadcastTaskDrawer.
//   Verified by temp-commenting the await call: test fails because
//   addBroadcastImmediate.mock.calls.length stays at 0.
//     expected: addBroadcastImmediate called 1×, modules.broadcasts.length === 1
//     received without block: called 0×, modules.broadcasts.length === 0
//
// F2 — `edit drawer: saveBroadcastTaskDrawer (isNew=false) PUTs ...`:
//   block under test: the `await commitBroadcastFields(remoteTaskId,
//   { row: rowPayload, dirty_fields })` inside saveBroadcastTaskDrawer.
//   Verified by temp-commenting the await: test fails because
//   commitBroadcastFields.mock.calls.length stays at 0.
//     expected: commitBroadcastFields called 1×, payload.row.mediaid undefined
//     received without block: called 0×
//
// F3 — `filteredAudioOptions filters by folderid=2 ...`:
//   block under test: the `if (kind === 'broadcast') { return
//   this.audioOptions.filter((item) => Number(item.folderid) === 2) }`
//   inside the filteredAudioOptions computed. Verified by removing the
//   filter (returning this.audioOptions unconditionally): test fails
//   because opts.length stays at 3 for broadcast kind and the f3-only
//   `紧急.mp3` leaks into the dropdown.
//     expected: opts.length === 2, no folderid=3 leak
//     received without block: opts.length === 3, folderid=3 present
