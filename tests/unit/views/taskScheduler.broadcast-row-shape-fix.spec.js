// T51 (task #25): the broadcast self-perpetuating draft fix. A locally-built
// add row (shape-A: status '待执行', taskstate null, time 'HH:MM:SS', a
// populated liveterminalname) forks from the server canonical form (shape-B:
// status '停止', taskstate 0, time 'HH:MM', liveterminalname ''). Before the
// fix, that fork made the row register as dirty forever (loadBroadcasts kept
// re-saving the never-equal draft). The fix has three parts:
//   ① add backfills the canonical row from the remote (covered via the add
//      paths calling backfillBroadcastsFromRemote — exercised here through the
//      derived-field compare that makes shape-A == shape-B substantively),
//   ② loadBroadcasts auto-clears a draft that differs only in derived fields,
//   ③ the compare layer normalizes the derived trio (taskstate / time format /
//      liveterminalname) — and leaves status untouched so batch status staging
//      still lights the draft (KP #22 r2).

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

import Vue from 'vue'
import { addBroadcastImmediate, fetchBroadcasts } from '@/api/dataService'
import {
  saveBroadcastDraft,
  areBroadcastRowsSubstantivelyEqual,
  hasSchedulerDirtyScope,
  getDefaultSchedulerDrafts
} from '@/utils/schedulerStorage'
import TaskSchedulerPage from '@/views/task-scheduler/index.vue'

const { methods } = TaskSchedulerPage

// A row as the LOCAL add path builds it (shape-A): status '待执行', taskstate
// absent, time with seconds, a populated liveterminalname.
function shapeA(overrides = {}) {
  return {
    id: '73900', taskid: '73900', name: '新铃声', status: '待执行',
    volume: 60, audio: '默认.mp3', durationMode: 'loop', loop: 1,
    location: [['zone-1', 'T1']], terminalids: ['9'], terminalnames: ['T1'],
    liveterminalid: '', liveterminalname: '右一终端',
    time: '08:00:00', starttime: '08:00:00', startdate: '2026-01-01', enddate: '2039-12-31',
    ...overrides
  }
}

// The same task as the SERVER returns it (shape-B): status '停止', taskstate 0,
// time without seconds, liveterminalname ''.
function shapeB(overrides = {}) {
  return {
    id: '73900', taskid: '73900', name: '新铃声', status: '停止',
    taskstate: 0, volume: 60, audio: '默认.mp3', durationMode: 'loop', loop: 1,
    location: [['zone-1', 'T1']], terminalids: ['9'], terminalnames: ['T1'],
    liveterminalid: '', liveterminalname: '',
    time: '08:00', starttime: '08:00', startdate: '2026-01-01', enddate: '2039-12-31',
    ...overrides
  }
}

// Build prepared (snapshot) forms the way the diff sees them.
function prepare(rows) {
  const ctx = {
    cloneRows: methods.cloneRows,
    normalizeBroadcastTempId: methods.normalizeBroadcastTempId,
    uniqueStringList: methods.uniqueStringList,
    normalizeLocationPaths: methods.normalizeLocationPaths,
    formatDurationHms: methods.formatDurationHms,
    resolveLocationFromRow: methods.resolveLocationFromRow,
    normalizeWeekdays: methods.normalizeWeekdays
  }
  return methods.prepareBroadcastRows.call(ctx, rows)
}

