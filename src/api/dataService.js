import axios from 'axios'
import { getToken } from '@/utils/auth'

const api = axios.create({
  baseURL: process.env.VUE_APP_BASE_API || '',
  timeout: 30000
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers['X-Token'] = token
  }
  return config
})

export async function fetchAllAudio() {
  const { data } = await api.get('/data/all_audio')
  return data
}

export async function fetchAllLoc() {
  const { data } = await api.get('/data/all_loc')
  return data
}

export async function fetchAllTask() {
  const { data } = await api.get('/data/all_task')
  return data
}

export async function fetchBroadcastSchedules() {
  const { data } = await api.get('/data/broadcast_schedules')
  return data
}

export async function fetchBroadcastSchedulesSummary() {
  const { data } = await api.get('/data/broadcast_schedules', { params: { light: 1 }})
  return data
}

export async function fetchBroadcasts() {
  const { data } = await api.get('/data/broadcast_schedules/broadcasts')
  return data
}

export async function fetchLivecasts() {
  const { data } = await api.get('/data/broadcast_schedules/livecasts')
  return data
}

export async function fetchRuntimePlayTasks(force = false) {
  const params = force ? { force: true } : undefined
  const { data } = await api.get('/data/runtime_play_tasks', { params })
  return data
}

export async function stopRuntimePlayTasks(taskIds) {
  const normalized = Array.isArray(taskIds) ? taskIds : [taskIds]
  const payload = {
    task_ids: normalized.map((item) => String(item || '').trim()).filter(Boolean)
  }
  const { data } = await api.post('/data/runtime_play_tasks/stop', payload)
  return data
}

export async function setTaskStatus(payload) {
  const { data } = await api.post('/data/task_state', payload)
  return data
}

export async function setScheduleStatus(payload) {
  const { data } = await api.post('/data/schedule_state', payload, { timeout: 120000 })
  return data
}

export async function fetchScheduleTasks(scheduleName) {
  const { data } = await api.get(`/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}/tasks`)
  return data
}

export async function fetchTaskOverrides() {
  const { data } = await api.get('/data/task_overrides')
  return data
}

export async function updateOnceOverrideTask(overrideId, onceTaskId, payload) {
  const { data } = await api.put(
    `/data/task_overrides/once/${encodeURIComponent(overrideId)}/tasks/${encodeURIComponent(onceTaskId)}`,
    payload,
    { timeout: 120000 }
  )
  return data
}

export async function deleteOnceOverrideTask(overrideId, onceTaskId) {
  const { data } = await api.delete(
    `/data/task_overrides/once/${encodeURIComponent(overrideId)}/tasks/${encodeURIComponent(onceTaskId)}`,
    { timeout: 120000 }
  )
  return data
}

export async function undoOnceOverride(overrideId) {
  const { data } = await api.post(
    `/data/task_overrides/once/${encodeURIComponent(overrideId)}/undo`,
    {},
    { timeout: 120000 }
  )
  return data
}

export async function fetchCalendarHolidays(year) {
  const { data } = await api.get('/data/calendar_holidays', { params: { year }})
  return data
}

export async function updateBroadcastSchedules(payload) {
  const { data } = await api.put('/data/broadcast_schedules', payload, { timeout: 120000 })
  return data
}

export async function createScheduleEntry(payload) {
  const { data } = await api.post('/data/broadcast_schedules/schedules', payload, { timeout: 120000 })
  return data
}

export async function updateScheduleEntry(scheduleName, payload) {
  const { data } = await api.put(
    `/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}`,
    payload,
    { timeout: 120000 }
  )
  return data
}

export async function deleteScheduleEntry(scheduleName) {
  const { data } = await api.delete(
    `/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}`,
    { timeout: 120000 }
  )
  return data
}

export async function updateSingleTask(scheduleName, taskId, payload) {
  const { data } = await api.put(
    `/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}/tasks/${encodeURIComponent(taskId)}`,
    payload,
    { timeout: 60000 }
  )
  return data
}

export async function deleteSingleTask(scheduleName, taskId) {
  const { data } = await api.delete(
    `/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}/tasks/${encodeURIComponent(taskId)}`,
    { timeout: 60000 }
  )
  return data
}

// T36 Phase 2 M1: clicking "添加" on the broadcasts tab fires the full
// remote create saga immediately (POST /task/taskinfo + replace taskmusic
// + replace taskterminals) so the new row lands on the remote with a real
// numeric taskid before the UI ever shows it. Kills the taskid:0
// empty-shell window (KNOWN_PITFALLS #18 / T34 closure).
export async function addBroadcastImmediate(payload) {
  const { data } = await api.post('/data/broadcasts', payload, { timeout: 30000 })
  return data
}

// T37 redesign: broadcast drawer "完成编辑" PUTs here with
// { row, dirty_fields }. The FE strips id columns (mediaid /
// terminalids / liveterminalid / taskterminal) before sending so the
// backend's resolve_media_id / resolve_terminal_ids re-derive from
// name + location (fail-loud guardrail on multi/empty resolves). See
// saveBroadcastTaskDrawer in task-scheduler/index.vue.
export async function commitBroadcastFields(taskId, payload) {
  const { data } = await api.put(
    `/data/broadcasts/${encodeURIComponent(taskId)}/fields`,
    payload,
    { timeout: 30000 }
  )
  return data
}

// T36 Phase 2 batch A.1: row "删除" + toolbar bulk "删除" pipe here so a
// broadcast delete lands on the remote with a single DELETE /task/taskinfo
// call — no whole-tab full-PUT, no diff against snapshot. Wraps the same
// remote_delete_taskinfo leaf the bulk save (_sync_remote_taskinfo) uses
// to retire broadcasts. Bulk delete fans out as a per-row Promise.all on
// the FE; each call shares the same 60s TTL media/terminal maps so a
// 5-row delete still only touches the remote 5× total.
export async function deleteBroadcastImmediate(taskId) {
  const { data } = await api.delete(
    `/data/broadcasts/${encodeURIComponent(taskId)}`,
    { timeout: 30000 }
  )
  return data
}

export async function updateAllTask(payload, scope) {
  const params = scope ? { scope } : undefined
  const { data } = await api.put('/data/all_task', payload, { params, timeout: 120000 })
  return data
}

export async function reloadAssets() {
  const { data } = await api.post('/admin/reload')
  return data
}

export async function fetchTerminalInfo() {
  const { data } = await api.get('/terminal/terminalinfo')
  return data
}

export async function fetchTerminalZones() {
  const { data } = await api.get('/terminal/terzone')
  return data
}

export async function fetchTerminalsByZone(zoneId) {
  const { data } = await api.get(`/terminal/zoneterminal/${encodeURIComponent(zoneId)}`)
  return data
}

export async function fetchAllTerminalData(force = false) {
  const params = force ? { force: true } : {}
  const { data } = await api.get('/terminal/alldata', { params })
  return data
}

export async function setTerminalVolume(payload) {
  const { data } = await api.post('/setvolume', payload)
  return data
}

export async function moveTerminalZone(payload) {
  const { data } = await api.post('/terminal/move', payload)
  return data
}