describe('T51 ③ derived-field compare — shape-A vs shape-B', () => {
  it('treats shape-A and shape-B of the same task as substantively equal (status differs only by derived form? NO — status IS compared)', () => {
    // NOTE: status differs here ('待执行' vs '停止') which IS substantive, so
    // these are NOT equal. This pins that status is part of the compare.
    expect(areBroadcastRowsSubstantivelyEqual(prepare([shapeA()]), prepare([shapeB()]))).toBe(false)
  })

  it('treats two rows differing ONLY in the derived trio as substantively equal', () => {
    // Same status, differ only in taskstate / time format / liveterminalname.
    const localish = shapeA({ status: '停止' }) // align the one substantive field
    const serverish = shapeB({ status: '停止' })
    expect(areBroadcastRowsSubstantivelyEqual(prepare([localish]), prepare([serverish]))).toBe(true)
  })

  it('reverse-truth: a real volume edit is NOT substantively equal (would keep the draft)', () => {
    const edited = shapeA({ status: '停止', volume: 30 })
    const server = shapeB({ status: '停止', volume: 60 })
    expect(areBroadcastRowsSubstantivelyEqual(prepare([edited]), prepare([server]))).toBe(false)
  })

  it('reverse-truth: a status edit (batch staging) is NOT substantively equal — draft survives (KP #22 r2)', () => {
    const staged = shapeA({ status: '暂停' })
    const server = shapeB({ status: '停止' })
    expect(areBroadcastRowsSubstantivelyEqual(prepare([staged]), prepare([server]))).toBe(false)
  })

  // critic-fix4 f1: backend format_hhmmss PRESERVES seconds, so the time
  // normalization must only fold the digit-count equivalence, NOT strip seconds.
  it('folds the HH:MM vs HH:MM:00 digit-count difference (equal)', () => {
    const a = shapeA({ status: '停止', time: '08:00', starttime: '08:00' })
    const b = shapeB({ status: '停止', time: '08:00:00', starttime: '08:00:00' })
    expect(areBroadcastRowsSubstantivelyEqual(prepare([a]), prepare([b]))).toBe(true)
  })

  it('reverse-truth: a REAL second-level time difference is NOT equal (seconds preserved)', () => {
    const a = shapeA({ status: '停止', time: '08:00:30', starttime: '08:00:30' })
    const b = shapeB({ status: '停止', time: '08:00:00', starttime: '08:00:00' })
    expect(areBroadcastRowsSubstantivelyEqual(prepare([a]), prepare([b]))).toBe(false)
  })
})

describe('T51 ③ dirty recompute — derived diff does NOT light the badge', () => {
  it('a draft that differs from base only in the derived trio computes NO dirty ids', () => {
    const base = prepare([shapeB({ status: '停止' })])
    const current = prepare([shapeA({ status: '停止' })]) // derived trio differs
    const draft = saveBroadcastDraft(current, base)
    expect(draft.broadcastDirtyIds).toEqual([])
    expect(hasSchedulerDirtyScope('broadcasts', draft)).toBe(false)
  })

  it('reverse-truth: a status difference DOES light the badge (batch status staging)', () => {
    const base = prepare([shapeB({ status: '停止' })])
    const current = prepare([shapeA({ status: '暂停' })]) // status staged
    const draft = saveBroadcastDraft(current, base)
    expect(draft.broadcastDirtyIds).toEqual(['73900'])
    expect(hasSchedulerDirtyScope('broadcasts', draft)).toBe(true)
  })

  it('reverse-truth: a volume difference DOES light the badge', () => {
    const base = prepare([shapeB({ status: '停止', volume: 60 })])
    const current = prepare([shapeA({ status: '停止', volume: 30 })])
    const draft = saveBroadcastDraft(current, base)
    expect(draft.broadcastDirtyIds).toEqual(['73900'])
    expect(hasSchedulerDirtyScope('broadcasts', draft)).toBe(true)
  })
})

describe('T51 ① backfillBroadcastsFromRemote — best-effort canonical refill', () => {
  it('forces a reload (broadcastsLoaded=false then loadBroadcasts) so the canonical row replaces the local one', async() => {
    const ctx = {
      broadcastsLoaded: true,
      loadBroadcasts: jest.fn(() => Promise.resolve())
    }
    await methods.backfillBroadcastsFromRemote.call(ctx)
    expect(ctx.broadcastsLoaded).toBe(false)
    expect(ctx.loadBroadcasts).toHaveBeenCalledTimes(1)
  })

  it('does NOT throw when the refill GET fails (POST already ACKed — add must not look failed)', async() => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = {
      broadcastsLoaded: true,
      loadBroadcasts: jest.fn(() => Promise.reject(new Error('GET down')))
    }
    await expect(methods.backfillBroadcastsFromRemote.call(ctx)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

// critic-fix4 INFO i1: end-to-end coherence — a real vm running the REAL
// backfill → loadBroadcasts chain (not stubbed). Pre-stage a batch volume draft
// on another row, then drawer-add a new task; the add's canonical backfill must
// (a) leave the new row with no phantom dirty and (b) NOT swallow the other
// row's volume staging (KP #22 r2).
const flush = async(n = 12) => { for (let i = 0; i < n; i += 1) await Promise.resolve() }

function pickMethods(...names) {
  const out = {}
  names.forEach((n) => { out[n] = methods[n] })
  return out
}

function makeE2eVm() {
  // The existing remote row '600' the user batch-volume-staged to 90.
  const stagedRowServer = { id: '600', taskid: '600', name: '午休铃', status: '停止', volume: 50, audio: '午休.mp3', durationMode: 'loop', loop: 1, location: [['zone-2', 'T2']], terminalids: ['14'], terminalnames: ['T2'], liveterminalid: '', liveterminalname: '', time: '12:00', starttime: '12:00', startdate: '2026-01-01', enddate: '2039-12-31' }
  const vm = new Vue({
    data() {
      return {
        modules: { broadcasts: [] },
        draftState: getDefaultSchedulerDrafts(),
        broadcastsLoaded: true,
        broadcastsLoading: false,
        tableLoadingByTab: {},
        tableLoadedByTab: {},
        suspendBroadcastDraftSync: false,
        broadcastDraftSyncSuspendDepth: 0,
        lastSyncedBroadcasts: [],
        lastSyncedBroadcastBaseSnapshot: [],
        addingBroadcast: false,
        audioOptions: [{ value: '默认.mp3', label: '默认.mp3' }],
        taskDrawer: { visible: false, plan: null, task: null, draft: null, isNew: false, isOnceOverride: false, overrideId: '', onceTaskId: '', sourceSummary: '', kind: 'broadcast', broadcastRow: null }
      }
    },
    watch: {
      'modules.broadcasts': {
        deep: true,
        handler() {
          if (this.suspendBroadcastDraftSync) return
          if (!this.broadcastsLoaded) return
          this.syncBroadcastDraftState()
        }
      }
    },
    methods: {
      ...pickMethods(
        'cloneRows', 'prepareBroadcastRows', 'buildBroadcastBaseSnapshot', 'areBroadcastRowsEqual',
        'currentBroadcastBaseSnapshot', 'withBroadcastDraftSyncSuspended', 'withBroadcastDraftSyncSuspendedAsync',
        'applyBroadcastImmediateThenClear', 'startBroadcastDraftSyncSuspension', 'stopBroadcastDraftSyncSuspension',
        'patchBroadcastSyncedSnapshotForRow', 'newBroadcastRow', 'buildUniqueBroadcastName', 'buildAllTaskRow',
        'addBroadcastRow', 'saveBroadcastTaskDrawer', 'clearBroadcastDraftState', '_canClearBroadcastDraftAfterImmediateCommit',
        'setBroadcastRows', 'normalizeModules', 'draftToBroadcastRow', 'syncBroadcastDraftState', 'persistBroadcastDraftLocally',
        'closeTaskDrawer', 'applyTerminalInfoFromAllTask', 'setTableLoaded', 'setTableLoading', 'loadBroadcasts',
        'backfillBroadcastsFromRemote'
      ),
      newPlanTask() { return { weekdays: [], location: [] } },
      normalizeWeekdays(v) { return Array.isArray(v) ? v : [] },
      resetTaskDrawerValidation() {},
      resetInlineTaskEdit() {},
      repairStoredLocationBinding() {},
      defaultLocation() { return [] },
      createBroadcastDraftId() { return `draft-${Math.random().toString(36).slice(2, 8)}` },
      normalizeBroadcastTempId(value, fallbackTaskId, idx) { const cands = [value, fallbackTaskId]; for (const c of cands) { if (c == null) continue; const t = String(c).trim(); if (/^\d+$/.test(t) && t !== '0') return t; if (t) return t } return `draft-broadcast-${idx}` },
      uniqueStringList(v) { return Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter(Boolean))) },
      normalizeLocationPaths(v) { return Array.isArray(v) ? v : [] },
      formatDurationHms(v) { return String(v || '00:05:00') },
      resolveLocationFromRow(row) { return Array.isArray(row?.location) ? row.location : [] },
      toTime(v) { const t = String(v || '').trim(); if (!t) return '00:00:00'; return t.length === 5 ? `${t}:00` : t },
      normalizeRealTaskId(v) { const t = String(v ?? '').trim(); return /^\d+$/.test(t) && t !== '0' ? t : '' },
      formatTaskinfoDurationForApi() { return '1' },
      resolvePlanTaskTerminalFields(row) { return { location: Array.isArray(row?.location) ? row.location : [], terminalids: Array.isArray(row?.terminalids) ? row.terminalids : [], terminalnames: Array.isArray(row?.terminalnames) ? row.terminalnames : [], liveterminalid: row?.liveterminalid || '', liveterminalname: row?.liveterminalname || '' } },
      toDurationSeconds(v) { return typeof v === 'number' ? v : 0 },
      normalizeDate(v) { const t = String(v || '').trim(); const m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '' }
    }
  })
  vm.$message = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
  vm.__stagedRowServer = stagedRowServer
  return vm
}

describe('T51 end-to-end (i1): batch staging survives a drawer add + canonical backfill', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('drawer add backfills canonical rows without swallowing another row’s volume staging', async() => {
    const vm = makeE2eVm()
    const serverRow = vm.__stagedRowServer
    // init: load the existing row '600' as the synced base
    fetchBroadcasts.mockResolvedValueOnce({ broadcasts: [serverRow] })
    vm.broadcastsLoaded = false
    await vm.loadBroadcasts()
    await flush()

    // user batch-volume-stages row '600' to 90 (a real, unsaved volume edit)
    vm.modules.broadcasts[0].volume = 90
    vm.persistBroadcastDraftLocally('音量已暂存到本地')
    await flush()
    expect(vm.draftState.broadcastDirtyIds).toEqual(['600'])

    // now drawer-add a NEW task; POST returns 73900, and the canonical backfill
    // GET returns shape-B for BOTH rows (existing staged row keeps server volume
    // 50, new row canonical).
    addBroadcastImmediate.mockResolvedValue({ task_id: '73900' })
    fetchBroadcasts.mockResolvedValueOnce({
      broadcasts: [
        serverRow,
        { id: '73900', taskid: '73900', name: '新铃声', status: '停止', volume: 60, audio: '默认.mp3', durationMode: 'loop', loop: 1, location: [['zone-1', 'T1']], terminalids: ['9'], terminalnames: ['T1'], liveterminalid: '', liveterminalname: '', time: '08:00', starttime: '08:00', startdate: '2026-01-01', enddate: '2039-12-31' }
      ]
    })
    const draft = { customName: '新铃声', audio: '默认.mp3', mediaid: '101', time: '08:00:00', durationMode: 'loop', loop: 1, weekdays: ['周一'], location: [['zone-1', 'T1']], volume: 60 }
    await vm.saveBroadcastTaskDrawer({ draft, isNew: true })
    await flush()

    // THE load-bearing assertion (KP #22 r2): the user's batch volume staging on
    // row '600' is NOT swallowed — it survives the add + canonical backfill.
    expect(vm.draftState.broadcastDirtyIds).toContain('600')
    expect(hasSchedulerDirtyScope('broadcasts', vm.draftState)).toBe(true)
    // The staged volume value itself is intact (90, the user's unsaved edit).
    const stagedDraftRow = (vm.draftState.broadcasts || []).find((r) => String(r.id) === '600')
    expect(stagedDraftRow && stagedDraftRow.volume).toBe(90)
    vm.$destroy()
  })

  it('with NO other staging, a drawer add backfills canonical and leaves the draft clean', async() => {
    const vm = makeE2eVm()
    const serverRow = vm.__stagedRowServer
    fetchBroadcasts.mockResolvedValueOnce({ broadcasts: [serverRow] })
    vm.broadcastsLoaded = false
    await vm.loadBroadcasts()
    await flush()
    expect(hasSchedulerDirtyScope('broadcasts', vm.draftState)).toBe(false)

    // drawer add with no pre-existing staging — guard clears, backfill canonical.
    addBroadcastImmediate.mockResolvedValue({ task_id: '73900' })
    fetchBroadcasts.mockResolvedValueOnce({
      broadcasts: [
        serverRow,
        { id: '73900', taskid: '73900', name: '新铃声', status: '停止', volume: 60, audio: '默认.mp3', durationMode: 'loop', loop: 1, location: [['zone-1', 'T1']], terminalids: ['9'], terminalnames: ['T1'], liveterminalid: '', liveterminalname: '', time: '08:00', starttime: '08:00', startdate: '2026-01-01', enddate: '2039-12-31' }
      ]
    })
    const draft = { customName: '新铃声', audio: '默认.mp3', mediaid: '101', time: '08:00:00', durationMode: 'loop', loop: 1, weekdays: ['周一'], location: [['zone-1', 'T1']], volume: 60 }
    await vm.saveBroadcastTaskDrawer({ draft, isNew: true })
    await flush()

    // clean: no phantom dirty after the canonical backfill
    expect(vm.draftState.broadcastDirtyIds || []).toEqual([])
    expect(hasSchedulerDirtyScope('broadcasts', vm.draftState)).toBe(false)
    vm.$destroy()
  })
})

describe('T13 prepareBroadcastRows keeps the backend-decoded weekdays', () => {
  // PO G3 bug: click weekday cells → 完成 → backend saves (execmode written by
  // T61) → finish clears the off-row draft + backfillBroadcastsFromRemote
  // reloads. The reloaded canonical broadcast row carries weekdays (api_public
  // _normalize_view_task decodes execmode → weekdays). But prepareBroadcastRows
  // rebuilt the row from a whitelist that DROPPED weekdays, so row.weekdays went
  // empty → the grid (broadcastDraftWeekdays(row)) showed all-dark even though
  // the save landed. The fix keeps weekdays in the whitelist.
  it('preserves the decoded weekdays array onto the prepared row', () => {
    const [prepared] = prepare([shapeB({ status: '停止', weekdays: ['周一', '周二', '周三'] })])
    expect(prepared.weekdays).toEqual(['周一', '周二', '周三'])
  })

  it('normalizes weekday order (out-of-order input → weekday order)', () => {
    const [prepared] = prepare([shapeB({ status: '停止', weekdays: ['周三', '周一', '周五'] })])
    expect(prepared.weekdays).toEqual(['周一', '周三', '周五'])
  })

  it('reverse-truth: a row with NO weekdays prepares to an empty array (grid dark — manual play)', () => {
    const [prepared] = prepare([shapeB({ status: '停止', weekdays: [] })])
    expect(prepared.weekdays).toEqual([])
  })

  // The grid reads broadcastDraftWeekdays(row) which (no draft) returns the
  // prepared row's weekdays — so a prepared row with weekdays lights the cells.
  it('the grid overlay sees the preserved weekdays (cells would be active)', () => {
    const [prepared] = prepare([shapeB({ status: '停止', weekdays: ['周一', '周二'] })])
    const ctx = { broadcastRowDrafts: {}, broadcastRowDraftKey: methods.broadcastRowDraftKey, broadcastRowDraftEntry: methods.broadcastRowDraftEntry, broadcastDraftValue: methods.broadcastDraftValue }
    const overlay = methods.broadcastDraftWeekdays.call(ctx, prepared)
    expect(overlay).toEqual(['周一', '周二'])
  })
})
