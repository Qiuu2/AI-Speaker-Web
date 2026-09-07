<template>
  <div class="task-management-page">
    <div class="page-header">
      <div class="page-header-copy">
        <h2>每日任务</h2>
        <p>按时间线查看广播任务，快速识别进行中、待执行与冲突任务。</p>
      </div>
    </div>

    <div class="date-focus card">
      <div class="date-focus-content">
        <span class="date-focus-caption">当前查看日期</span>
        <div class="date-focus-title">
          <span class="date-focus-month">{{ Number(currentDateKey.slice(5, 7)) }}月</span>
          <span class="date-focus-day">{{ Number(currentDateKey.slice(8, 10)) }}</span>
          <span class="date-focus-unit">日</span>
          <el-button
            v-if="!isTodaySelected"
            size="mini"
            plain
            round
            class="date-focus-back"
            @click="goToday"
          >
            回到今天
          </el-button>
        </div>
        <p class="date-focus-subtitle">{{ dateFocusSummary }}</p>
        <div v-if="selectedHoliday" class="date-focus-holiday">
          <span class="date-focus-holiday-name">{{ selectedHoliday.name }}</span>
          <span
            class="date-focus-holiday-tag"
            :class="
              selectedHoliday.type === 'makeup_workday'
                ? 'is-workday'
                : selectedHoliday.type === 'weekend'
                  ? 'is-weekend'
                  : 'is-holiday'
            "
          >
            {{ selectedHolidayBadge }}
          </span>
        </div>
      </div>

      <div class="date-focus-actions">
        <el-date-picker
          ref="holidayDatePicker"
          v-model="selectedDate"
          type="date"
          value-format="yyyy-MM-dd"
          placeholder="选择日期"
          size="small"
          :clearable="false"
          :picker-options="holidayPickerOptions"
          popper-class="task-management-holiday-picker"
          @change="handleDateChange"
          @visible-change="handleHolidayPickerVisibleChange"
        />
        <el-button
          v-if="selectedDateOnceSummary.count"
          size="small"
          plain
          icon="el-icon-date"
          @click="openSelectedDateOncePanel"
        >
          本日临时变更 {{ selectedDateOnceSummary.count }} 条
        </el-button>
        <el-button size="small" :loading="loading" @click="refreshNow">刷新</el-button>
      </div>
    </div>

    <div class="stats-grid">
      <button
        type="button"
        class="stat-card total"
        :class="{ active: activeFilter === 'all' }"
        @click="setActiveFilter('all')"
      >
        <p>今日任务</p>
        <strong>{{ stats.total }}</strong>
      </button>
      <button
        type="button"
        class="stat-card running"
        :class="{ active: activeFilter === 'running' }"
        @click="setActiveFilter('running')"
      >
        <p>进行中</p>
        <strong>{{ stats.running }}</strong>
      </button>
      <button
        type="button"
        class="stat-card pending"
        :class="{ active: activeFilter === 'queued' }"
        @click="setActiveFilter('queued')"
      >
        <p>待执行</p>
        <strong>{{ stats.queued }}</strong>
      </button>
      <button
        type="button"
        class="stat-card warning"
        :class="{ active: activeFilter === 'issue' }"
        @click="setActiveFilter('issue')"
      >
        <p>异常 / 冲突</p>
        <strong>{{ stats.issue }}</strong>
      </button>
    </div>

    <div v-loading="loading || saving" class="timeline-card card">
      <div class="card-header">
        <div class="card-title">时间线</div>
        <div v-if="filteredTasks.length" class="bulk-toolbar">
          <el-checkbox :value="allVisibleSelected" @change="toggleSelectAll">全选可见任务</el-checkbox>
          <span v-if="selectedTasks.length" class="bulk-count">已选 {{ selectedTasks.length }} 项</span>
          <template v-if="selectedTasks.length">
            <el-button size="mini" @click="applyBulkDisable">批量禁用</el-button>
            <el-button size="mini" type="danger" @click="applyBulkDelete">批量删除</el-button>
            <el-input-number v-model="bulkVolume" :min="0" :max="100" size="mini" class="bulk-volume" />
            <el-button size="mini" type="primary" @click="applyBulkVolume">批量改音量</el-button>
          </template>
        </div>
      </div>

      <div class="day-timeline">
        <div class="day-timeline-head">
          <span class="day-timeline-title">日内时间轴</span>
          <span class="day-timeline-count">{{ filteredTasks.length }} 个可见任务</span>
        </div>
        <div class="day-timeline-track">
          <div
            v-for="tick in timelineTicks"
            :key="`timeline-tick-${tick}`"
            class="day-timeline-tick"
            :style="{ left: `${(tick / 24) * 100}%` }"
          />
          <el-tooltip
            v-for="task in filteredTasks"
            :key="`timeline-${task.id}`"
            :content="timelineTooltip(task)"
            placement="top"
          >
            <div class="day-timeline-block" :style="timelineBlockStyle(task)" />
          </el-tooltip>
          <div v-if="currentTimeMarker" class="day-timeline-now" :style="{ left: currentTimeMarker.left }">
            <span class="day-timeline-now-label">{{ currentTimeMarker.label }}</span>
          </div>
        </div>
        <div class="day-timeline-scale">
          <span v-for="label in timelineScaleLabels" :key="label">{{ label }}</span>
        </div>
        <p v-if="!isTodaySelected" class="day-timeline-note">当前查看的不是今天，已隐藏当前时间线。</p>
      </div>

      <div v-if="taskBlocks.length" class="timeline-list">
        <div
          v-for="block in taskBlocks"
          :key="block.id"
          class="task-block"
          :class="{ 'conflict-group': block.type === 'conflict' }"
        >
          <div v-if="block.type === 'conflict'" class="conflict-group-header">
            <div class="group-title">
              <i class="el-icon-warning-outline" />
              <span>{{ block.timeLabel }} 任务冲突 (共 {{ block.tasks.length }} 项)</span>
            </div>
            <div class="group-actions">
              <span class="group-schedules">{{ block.scheduleNames.join(' / ') }}</span>
              <el-button size="mini" type="danger" plain @click="openResolveDialog(block)">处理冲突</el-button>
            </div>
          </div>

          <div class="group-body">
            <div
              v-for="task in block.tasks"
              :key="task.id"
              class="timeline-item"
              :class="[
                task.itemClass,
                {
                  conflict: task.conflict,
                  'group-start': task.groupPosition === 'start',
                  'group-middle': task.groupPosition === 'middle',
                  'group-end': task.groupPosition === 'end',
                  'is-editing': editingTaskId === task.id
                }
              ]"
            >
              <div class="left-block">
                <el-checkbox
                  :value="isTaskSelected(task.id)"
                  :disabled="isTaskReadonly(task)"
                  @change="toggleTaskSelection(task, $event)"
                />
                <button type="button" class="expand-btn" @click="toggleExpand(task.id)">
                  <i :class="isExpanded(task.id) ? 'el-icon-arrow-down' : 'el-icon-arrow-right'" />
                </button>
                <div class="time-block">
                  <div class="time">{{ task.time }}</div>
                  <div class="duration">{{ taskDurationText(task) }}</div>
                  <span v-if="task.badge" :class="['time-tag', task.badgeType]">{{ task.badge }}</span>
                  <span v-if="task.isOnceEphemeral" class="time-tag badge-once">一次性</span>
                </div>
              </div>

              <div class="content-block">
                <div class="title-row">
                  <template v-if="editingTaskId === task.id">
                    <div class="inline-edit-fields">
                      <el-input v-model="editDraft.displayName" size="mini" class="inline-name-input" placeholder="任务名称" />
                      <el-input v-model="editDraft.sourceName" size="mini" class="inline-source-input" placeholder="音频源" />
                    </div>
                  </template>
                  <template v-else>
                    <span class="task-title">{{ task.displayName }}</span>
                  </template>
                </div>

                <div class="meta">
                  <span v-if="task.broadcastSource">来源：文件广播</span>
                  <span v-else>作息方案：{{ task.scheduleName }}</span>
                  <span>播放区域：{{ task.area }}</span>
                  <span>音频源：{{ task.sourceName || '—' }}</span>
                </div>

                <div v-if="task.note" class="note">
                  {{ task.note }}
                </div>

                <div v-if="editingTaskId === task.id" class="inline-editor">
                  <el-time-picker
                    v-model="editDraft.time"
                    size="mini"
                    value-format="HH:mm:ss"
                    format="HH:mm:ss"
                    placeholder="播放时间"
                  />
                  <el-input-number v-model="editDraft.volume" :min="0" :max="100" size="mini" />
                  <el-button size="mini" type="primary" @click="saveInlineEdit(task)">保存</el-button>
                  <el-button size="mini" @click="cancelInlineEdit">取消</el-button>
                </div>

                <div v-if="isExpanded(task.id)" class="detail-panel">
                  <span>音量：{{ taskVolumeText(task) }}</span>
                  <span>优先级：{{ task.priority }}</span>
                  <span>播放策略：{{ task.playModeLabel }}</span>
                  <span>启用状态：{{ task.enabled ? '启用' : '停用' }}</span>
                </div>
              </div>

              <div class="action-block">
                <div class="status-row">
                  <el-tag :type="tagType(task.status)" size="mini">{{ statusLabel(task.status) }}</el-tag>
                  <el-button
                    v-if="task.conflict"
                    type="text"
                    class="conflict-link"
                    @click="openConflictDrawer(task)"
                  >冲突详情</el-button>
                </div>

                <div v-if="!isTaskReadonly(task)" class="hover-actions">
                  <el-tooltip :content="task.enabled ? '禁用任务' : '启用任务'" placement="top">
                    <el-button
                      size="mini"
                      type="text"
                      :icon="task.enabled ? 'el-icon-video-pause' : 'el-icon-video-play'"
                      @click="toggleTaskEnabled(task)"
                    />
                  </el-tooltip>
                  <el-tooltip content="快捷编辑" placement="top">
                    <el-button size="mini" type="text" icon="el-icon-edit" @click="startInlineEdit(task)" />
                  </el-tooltip>
                  <el-tooltip content="删除任务" placement="top">
                    <el-button size="mini" type="text" icon="el-icon-delete" @click="deleteTask(task)" />
                  </el-tooltip>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else description="当日暂无任务" />
    </div>

    <el-drawer
      title="冲突处理"
      :visible.sync="conflictDrawer.visible"
      direction="rtl"
      size="420px"
      :with-header="true"
      :before-close="closeConflictDrawer"
    >
      <div v-if="drawerTask" class="conflict-drawer">
        <p class="drawer-text">{{ drawerConflictMessage }}</p>
        <p class="drawer-highlight">{{ drawerTask.scheduleName }} / {{ drawerTask.displayName }} / {{ drawerTask.time }}</p>

        <div v-if="drawerPeers.length" class="drawer-section">
          <p class="drawer-label">冲突任务（可快速处理）</p>
          <el-select v-model="conflictDrawer.peerTaskId" size="small" placeholder="选择冲突任务">
            <el-option
              v-for="item in drawerPeers"
              :key="item.id"
              :label="`${item.scheduleName} / ${item.displayName} / ${item.time}`"
              :value="item.id"
            />
          </el-select>
          <p v-if="drawerPeerTask" class="drawer-peer-hint">
            当前冲突方：{{ drawerPeerTask.scheduleName }} / {{ drawerPeerTask.displayName }} / {{ drawerPeerTask.time }}
          </p>
        </div>

        <div class="drawer-actions">
          <el-button type="warning" plain @click="disableCurrentInDrawer">{{ currentDisableActionText }}</el-button>
          <el-button
            type="warning"
            plain
            :disabled="!drawerPeerTask"
            @click="disablePeerInDrawer"
          >{{ peerDisableActionText }}</el-button>
        </div>

        <div class="drawer-section">
          <p class="drawer-label">修改播放时间</p>
          <el-time-picker
            v-model="conflictDrawer.newTime"
            size="small"
            value-format="HH:mm:ss"
            format="HH:mm:ss"
            placeholder="选择新时间"
          />
          <el-button type="primary" size="small" @click="applyDrawerTimeChange">保存时间</el-button>
        </div>

        <div class="drawer-section">
          <p class="drawer-label">优先级处理</p>
          <el-button type="primary" plain size="small" @click="applyDrawerPriority">强制优先 {{ drawerTask.scheduleName }}</el-button>
        </div>
      </div>
      <el-empty v-else description="未选择冲突任务" />
    </el-drawer>

    <el-dialog
      title="处理冲突"
      :visible.sync="resolveDialog.visible"
      width="560px"
      :close-on-click-modal="false"
      @close="closeResolveDialog"
    >
      <div class="resolve-dialog-body">
        <p v-if="resolveTasks.length" class="resolve-summary">
          检测到 {{ resolveTasks[0].time }} 时间冲突，共 {{ resolveTasks.length }} 项。
        </p>
        <el-radio-group v-model="resolveDialog.choice" class="resolve-options">
          <el-radio
            v-for="option in resolveChoices"
            :key="option.value"
            :label="option.value"
            class="resolve-option"
          >{{ option.label }}</el-radio>
        </el-radio-group>

        <div v-if="resolveDialog.choice === 'reschedule'" class="resolve-reschedule">
          <el-select
            v-model="resolveDialog.rescheduleTaskId"
            size="small"
            placeholder="选择要改时间的任务"
            class="resolve-select"
          >
            <el-option
              v-for="task in resolveTasks"
              :key="task.id"
              :label="`${task.scheduleName} / ${task.displayName} / ${task.time}`"
              :value="task.id"
            />
          </el-select>
          <el-time-picker
            v-model="resolveDialog.newTime"
            size="small"
            value-format="HH:mm:ss"
            format="HH:mm:ss"
            placeholder="选择新时间"
          />
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button size="small" @click="closeResolveDialog">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="applyResolveDialog">执行</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {
  fetchBroadcastSchedules,
  fetchBroadcasts,
  fetchCalendarHolidays,
  fetchTaskOverrides,
  updateScheduleEntry
} from '@/api/dataService'
import { offAssistantRefresh, onAssistantRefresh } from '@/utils/assistantRefreshBus'
import { buildOnceDisplaySnapshot, summarizeOnceSpecs } from '@/utils/onceTaskSpecs'

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'
const SHANGHAI_PARTS_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hour12: false
})

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getShanghaiDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const mapped = {}
  SHANGHAI_PARTS_FORMATTER.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      mapped[part.type] = part.value
    }
  })
  return {
    year: mapped.year || '1970',
    month: mapped.month || '01',
    day: mapped.day || '01',
    hour: mapped.hour || '00',
    minute: mapped.minute || '00',
    second: mapped.second || '00',
    weekdayLabel: mapped.weekday || '周一'
  }
}

function getShanghaiDateKey(value = new Date()) {
  const parts = getShanghaiDateParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export default {
  name: 'TaskManagement',
  data() {
    return {
      selectedDate: getShanghaiDateKey(),
      schedules: [],
      scheduleVersion: '1.0',
      // T60 阶段1: periodic file-broadcasts merged into the daily timeline.
      // Read-only display — this view NEVER touches broadcast draft state (KP#22).
      broadcasts: [],
      overrides: [],
      holidayDaysByYear: {},
      holidayLoadingYears: {},
      holidayPickerObserver: null,
      holidayPickerDecorateTimer: null,
      holidayPickerVisible: false,
      nowTick: Date.now(),
      nowTimerId: null,
      loading: false,
      saving: false,
      activeFilter: 'all',
      selectedTaskIds: [],
      expandedTaskIds: [],
      editingTaskId: '',
      editDraft: {
        displayName: '',
        sourceName: '',
        time: '00:00:00',
        volume: 50
      },
      bulkVolume: 50,
      conflictDrawer: {
        visible: false,
        taskId: '',
        peerTaskId: '',
        newTime: '00:00:00'
      },
      resolveDialog: {
        visible: false,
        groupId: '',
        taskIds: [],
        choice: '',
        rescheduleTaskId: '',
        newTime: '00:00:00'
      }
    }
  },
  computed: {
    selectedDateObject() {
      return this.dateKeyToDate(this.currentDateKey)
    },
    currentDateKey() {
      return this.normalizeDateKey(this.selectedDate)
    },
    selectedYear() {
      return this.currentDateKey.slice(0, 4)
    },
    focusMonthLabel() {
      return `${this.selectedDateObject.getMonth() + 1}月`
    },
    focusDayNumber() {
      return `${Number(this.currentDateKey.slice(8, 10))}`
    },
    currentWeekdayLabel() {
      return this.weekdayLabelShanghai(this.currentDateKey)
    },
    isTodaySelected() {
      return this.currentDateKey === getShanghaiDateKey()
    },
    selectedHoliday() {
      const holiday = this.getHolidayByDateKey(this.currentDateKey)
      if (holiday) return holiday
      if (this.isWeekendDateKey(this.currentDateKey)) {
        return {
          name: '周末',
          type: 'weekend',
          isWorkday: false
        }
      }
      return null
    },
    selectedHolidayBadge() {
      if (!this.selectedHoliday) return ''
      if (this.selectedHoliday.type === 'makeup_workday') return '调休上班'
      if (this.selectedHoliday.type === 'weekend') return '周末'
      return '放假'
    },
    selectedDateOnceSummary() {
      return summarizeOnceSpecs(this.overrides, { date: this.currentDateKey })
    },
    dateFocusSummary() {
      return this.stats.total
        ? `${this.currentWeekdayLabel} · 共 ${this.stats.total} 条任务`
        : `${this.currentWeekdayLabel} · 当前暂无任务`
    },
    timelineTicks() {
      return Array.from({ length: 25 }, (_, index) => index)
    },
    timelineScaleLabels() {
      return ['00:00', '06:00', '12:00', '18:00', '24:00']
    },
    currentTimeMarker() {
      if (!this.isTodaySelected) return null
      const nowParts = getShanghaiDateParts(this.nowTick)
      const seconds = (Number(nowParts.hour) * 3600) + (Number(nowParts.minute) * 60) + Number(nowParts.second)
      return {
        left: `${(seconds / 86400) * 100}%`,
        label: `${nowParts.hour}:${nowParts.minute}`
      }
    },
    holidayPickerOptions() {
      return {
        cellClassName: this.holidayDateCellClassName
      }
    },
    tasksForDay() {
      const list = this.buildTasksForDate(this.currentDateKey)
      const withConflict = this.decorateConflictMeta(list)
      const withStatus = withConflict.map((task) => this.applyTaskDisplayState(task))
      return withStatus.sort((a, b) => this.timeToSeconds(a.time) - this.timeToSeconds(b.time))
    },
    filteredTasks() {
      const list = this.tasksForDay
      if (this.activeFilter === 'running') {
        return list.filter((task) => task.status === 'playing')
      }
      if (this.activeFilter === 'queued') {
        return list.filter((task) => task.status === 'queued')
      }
      if (this.activeFilter === 'issue') {
        return list.filter((task) => task.status === 'issue')
      }
      return list
    },
    taskBlocks() {
      const blocks = []
      const conflictMap = new Map()
      this.filteredTasks.forEach((task) => {
        const hasGroup = Boolean(task.conflict && task.conflictGroupId)
        if (!hasGroup) {
          blocks.push({
            id: `single-${task.id}`,
            type: 'single',
            conflict: false,
            timeLabel: task.time,
            scheduleNames: [task.scheduleName].filter(Boolean),
            tasks: [task]
          })
          return
        }
        let block = conflictMap.get(task.conflictGroupId)
        if (!block) {
          block = {
            id: task.conflictGroupId,
            type: 'conflict',
            conflict: true,
            timeLabel: task.time,
            scheduleNames: [],
            tasks: []
          }
          conflictMap.set(task.conflictGroupId, block)
          blocks.push(block)
        }
        block.tasks.push(task)
        if (!block.timeLabel || this.timeToSeconds(task.time) < this.timeToSeconds(block.timeLabel)) {
          block.timeLabel = task.time
        }
        block.scheduleNames = Array.from(new Set([...block.scheduleNames, task.scheduleName].filter(Boolean)))
      })
      return blocks
    },
    stats() {
      const total = this.tasksForDay.length
      const running = this.tasksForDay.filter((task) => task.status === 'playing').length
      const queued = this.tasksForDay.filter((task) => task.status === 'queued').length
      const issue = this.tasksForDay.filter((task) => task.status === 'issue').length
      return { total, running, queued, issue }
    },
    selectedTasks() {
      const selectedSet = new Set(this.selectedTaskIds)
      return this.tasksForDay.filter((task) => selectedSet.has(task.id) && !this.isTaskReadonly(task))
    },
    allVisibleSelected() {
      const selectableTasks = this.filteredTasks.filter((task) => !this.isTaskReadonly(task))
      if (!selectableTasks.length) return false
      const selectedSet = new Set(this.selectedTaskIds)
      return selectableTasks.every((task) => selectedSet.has(task.id))
    },
    drawerTask() {
      return this.tasksForDay.find((task) => task.id === this.conflictDrawer.taskId) || null
    },
    drawerPeers() {
      if (!this.drawerTask || !Array.isArray(this.drawerTask.conflictPeerIds)) return []
      const peerSet = new Set(this.drawerTask.conflictPeerIds)
      return this.tasksForDay.filter((task) => peerSet.has(task.id))
    },
    drawerPeerTask() {
      if (!this.conflictDrawer.peerTaskId) return null
      return this.drawerPeers.find((task) => task.id === this.conflictDrawer.peerTaskId) || null
    },
    drawerConflictMessage() {
      if (!this.drawerTask) return '系统检测到任务冲突'
      const names = [this.drawerTask, ...this.drawerPeers].map((task) => task.scheduleName).filter(Boolean)
      const unique = Array.from(new Set(names))
      if (!unique.length) return '系统检测到任务冲突'
      if (unique.length === 1) return `系统检测到 [${unique[0]}] 内任务时间重叠`
      if (unique.length === 2) return `系统检测到 [${unique[0]}] 与 [${unique[1]}] 时间重叠`
      return `系统检测到 [${unique[0]}]、[${unique[1]}] 等 ${unique.length} 个方案时间重叠`
    },
    currentDisableActionText() {
      if (!this.drawerTask) return '停用当前任务'
      return `停用 [${this.drawerTask.scheduleName}] 的此任务`
    },
    peerDisableActionText() {
      if (!this.drawerPeerTask) return '停用冲突任务'
      return `停用 [${this.drawerPeerTask.scheduleName}] 的此任务`
    },
    resolveTasks() {
      if (!Array.isArray(this.resolveDialog.taskIds) || !this.resolveDialog.taskIds.length) return []
      const map = new Map(this.tasksForDay.map((task) => [task.id, task]))
      return this.resolveDialog.taskIds.map((id) => map.get(id)).filter((task) => task)
    },
    resolveChoices() {
      if (this.resolveTasks.length < 2) return []
      if (this.resolveTasks.length === 2) {
        const first = this.resolveTasks[0]
        const second = this.resolveTasks[1]
        return [
          {
            value: `disable:${second.id}`,
            label: `停用【${second.scheduleName}】任务，保留【${first.scheduleName}】`
          },
          {
            value: `disable:${first.id}`,
            label: `停用【${first.scheduleName}】任务，保留【${second.scheduleName}】`
          },
          {
            value: 'reschedule',
            label: '重新设置其中一个的播放时间'
          }
        ]
      }
      const disableOptions = this.resolveTasks.map((task) => ({
        value: `disable:${task.id}`,
        label: `停用【${task.scheduleName}】任务，保留其他冲突项`
      }))
      disableOptions.push({
        value: 'reschedule',
        label: '重新设置其中一个的播放时间'
      })
      return disableOptions
    },
    resolveRescheduleTarget() {
      if (!this.resolveDialog.rescheduleTaskId) return null
      return this.resolveTasks.find((task) => task.id === this.resolveDialog.rescheduleTaskId) || null
    }
  },
  created() {
    this.loadData()
    this.ensureHolidayYearLoaded(this.selectedYear)
    this.startNowTicker()
    onAssistantRefresh(this.handleAssistantRefresh)
  },
  beforeDestroy() {
    this.stopNowTicker()
    this.teardownHolidayPickerEnhancements()
    offAssistantRefresh(this.handleAssistantRefresh)
  },
  methods: {
    normalizeDateKey(value) {
      const text = String(value || '').trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
      if (text) {
        const parsed = new Date(text)
        if (!Number.isNaN(parsed.getTime())) {
          return getShanghaiDateKey(parsed)
        }
      }
      return getShanghaiDateKey()
    },
    dateKeyToDate(dateKey) {
      return new Date(`${this.normalizeDateKey(dateKey)}T12:00:00+08:00`)
    },
    startNowTicker() {
      this.stopNowTicker()
      this.nowTick = Date.now()
      this.nowTimerId = setInterval(() => {
        this.nowTick = Date.now()
      }, 30000)
    },
    stopNowTicker() {
      if (this.nowTimerId) {
        clearInterval(this.nowTimerId)
        this.nowTimerId = null
      }
    },
    async ensureHolidayYearLoaded(year) {
      const yearText = String(year || '').trim()
      if (!/^\d{4}$/.test(yearText)) return
      if (Object.prototype.hasOwnProperty.call(this.holidayDaysByYear, yearText)) return
      if (this.holidayLoadingYears[yearText]) return

      this.$set(this.holidayLoadingYears, yearText, true)
      try {
        const payload = await fetchCalendarHolidays(yearText)
        const days = payload && typeof payload.days === 'object' ? payload.days : {}
        this.$set(this.holidayDaysByYear, yearText, days)
      } catch (err) {
        this.$set(this.holidayDaysByYear, yearText, {})
      } finally {
        this.$delete(this.holidayLoadingYears, yearText)
      }
    },
    getHolidayByDateKey(dateKey) {
      const normalized = this.normalizeDate(dateKey)
      if (!normalized) return null
      const year = normalized.slice(0, 4)
      const days = this.holidayDaysByYear[year]
      if (!days || typeof days !== 'object') return null
      const holiday = days[normalized]
      return holiday && typeof holiday === 'object' ? holiday : null
    },
    isWeekendDateKey(dateKey) {
      const normalized = this.normalizeDateKey(dateKey)
      if (!normalized) return false
      const weekdayLabel = this.weekdayLabelShanghai(normalized)
      return weekdayLabel === '周六' || weekdayLabel === '周日'
    },
    getCalendarCellMeta(dateKey) {
      const normalized = this.normalizeDateKey(dateKey)
      if (!normalized) return null

      const holiday = this.getHolidayByDateKey(normalized)
      if (holiday && holiday.type === 'makeup_workday') {
        return {
          title: holiday.name || '调休上班',
          className: 'tm-workday-cell'
        }
      }

      const isWeekend = this.isWeekendDateKey(normalized)
      if (holiday) {
        return {
          title: holiday.name || '节假日',
          className: isWeekend ? 'tm-holiday-cell tm-weekend-cell' : 'tm-holiday-cell'
        }
      }

      if (isWeekend) {
        return {
          title: '周末',
          className: 'tm-weekend-cell'
        }
      }

      return null
    },
    holidayDateCellClassName(date) {
      const meta = this.getCalendarCellMeta(date)
      return meta ? meta.className : ''
    },
    handleHolidayPickerVisibleChange(visible) {
      this.holidayPickerVisible = visible === true
      if (!this.holidayPickerVisible) {
        this.teardownHolidayPickerEnhancements()
        return
      }
      this.$nextTick(() => {
        this.setupHolidayPickerEnhancements()
      })
    },
    getHolidayPickerVm() {
      return this.$refs.holidayDatePicker?.picker || null
    },
    getHolidayPickerPanelEl() {
      const pickerVm = this.getHolidayPickerVm()
      if (pickerVm?.$el) return pickerVm.$el
      return document.querySelector('.task-management-holiday-picker')
    },
    getHolidayPickerPanelDate() {
      const pickerVm = this.getHolidayPickerVm()
      const panelDate = pickerVm?.date
      return panelDate instanceof Date && !Number.isNaN(panelDate.getTime()) ? panelDate : this.selectedDateObject
    },
    holidayPickerPanelYears(panelDate = this.getHolidayPickerPanelDate()) {
      if (!(panelDate instanceof Date) || Number.isNaN(panelDate.getTime())) return []
      const years = new Set([String(panelDate.getFullYear())])
      const month = panelDate.getMonth()
      if (month === 0) years.add(String(panelDate.getFullYear() - 1))
      if (month === 11) years.add(String(panelDate.getFullYear() + 1))
      return Array.from(years)
    },
    async ensureHolidayPickerPanelYearsLoaded() {
      const years = this.holidayPickerPanelYears()
      const missingYears = years.filter((year) => !Object.prototype.hasOwnProperty.call(this.holidayDaysByYear, year))
      if (!missingYears.length) return false
      await Promise.all(missingYears.map((year) => this.ensureHolidayYearLoaded(year)))
      return true
    },
    queueHolidayPickerDecoration() {
      if (!this.holidayPickerVisible) return
      if (this.holidayPickerDecorateTimer) {
        clearTimeout(this.holidayPickerDecorateTimer)
      }
      this.holidayPickerDecorateTimer = setTimeout(() => {
        this.holidayPickerDecorateTimer = null
        this.decorateHolidayPickerCells()
      }, 0)
    },
    async setupHolidayPickerEnhancements() {
      const loaded = await this.ensureHolidayPickerPanelYearsLoaded()
      if (loaded) {
        this.refreshHolidayPickerPanel()
        await this.$nextTick()
      }
      this.decorateHolidayPickerCells()
      const panelEl = this.getHolidayPickerPanelEl()
      if (!panelEl || typeof MutationObserver === 'undefined') return
      this.teardownHolidayPickerObserver()
      this.holidayPickerObserver = new MutationObserver(() => {
        this.queueHolidayPickerDecoration()
      })
      this.holidayPickerObserver.observe(panelEl, {
        childList: true,
        subtree: true,
        characterData: true
      })
    },
    teardownHolidayPickerObserver() {
      if (this.holidayPickerObserver) {
        this.holidayPickerObserver.disconnect()
        this.holidayPickerObserver = null
      }
    },
    teardownHolidayPickerEnhancements() {
      this.teardownHolidayPickerObserver()
      if (this.holidayPickerDecorateTimer) {
        clearTimeout(this.holidayPickerDecorateTimer)
        this.holidayPickerDecorateTimer = null
      }
    },
    refreshHolidayPickerPanel() {
      const pickerVm = this.getHolidayPickerVm()
      if (pickerVm && typeof pickerVm.$forceUpdate === 'function') {
        pickerVm.$forceUpdate()
      }
    },
    resolveHolidayPickerCellDateKey(cell, panelDate = this.getHolidayPickerPanelDate()) {
      const rawText = cell?.querySelector('span')?.textContent || cell?.textContent || ''
      const day = Number(String(rawText).trim())
      if (!Number.isInteger(day) || day <= 0) return ''
      const baseDate = panelDate instanceof Date ? panelDate : this.selectedDateObject
      let year = baseDate.getFullYear()
      let month = baseDate.getMonth() + 1
      const classList = cell?.classList
      if (classList?.contains('prev-month')) {
        month -= 1
        if (month < 1) {
          month = 12
          year -= 1
        }
      } else if (classList?.contains('next-month')) {
        month += 1
        if (month > 12) {
          month = 1
          year += 1
        }
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    },
    async decorateHolidayPickerCells() {
      if (!this.holidayPickerVisible) return
      const loaded = await this.ensureHolidayPickerPanelYearsLoaded()
      if (loaded) {
        this.refreshHolidayPickerPanel()
        await this.$nextTick()
      }
      const panelEl = this.getHolidayPickerPanelEl()
      if (!panelEl) return
      const panelDate = this.getHolidayPickerPanelDate()
      const cells = panelEl.querySelectorAll('.el-date-table td')
      cells.forEach((cell) => {
        const dateKey = this.resolveHolidayPickerCellDateKey(cell, panelDate)
        const meta = this.getCalendarCellMeta(dateKey)
        if (meta) {
          cell.setAttribute('title', meta.title || '')
        } else {
          cell.removeAttribute('title')
        }
      })
    },
    timelineTooltip(task) {
      const name = task?.displayName || '未命名任务'
      const duration = Number(task?.duration || 0)
      return `${task?.time || '--:--:--'} ${name}（时长 ${duration} 秒）`
    },
    taskDisplayName(task, fallback = '未命名任务') {
      const name = String(task?.customName || task?.taskname || task?.name || '').trim()
      return name || fallback
    },
    taskSourceName(task, fallback = '') {
      const name = String(task?.audio || task?.medianame || '').trim()
      return name || fallback
    },
    timelineBlockColor(task) {
      if (task?.conflict) return '#f56c6c'
      if (task?.badgeType === 'badge-migrate-after') return '#e6a23c'
      if (task?.badgeType === 'badge-swap-after-a') return '#409eff'
      if (task?.badgeType === 'badge-swap-after-b') return '#23b26b'
      if (
        task?.badgeType === 'badge-cancel' ||
        task?.badgeType === 'badge-migrate-before' ||
        task?.badgeType === 'badge-swap-before'
      ) {
        return '#909399'
      }
      if (task?.status === 'playing') return '#409eff'
      if (task?.status === 'issue') return '#f56c6c'
      return '#67c23a'
    },
    timelineBlockStyle(task) {
      const start = clampNumber(this.timeToSeconds(task?.time), 0, 86399)
      const duration = clampNumber(Number(task?.duration || 1), 1, 86400)
      const widthPercent = (duration / 86400) * 100
      return {
        left: `${(start / 86400) * 100}%`,
        width: `max(${widthPercent.toFixed(4)}%, 6px)`,
        backgroundColor: this.timelineBlockColor(task),
        opacity: task?.enabled === false || task?.scheduleEnabled === false ? 0.55 : 0.92,
        zIndex: task?.conflict ? 2 : 1
      }
    },
    handleAssistantRefresh() {
      this.loadData(true)
    },
    async refreshNow() {
      await this.loadData()
    },
    setActiveFilter(filter) {
      this.activeFilter = filter || 'all'
    },
    goToday() {
      this.selectedDate = getShanghaiDateKey()
      this.handleDateChange()
    },
    openSelectedDateOncePanel() {
      if (!this.$router) return
      this.$router.push({
        name: 'TaskScheduler',
        query: { oncePanel: '1', date: this.currentDateKey }
      })
    },
    handleDateChange() {
      this.selectedDate = this.normalizeDateKey(this.selectedDate)
      this.selectedTaskIds = []
      this.expandedTaskIds = []
      this.editingTaskId = ''
      this.ensureHolidayYearLoaded(this.selectedYear)
    },
    async loadData(silent = false) {
      this.loading = true
      try {
        const [schedulePayload, overridesPayload, broadcastPayload] = await Promise.all([
          fetchBroadcastSchedules(),
          fetchTaskOverrides(),
          fetchBroadcasts()
        ])
        this.schedules = Array.isArray(schedulePayload?.schedules) ? schedulePayload.schedules : []
        this.scheduleVersion = schedulePayload?.version ? String(schedulePayload.version) : '1.0'
        this.overrides = Array.isArray(overridesPayload?.overrides) ? overridesPayload.overrides : []
        // Keep ONLY periodic file-broadcasts (those with a recurring footprint);
        // immediate / one-off broadcasts (execmode=0, no weekdays) are not part
        // of the daily timeline (PO澄清,T60 1b). This is a pure read — no draft.
        const allBroadcasts = Array.isArray(broadcastPayload?.broadcasts) ? broadcastPayload.broadcasts : []
        this.broadcasts = allBroadcasts.filter((b) => this.isPeriodicBroadcast(b))
        this.selectedTaskIds = []
        this.expandedTaskIds = []
        this.editingTaskId = ''
        if (!silent) {
          this.$message.success('任务数据已同步')
        }
      } catch (err) {
        this.schedules = []
        this.overrides = []
        this.broadcasts = []
        const detail = err?.response?.data?.detail
        this.$message.error(detail || '加载任务失败，请检查后端接口')
      } finally {
        this.loading = false
      }
    },
    buildTasksForDate(dateKey) {
      const baseTasks = this.buildBaseTasksForDate(dateKey)
      return this.applyOverrides(baseTasks, dateKey)
    },
    buildBaseTasksForDate(dateKey) {
      const weekdayLabel = this.weekdayLabelShanghai(dateKey)
      const tasks = []
      const schedules = Array.isArray(this.schedules) ? this.schedules : []
      schedules.forEach((schedule, scheduleIndex) => {
        const scheduleEnabled = this.isScheduleEnabled(schedule)
        if (!scheduleEnabled) return
        const list = Array.isArray(schedule?.tasks) ? schedule.tasks : []
        list.forEach((task, idx) => {
          if (!this.isTaskActiveOnDate(task, dateKey, weekdayLabel)) return
          const mapped = this.mapScheduleTask(schedule, task, idx, scheduleIndex, dateKey, scheduleEnabled)
          if (mapped) tasks.push(mapped)
        })
      })
      // T60 阶段1: periodic file-broadcasts share the same recurrence shape
      // (weekdays/execmode/startdate/enddate), so they go through the very same
      // isTaskActiveOnDate filter. They carry no schedule_name → mapBroadcastTask
      // handles the empty-scheduleName case + a 文件广播 source label.
      const broadcasts = Array.isArray(this.broadcasts) ? this.broadcasts : []
      broadcasts.forEach((broadcast, idx) => {
        if (!this.isTaskActiveOnDate(broadcast, dateKey, weekdayLabel)) return
        const mapped = this.mapBroadcastTask(broadcast, idx, dateKey)
        if (mapped) tasks.push(mapped)
      })
      return tasks
    },
    applyOverrides(baseTasks, dateKey) {
      const result = baseTasks.map((task) => ({ ...task }))
      const taskMap = new Map(result.map((task) => [this.taskKey(task.scheduleName, task.taskId), task]))
      const overrides = this.selectLatestOnceOverrides(Array.isArray(this.overrides) ? this.overrides : [])

      overrides.forEach((override) => {
        if (!override || override.mode !== 'once') return
        const scheduleName = String(override.schedule_name || '')
        if (!scheduleName) return

        if (override.action === 'cancel') {
          const taskIds = Array.isArray(override.task_ids) ? override.task_ids.map((id) => String(id)) : []
          if (!taskIds.length) return
          const oldDate = this.normalizeDate(override.time_start)
          if (!oldDate || dateKey !== oldDate) return
          taskIds.forEach((taskId) => {
            const task = taskMap.get(this.taskKey(scheduleName, taskId))
            if (!task) return
            task.badge = '已取消'
            task.badgeType = 'badge-cancel'
            task.itemClass = this.mergeClass(task.itemClass, 'accent-gray muted')
          })
          return
        }

        if (override.action === 'migrate') {
          const normalizedSpecs = this.normalizeOnceSpecs(override)
          const specTaskIds = normalizedSpecs
            .map(({ once }) => once.sourceTaskId)
            .filter((taskId) => taskId)
          const taskIds = specTaskIds.length
            ? Array.from(new Set(specTaskIds))
            : (Array.isArray(override.task_ids) ? override.task_ids.map((id) => String(id)) : [])
          if (!taskIds.length) return
          const oldDate = this.normalizeDate(override.time_start)
          const newDate = this.normalizeDate(override.new_time_start) || oldDate
          if (!oldDate) return
          const showOld = dateKey === oldDate
          const showNew = dateKey === newDate
          if (!showOld && !showNew) return

          if (showOld) {
            taskIds.forEach((taskId) => {
              const task = taskMap.get(this.taskKey(scheduleName, taskId))
              if (!task) return
              task.badge = '迁移前'
              task.badgeType = 'badge-migrate-before'
              task.itemClass = this.mergeClass(task.itemClass, 'accent-gray muted')
            })
          }
          if (showNew) {
            normalizedSpecs.forEach(({ once, specIndex }) => {
              const onceDate = this.normalizeDate(once?.onceDate)
              if (onceDate !== newDate) return
              result.push(this.buildOnceDisplayTask(override, once, `${override.id || 'override'}-${specIndex}`, {
                dateKey: newDate,
                badge: '迁移后',
                badgeType: 'badge-migrate-after',
                note: '一次性迁移任务'
              }))
            })
          }
          return
        }

        if (override.action === 'swap') {
          const normalizedSpecs = this.normalizeOnceSpecs(override)
          const sourceIds = Array.isArray(override.source_task_ids) ? override.source_task_ids.map((id) => String(id)) : []
          const targetIds = Array.isArray(override.target_task_ids) ? override.target_task_ids.map((id) => String(id)) : []
          if (!sourceIds.length || !targetIds.length) return

          const sourceDate = this.normalizeDate(override.source_time_start)
          const targetDate = this.normalizeDate(override.target_time_start)
          if (!sourceDate || !targetDate) return

          const showSource = dateKey === sourceDate
          const showTarget = dateKey === targetDate
          if (!showSource && !showTarget) return

          if (showSource) {
            sourceIds.forEach((taskId) => {
              const task = taskMap.get(this.taskKey(scheduleName, taskId))
              if (!task) return
              task.badge = '互换前'
              task.badgeType = 'badge-swap-before'
              task.itemClass = this.mergeClass(task.itemClass, 'accent-gray muted')
            })
            normalizedSpecs
              .filter(({ once }) => String(once?.onceRole || '').trim() === 'target_to_source')
              .forEach(({ once, specIndex }) => {
                const onceDate = this.normalizeDate(once?.onceDate)
                if (onceDate !== sourceDate) return
                result.push(this.buildOnceDisplayTask(override, once, `${override.id || 'override'}-source-${specIndex}`, {
                  dateKey: sourceDate,
                  badge: '互换后',
                  badgeType: 'badge-swap-after-b',
                  note: '一次性互换任务'
                }))
              })
          }

          if (showTarget) {
            targetIds.forEach((taskId) => {
              const task = taskMap.get(this.taskKey(scheduleName, taskId))
              if (!task) return
              task.badge = '互换前'
              task.badgeType = 'badge-swap-before'
              task.itemClass = this.mergeClass(task.itemClass, 'accent-gray muted')
            })
            normalizedSpecs
              .filter(({ once }) => String(once?.onceRole || '').trim() === 'source_to_target')
              .forEach(({ once, specIndex }) => {
                const onceDate = this.normalizeDate(once?.onceDate)
                if (onceDate !== targetDate) return
                result.push(this.buildOnceDisplayTask(override, once, `${override.id || 'override'}-target-${specIndex}`, {
                  dateKey: targetDate,
                  badge: '互换后',
                  badgeType: 'badge-swap-after-a',
                  note: '一次性互换任务'
                }))
              })
          }
          return
        }
      })

      return result
    },
    buildOnceDisplayTask(override, once, idx, options = {}) {
      const scheduleName = String(once?.scheduleName || override?.schedule_name || '').trim()
      const onceTaskId = String(once?.taskId || '').trim()
      const onceDate = this.normalizeDate(options.dateKey || once?.onceDate)
      return {
        id: `once-${override?.id || 'override'}-${idx}`,
        taskId: onceTaskId || `once-${idx}`,
        scheduleName,
        date: onceDate,
        time: this.toTime(once?.time) || '',
        duration: once?.hasDurationSeconds ? once.durationSeconds : '',
        displayName: String(once?.label || '').trim() || '一次性任务',
        sourceName: once?.hasMediaName ? once.mediaName : '',
        audio: once?.mediaDisplay || '',
        area: this.formatLocation(once?.location),
        source: once?.hasMediaName ? once.mediaName : '',
        status: 'queued',
        note: String(options.note || '').trim(),
        itemClass: String(options.itemClass || '').trim(),
        badge: String(options.badge || '').trim(),
        badgeType: String(options.badgeType || '').trim(),
        volume: once?.hasVolume ? once.volume : '',
        priority: 0,
        playModeLabel: String(once?.timelengthtype || '') === '2' ? '循环播放' : '按时长播放',
        enabled: true,
        scheduleEnabled: true,
        isOnceEphemeral: true,
        onceAction: String(once?.onceAction || '').trim(),
        onceDate,
        onceTaskId,
        onceRole: String(once?.onceRole || '').trim(),
        terminalids: Array.isArray(once?.terminalids) ? once.terminalids : [],
        terminalnames: Array.isArray(once?.terminalnames) ? once.terminalnames : [],
        liveterminalid: String(once?.liveterminalid || '').trim(),
        liveterminalname: String(once?.liveterminalname || '').trim(),
        location: Array.isArray(once?.location) ? once.location : [],
        conflict: false,
        conflictPeerIds: [],
        conflictGroupId: '',
        conflictGroupTitle: '',
        conflictGroupNames: [],
        groupPosition: ''
      }
    },
    normalizeOnceSpecs(override) {
      const specs = Array.isArray(override?.once_task_specs) ? override.once_task_specs : []
      return specs.map((spec, specIndex) => ({
        raw: spec,
        once: buildOnceDisplaySnapshot(spec, override),
        specIndex
      }))
    },
    isTaskReadonly(task) {
      // Periodic file-broadcasts are display-only in the daily view (T60 阶段1,
      // PO决策:no write buttons; cancel/move/swap are AI-only). They render no
      // toggle/edit/delete actions and are not bulk-selectable.
      return Boolean(task?.isOnceEphemeral || task?.broadcastSource)
    },
    selectLatestOnceOverrides(list) {
      const picked = new Map()
      const items = Array.isArray(list) ? list : []
      items.forEach((override, idx) => {
        if (!override || override.mode !== 'once') return
        if (!this.isRenderableOnceOverride(override)) return
        const key = this.onceOverrideKey(override, idx)
        const rank = this.onceOverrideRank(override, idx)
        const prev = picked.get(key)
        if (!prev || rank >= prev.rank) {
          picked.set(key, { rank, override })
        }
      })
      return Array.from(picked.values())
        .sort((a, b) => a.rank - b.rank)
        .map((item) => item.override)
    },
    isRenderableOnceOverride(override) {
      if (!override || override.mode !== 'once') return false
      if (String(override.execution_state || '') !== 'scheduled') return false
      if (override.active !== true) return false
      if (override.remote_synced === false) return false
      if (String(override.cleanup_state || '') === 'cleaned') return false
      return true
    },
    onceOverrideKey(override, idx) {
      const action = String(override?.action || '').trim()
      const schedule = String(override?.schedule_name || '').trim()
      if (!action || !schedule) return `idx:${idx}`
      if (action === 'cancel') {
        const date = this.normalizeDate(override?.time_start) || ''
        const taskIds = Array.isArray(override?.task_ids) ? override.task_ids.map((id) => String(id)).sort().join(',') : ''
        return `${action}|${schedule}|${date}|${taskIds}`
      }
      if (action === 'migrate') {
        const oldDate = this.normalizeDate(override?.time_start) || ''
        const newDate = this.normalizeDate(override?.new_time_start) || ''
        const taskIds = Array.isArray(override?.task_ids) ? override.task_ids.map((id) => String(id)).sort().join(',') : ''
        return `${action}|${schedule}|${oldDate}|${newDate}|${taskIds}`
      }
      if (action === 'swap') {
        const sourceDate = this.normalizeDate(override?.source_time_start) || ''
        const targetDate = this.normalizeDate(override?.target_time_start) || ''
        const sourceIds = Array.isArray(override?.source_task_ids) ? override.source_task_ids.map((id) => String(id)).sort().join(',') : ''
        const targetIds = Array.isArray(override?.target_task_ids) ? override.target_task_ids.map((id) => String(id)).sort().join(',') : ''
        return `${action}|${schedule}|${sourceDate}|${targetDate}|${sourceIds}|${targetIds}`
      }
      return `${action}|${schedule}|idx:${idx}`
    },
    onceOverrideRank(override, idx) {
      const createdAt = this.parseDateTime(override?.created_at)
      const base = createdAt ? createdAt.getTime() : 0
      return base + (idx / 1000)
    },
    decorateConflictMeta(tasks) {
      const list = (Array.isArray(tasks) ? tasks : []).map((task) => ({
        ...task,
        conflict: false,
        conflictPeerIds: [],
        conflictGroupId: '',
        conflictGroupTitle: '',
        conflictGroupNames: [],
        groupPosition: ''
      }))

      const adjacency = new Map(list.map((task) => [task.id, new Set()]))

      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i]
          const b = list[j]
          if (!this.canConflictPair(a, b)) continue
          if (!this.timeRangeOverlap(a, b)) continue
          adjacency.get(a.id).add(b.id)
          adjacency.get(b.id).add(a.id)
        }
      }

      const visited = new Set()
      let groupIndex = 0

      list.forEach((task) => {
        if (visited.has(task.id)) return
        const neighbors = adjacency.get(task.id)
        if (!neighbors || neighbors.size === 0) {
          visited.add(task.id)
          return
        }

        const stack = [task.id]
        const component = []
        while (stack.length) {
          const currentId = stack.pop()
          if (!currentId || visited.has(currentId)) continue
          visited.add(currentId)
          component.push(currentId)
          const linked = adjacency.get(currentId)
          if (!linked) continue
          linked.forEach((nextId) => {
            if (!visited.has(nextId)) stack.push(nextId)
          })
        }

        if (component.length < 2) return

        groupIndex += 1
        const ordered = component
          .map((id) => list.find((item) => item.id === id))
          .filter((item) => item)
          .sort((a, b) => this.timeToSeconds(a.time) - this.timeToSeconds(b.time))
        const scheduleNames = Array.from(new Set(ordered.map((item) => item.scheduleName).filter(Boolean)))
        const timeText = ordered.length ? ordered[0].time : ''
        const groupTitle = scheduleNames.length > 1
          ? `冲突组：${scheduleNames.join(' / ')}（${timeText}）`
          : `冲突组：${scheduleNames[0] || '未命名方案'}（${timeText}）`

        ordered.forEach((item, idx) => {
          item.conflict = true
          item.conflictPeerIds = ordered.filter((row) => row.id !== item.id).map((row) => row.id)
          item.conflictGroupId = `conflict-${groupIndex}`
          item.conflictGroupTitle = groupTitle
          item.conflictGroupNames = scheduleNames
          if (idx === 0) {
            item.groupPosition = 'start'
          } else if (idx === ordered.length - 1) {
            item.groupPosition = 'end'
          } else {
            item.groupPosition = 'middle'
          }
        })
      })

      return list
    },
    canConflictPair(a, b) {
      if (!a || !b) return false
      if (a.id === b.id) return false
      if (a.date !== b.date) return false
      if (a.area !== b.area) return false
      if (!this.isConflictCandidate(a) || !this.isConflictCandidate(b)) return false
      return true
    },
    isConflictCandidate(task) {
      if (!task) return false
      if (
        task.badgeType === 'badge-cancel' ||
        task.badgeType === 'badge-migrate-before' ||
        task.badgeType === 'badge-swap-before'
      ) return false
      if (!task.enabled || !task.scheduleEnabled) return false
      return true
    },
    taskDurationValue(task) {
      const num = Number(task?.duration)
      if (Number.isNaN(num) || num <= 0) return null
      return Math.max(1, Math.round(num))
    },
    taskDurationText(task) {
      const duration = this.taskDurationValue(task)
      return duration === null ? '时长 —' : `时长 ${duration} 秒`
    },
    taskVolumeText(task) {
      const value = task?.volume
      if (value === '' || value === null || value === undefined) return '—'
      const num = Number(value)
      if (Number.isNaN(num) || num < 0) return '—'
      return `${num}%`
    },
    timeRangeOverlap(a, b) {
      const startA = this.timeToSeconds(a.time)
      const startB = this.timeToSeconds(b.time)
      const durationA = this.taskDurationValue(a)
      const durationB = this.taskDurationValue(b)
      if (durationA === null || durationB === null) return false
      const endA = startA + durationA
      const endB = startB + durationB
      return startA < endB && startB < endA
    },
    isScheduleEnabled(schedule) {
      const raw = schedule?.status
      if (raw === undefined || raw === null || raw === '') return true
      const status = String(raw).trim()
      if (!status) return true
      const lower = status.toLowerCase()
      if (status === '0' || status === '启用' || status === '执行中' || lower === 'enabled' || lower === 'running') {
        return true
      }
      if (status === '1' || status === '停用' || status === '禁用' || lower === 'disabled' || lower === 'stopped') {
        return false
      }
      return true
    },
    weekdaysFromExecmode(value) {
      const num = Number(value)
      if (!num) return []
      // 远端编码（7位二进制，高位到低位）：周日 周一 周二 周三 周四 周五 周六
      const mapping = [
        [32, '周一'],
        [16, '周二'],
        [8, '周三'],
        [4, '周四'],
        [2, '周五'],
        [1, '周六'],
        [64, '周日']
      ]
      return mapping.filter(([bit]) => num & bit).map(([, label]) => label)
    },
    isTaskActiveOnDate(task, dateKey, weekdayLabel) {
      const startDate = this.normalizeDate(task?.startdate)
      const endDate = this.normalizeDate(task?.enddate)
      const weekdays = Array.isArray(task?.weekdays) ? task.weekdays : this.weekdaysFromExecmode(task?.execmode)
      const hasWeekdays = weekdays.length > 0
      const hasRange = startDate && endDate && startDate !== endDate

      if (!hasWeekdays || hasRange) {
        if (startDate && endDate) {
          if (dateKey < startDate || dateKey > endDate) return false
        } else if (startDate) {
          if (dateKey !== startDate) return false
        } else if (endDate) {
          if (dateKey !== endDate) return false
        }
      }

      if (hasWeekdays && !weekdays.includes(weekdayLabel)) return false
      return true
    },
    mapScheduleTask(schedule, task, idx, scheduleIndex, dateKey, scheduleEnabled = true) {
      const scheduleName = String(schedule?.schedule_name || schedule?.name || '').trim()
      if (!scheduleName) return null
      const taskId = task?.taskid || task?.id || `task-${scheduleIndex + 1}-${idx + 1}`
      const displayName = this.taskDisplayName(task)
      const sourceName = this.taskSourceName(task)
      const area = this.formatLocation(task?.location)
      const time = this.toTime(task?.starttime) || '00:00:00'
      const duration = this.toDurationSeconds(task?.timelength)
      const enabled = Number(task?.enablestate) !== 0

      return {
        id: this.taskKey(scheduleName, taskId),
        taskId: String(taskId),
        scheduleName,
        date: dateKey,
        time,
        duration,
        displayName,
        sourceName,
        audio: sourceName,
        area,
        source: sourceName,
        status: 'queued',
        note: scheduleEnabled ? (enabled ? '' : '任务停用') : '方案停用',
        itemClass: '',
        badge: '',
        badgeType: '',
        volume: Number(task?.volume || 50),
        priority: Number(task?.priority || 0),
        playModeLabel: Number(task?.timelengthtype) === 2 ? '循环播放' : '按时长播放',
        enabled,
        scheduleEnabled
      }
    },
    // T60 阶段1: a file-broadcast has a periodic footprint when it recurs —
    // either by weekday bitmask (execmode>0) or an explicit weekdays array.
    // Immediate / one-off broadcasts (execmode=0, no weekdays) are excluded
    // from the daily timeline. Mirrors backend has_periodic_footprint.
    isPeriodicBroadcast(broadcast) {
      if (!broadcast || typeof broadcast !== 'object') return false
      if (Number(broadcast.execmode) > 0) return true
      const weekdays = Array.isArray(broadcast.weekdays) ? broadcast.weekdays : []
      return weekdays.length > 0
    },
    // Map a periodic file-broadcast row onto the daily-timeline task shape. It
    // has NO schedule_name (it is not part of any 作息方案), so scheduleName is
    // empty and a 文件广播 source label distinguishes it from schedule tasks.
    mapBroadcastTask(broadcast, idx, dateKey) {
      if (!broadcast || typeof broadcast !== 'object') return null
      const taskId = broadcast.taskid || broadcast.id || `broadcast-${idx + 1}`
      const displayName = this.taskDisplayName(broadcast)
      const sourceName = this.taskSourceName(broadcast)
      const area = this.formatLocation(broadcast.location)
      const time = this.toTime(broadcast.starttime || broadcast.time) || '00:00:00'
      const duration = this.toDurationSeconds(broadcast.timelength)
      const enabled = Number(broadcast.enablestate) !== 0
      return {
        id: this.taskKey('__broadcast__', taskId),
        taskId: String(taskId),
        scheduleName: '',
        kind: 'broadcast',
        broadcastSource: true,
        date: dateKey,
        time,
        duration,
        displayName,
        sourceName,
        audio: sourceName,
        area,
        source: sourceName,
        status: 'queued',
        note: enabled ? '' : '任务停用',
        itemClass: '',
        badge: '文件广播',
        badgeType: 'badge-broadcast',
        volume: Number(broadcast.volume || 50),
        priority: Number(broadcast.priority || 0),
        playModeLabel: Number(broadcast.timelengthtype) === 2 ? '循环播放' : '按时长播放',
        enabled,
        scheduleEnabled: true
      }
    },
    deriveTaskDisplayStatus(task, options = {}) {
      if (!task) return 'queued'
      if (task.conflict || !task.scheduleEnabled || !task.enabled) {
        return 'issue'
      }
      const dateKey = this.normalizeDateKey(options.dateKey || task.date || this.currentDateKey)
      const todayKey = this.normalizeDateKey(options.todayKey || getShanghaiDateKey(options.nowTick || this.nowTick))
      if (dateKey < todayKey) return 'done'
      if (dateKey > todayKey) return 'queued'
      const nowParts = getShanghaiDateParts(options.nowTick || this.nowTick)
      const nowSeconds = (Number(nowParts.hour) * 3600) + (Number(nowParts.minute) * 60) + Number(nowParts.second)
      const startSeconds = clampNumber(this.timeToSeconds(task.time), 0, 24 * 3600)
      const durationSeconds = this.taskDurationValue(task)
      if (durationSeconds === null) return 'queued'
      const endSeconds = startSeconds + durationSeconds
      if (nowSeconds >= endSeconds) return 'done'
      if (nowSeconds >= startSeconds) return 'playing'
      return 'queued'
    },
    applyTaskDisplayState(task, options = {}) {
      if (!task) return task
      return {
        ...task,
        status: this.deriveTaskDisplayStatus(task, options)
      }
    },
    zoneName(value) {
      const text = String(value ?? '').trim()
      const mapping = {
        '0': '无分区终端',
        '1': 'A区',
        '2': 'B区',
        '3': 'C区',
        '4': 'D区',
        '5': 'E区',
        '6': 'F区',
        '7': 'G区',
        '8': 'H区',
        '9': 'I区'
      }
      return mapping[text] || `分区${text}`
    },
    normalizeZoneLabel(value) {
      const text = String(value ?? '').trim()
      if (!text) return ''
      const match = text.match(/^zone\s*(\d+)$/i)
      if (match) return this.zoneName(match[1])
      if (/^\d+$/.test(text)) return this.zoneName(text)
      return text
    },
    formatLocation(location) {
      if (!location) return '未指定区域'
      const normalize = (value) => this.normalizeZoneLabel(value)
      if (Array.isArray(location)) {
        if (location.length && Array.isArray(location[0])) {
          return location
            .map((path) => path.map((item) => normalize(item)).join(' / '))
            .join('；')
        }
        return location.map((item) => normalize(item)).join(' / ')
      }
      if (typeof location === 'string') {
        if (!location.includes(',')) return normalize(location)
        return location.split(',').map((item) => normalize(item)).join(' / ')
      }
      return '未指定区域'
    },
    normalizeTaskRef(task) {
      if (!task || typeof task !== 'object') return null
      const scheduleName = String(task.scheduleName || '').trim()
      const taskId = String(task.taskId || '').trim()
      if (!scheduleName || !taskId) return null
      return { scheduleName, taskId }
    },
    uniqueTaskRefs(tasks) {
      const refs = []
      const seen = new Set()
      const list = Array.isArray(tasks) ? tasks : [tasks]
      list.forEach((task) => {
        const ref = this.normalizeTaskRef(task)
        if (!ref) return
        const key = this.taskKey(ref.scheduleName, ref.taskId)
        if (seen.has(key)) return
        seen.add(key)
        refs.push(ref)
      })
      return refs
    },
    cloneSchedules(value) {
      const source = Array.isArray(value) ? value : []
      try {
        return JSON.parse(JSON.stringify(source))
      } catch {
        return source.map((item) => ({ ...item }))
      }
    },
    findTaskInSchedules(schedules, scheduleName, taskId) {
      const list = Array.isArray(schedules) ? schedules : []
      const scheduleIndex = list.findIndex((item) => {
        const name = String(item?.schedule_name || item?.name || '').trim()
        return name === String(scheduleName || '').trim()
      })
      if (scheduleIndex < 0) return null
      const schedule = list[scheduleIndex]
      if (!Array.isArray(schedule.tasks)) {
        schedule.tasks = []
      }
      const taskIndex = schedule.tasks.findIndex((task) => {
        const id = String(task?.taskid ?? task?.id ?? '').trim()
        return id === String(taskId || '').trim()
      })
      if (taskIndex < 0) return null
      return {
        scheduleIndex,
        schedule,
        taskIndex,
        task: schedule.tasks[taskIndex]
      }
    },
    serializeScheduleForApi(schedule) {
      const source = schedule && typeof schedule === 'object' ? schedule : {}
      const copy = this.cloneSchedules([source])[0] || {}
      const scheduleName = String(copy.schedule_name || copy.name || '').trim()
      if (scheduleName) {
        copy.schedule_name = scheduleName
      }
      return copy
    },
    async persistSchedules(nextSchedules, scheduleNames, successMessage) {
      this.saving = true
      try {
        const targets = Array.from(
          new Set((Array.isArray(scheduleNames) ? scheduleNames : [scheduleNames])
            .map((name) => String(name || '').trim())
            .filter((name) => name))
        )
        for (const scheduleName of targets) {
          const schedule = nextSchedules.find((item) => {
            const name = String(item?.schedule_name || item?.name || '').trim()
            return name === scheduleName
          })
          if (!schedule) continue
          await updateScheduleEntry(scheduleName, this.serializeScheduleForApi(schedule))
        }
        this.schedules = nextSchedules
        this.selectedTaskIds = []
        this.expandedTaskIds = []
        this.editingTaskId = ''
        if (successMessage) {
          this.$message.success(successMessage)
        }
        return true
      } catch (err) {
        const detail = err?.response?.data?.detail
        this.$message.error(detail || '保存失败，请稍后重试')
        return false
      } finally {
        this.saving = false
      }
    },
    async mutateTasks(targets, updater, successMessage) {
      const writableTargets = (Array.isArray(targets) ? targets : [targets]).filter((task) => !this.isTaskReadonly(task))
      const refs = this.uniqueTaskRefs(writableTargets)
      if (!refs.length) {
        this.$message.warning('请先选择任务')
        return false
      }
      const nextSchedules = this.cloneSchedules(this.schedules)
      let changed = 0
      const changedScheduleNames = new Set()
      refs.forEach((ref) => {
        const found = this.findTaskInSchedules(nextSchedules, ref.scheduleName, ref.taskId)
        if (!found) return
        const action = updater(found.task, found.schedule, ref)
        if (action === 'remove') {
          found.schedule.tasks.splice(found.taskIndex, 1)
          changed += 1
          changedScheduleNames.add(ref.scheduleName)
          return
        }
        if (action !== false) {
          changed += 1
          changedScheduleNames.add(ref.scheduleName)
        }
      })
      if (!changed) {
        this.$message.warning('未找到可更新的任务')
        return false
      }
      return this.persistSchedules(nextSchedules, Array.from(changedScheduleNames), successMessage)
    },
    isTaskSelected(taskId) {
      return this.selectedTaskIds.includes(taskId)
    },
    toggleTaskSelection(taskOrId, checked) {
      const task = taskOrId && typeof taskOrId === 'object' ? taskOrId : null
      if (task && this.isTaskReadonly(task)) return
      const taskId = task ? task.id : taskOrId
      const nextChecked = checked === true || checked === 1
      const selected = new Set(this.selectedTaskIds)
      if (nextChecked) {
        selected.add(taskId)
      } else {
        selected.delete(taskId)
      }
      this.selectedTaskIds = Array.from(selected)
    },
    toggleSelectAll(checked) {
      const nextChecked = checked === true || checked === 1
      const visibleIds = this.filteredTasks.filter((task) => !this.isTaskReadonly(task)).map((task) => task.id)
      const visibleSet = new Set(visibleIds)
      if (nextChecked) {
        const merged = new Set(this.selectedTaskIds)
        visibleIds.forEach((id) => merged.add(id))
        this.selectedTaskIds = Array.from(merged)
        return
      }
      this.selectedTaskIds = this.selectedTaskIds.filter((id) => !visibleSet.has(id))
    },
    isExpanded(taskId) {
      return this.expandedTaskIds.includes(taskId)
    },
    toggleExpand(taskId) {
      if (this.isExpanded(taskId)) {
        this.expandedTaskIds = this.expandedTaskIds.filter((id) => id !== taskId)
      } else {
        this.expandedTaskIds = [...this.expandedTaskIds, taskId]
      }
    },
    startInlineEdit(task) {
      if (this.isTaskReadonly(task)) return
      this.editingTaskId = task.id
      this.editDraft = {
        displayName: task.displayName || '',
        sourceName: task.sourceName || '',
        time: task.time || '00:00:00',
        volume: Number(task.volume ?? 50)
      }
    },
    cancelInlineEdit() {
      this.editingTaskId = ''
      this.editDraft = {
        displayName: '',
        sourceName: '',
        time: '00:00:00',
        volume: 50
      }
    },
    async saveInlineEdit(task) {
      if (this.isTaskReadonly(task)) return false
      const nextDisplayName = String(this.editDraft.displayName || '').trim() || task.displayName || this.taskDisplayName(task)
      const nextSourceName = String(this.editDraft.sourceName || '').trim() || task.sourceName || this.taskSourceName(task)
      const nextTime = this.normalizeTimeInput(this.editDraft.time)
      const nextVolume = Math.max(0, Math.min(100, Number(this.editDraft.volume ?? 50)))
      if (!nextTime) {
        this.$message.error('请输入有效时间，格式 HH:mm:ss')
        return
      }
      const saved = await this.mutateTasks(
        [task],
        (rawTask) => {
          rawTask.customName = nextDisplayName
          rawTask.taskname = nextDisplayName
          rawTask.audio = nextSourceName
          rawTask.medianame = nextSourceName
          rawTask.starttime = nextTime
          rawTask.volume = nextVolume
          return true
        },
        '任务已更新'
      )
      if (saved) {
        this.cancelInlineEdit()
      }
    },
    async setTaskEnabled(task, enabled, successMessage) {
      if (this.isTaskReadonly(task)) return false
      return this.mutateTasks(
        [task],
        (rawTask) => {
          rawTask.enablestate = enabled ? 1 : 0
          if (!enabled) {
            rawTask.taskstate = 0
          }
          return true
        },
        successMessage
      )
    },
    async toggleTaskEnabled(task) {
      if (this.isTaskReadonly(task)) return
      const nextEnabled = !task.enabled
      await this.setTaskEnabled(task, nextEnabled, nextEnabled ? '任务已启用' : '任务已禁用')
    },
    async deleteTask(task) {
      if (this.isTaskReadonly(task)) return
      try {
        await this.$confirm(`确定删除任务 [${task.displayName}] 吗？`, '删除确认', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        })
      } catch {
        return
      }
      await this.mutateTasks([task], () => 'remove', '任务已删除')
    },
    async applyBulkDisable() {
      if (!this.selectedTasks.length) {
        this.$message.warning('请先勾选任务')
        return
      }
      await this.mutateTasks(
        this.selectedTasks,
        (rawTask) => {
          rawTask.enablestate = 0
          rawTask.taskstate = 0
          return true
        },
        `已禁用 ${this.selectedTasks.length} 条任务`
      )
    },
    async applyBulkDelete() {
      if (!this.selectedTasks.length) {
        this.$message.warning('请先勾选任务')
        return
      }
      try {
        await this.$confirm(`确定删除已选的 ${this.selectedTasks.length} 条任务吗？`, '批量删除', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        })
      } catch {
        return
      }
      await this.mutateTasks(this.selectedTasks, () => 'remove', `已删除 ${this.selectedTasks.length} 条任务`)
    },
    async applyBulkVolume() {
      if (!this.selectedTasks.length) {
        this.$message.warning('请先勾选任务')
        return
      }
      const targetVolume = Math.max(0, Math.min(100, Number(this.bulkVolume ?? 50)))
      await this.mutateTasks(
        this.selectedTasks,
        (rawTask) => {
          rawTask.volume = targetVolume
          return true
        },
        `已将 ${this.selectedTasks.length} 条任务音量更新为 ${targetVolume}%`
      )
    },
    openResolveDialog(block) {
      if (!block || !Array.isArray(block.tasks) || block.tasks.length < 2) {
        this.$message.warning('当前冲突组没有可处理任务')
        return
      }
      const ordered = [...block.tasks]
        .filter((task) => !this.isTaskReadonly(task))
        .sort((a, b) => this.timeToSeconds(a.time) - this.timeToSeconds(b.time))
      if (ordered.length < 2) {
        this.$message.warning('当前冲突组仅包含只读临时任务，无法在此页处理')
        return
      }
      const first = ordered[0]
      const second = ordered[1]
      this.resolveDialog.visible = true
      this.resolveDialog.groupId = block.id
      this.resolveDialog.taskIds = ordered.map((task) => task.id)
      this.resolveDialog.choice = second ? `disable:${second.id}` : ''
      this.resolveDialog.rescheduleTaskId = first ? first.id : ''
      this.resolveDialog.newTime = first ? first.time : '00:00:00'
    },
    closeResolveDialog() {
      this.resolveDialog.visible = false
      this.resolveDialog.groupId = ''
      this.resolveDialog.taskIds = []
      this.resolveDialog.choice = ''
      this.resolveDialog.rescheduleTaskId = ''
      this.resolveDialog.newTime = '00:00:00'
    },
    async applyResolveDialog() {
      const choice = String(this.resolveDialog.choice || '')
      if (!choice) {
        this.$message.warning('请选择一种处理方式')
        return
      }
      if (choice.startsWith('disable:')) {
        const targetId = choice.slice('disable:'.length)
        const targetTask = this.resolveTasks.find((task) => task.id === targetId)
        if (!targetTask) {
          this.$message.error('未找到要停用的任务')
          return
        }
        const saved = await this.setTaskEnabled(
          targetTask,
          false,
          `已停用 [${targetTask.scheduleName}]，冲突已刷新`
        )
        if (saved) {
          this.closeResolveDialog()
        }
        return
      }
      if (choice === 'reschedule') {
        const targetTask = this.resolveRescheduleTarget
        if (!targetTask) {
          this.$message.warning('请选择要调整时间的任务')
          return
        }
        const nextTime = this.normalizeTimeInput(this.resolveDialog.newTime)
        if (!nextTime) {
          this.$message.error('请输入有效时间，格式 HH:mm:ss')
          return
        }
        if (nextTime === targetTask.time) {
          this.$message.info('时间未变化')
          return
        }
        const saved = await this.mutateTasks(
          [targetTask],
          (rawTask) => {
            rawTask.starttime = nextTime
            return true
          },
          `已将 [${targetTask.scheduleName}] 调整到 ${nextTime}`
        )
        if (saved) {
          this.closeResolveDialog()
        }
      }
    },
    openConflictDrawer(task) {
      this.conflictDrawer.visible = true
      this.conflictDrawer.taskId = task.id
      const peers = this.tasksForDay.filter((item) => Array.isArray(task.conflictPeerIds) && task.conflictPeerIds.includes(item.id))
      const preferredPeer = peers.find((item) => item.scheduleName !== task.scheduleName) || peers[0]
      this.conflictDrawer.peerTaskId = preferredPeer ? preferredPeer.id : ''
      this.conflictDrawer.newTime = task.time || '00:00:00'
    },
    closeConflictDrawer(done) {
      this.conflictDrawer.visible = false
      this.conflictDrawer.taskId = ''
      this.conflictDrawer.peerTaskId = ''
      this.conflictDrawer.newTime = '00:00:00'
      if (typeof done === 'function') {
        done()
      }
    },
    async disableCurrentInDrawer() {
      if (!this.drawerTask) return
      const saved = await this.setTaskEnabled(
        this.drawerTask,
        false,
        `已停用 [${this.drawerTask.scheduleName}] 的冲突任务`
      )
      if (saved) {
        this.closeConflictDrawer()
      }
    },
    async disablePeerInDrawer() {
      const peer = this.drawerPeerTask
      if (!peer) {
        this.$message.warning('未找到冲突任务')
        return
      }
      const saved = await this.setTaskEnabled(peer, false, `已停用 [${peer.scheduleName}] 的冲突任务`)
      if (saved) {
        this.closeConflictDrawer()
      }
    },
    async applyDrawerTimeChange() {
      if (!this.drawerTask) return
      const nextTime = this.normalizeTimeInput(this.conflictDrawer.newTime)
      if (!nextTime) {
        this.$message.error('请选择有效时间')
        return
      }
      if (nextTime === this.drawerTask.time) {
        this.$message.info('时间未变化')
        return
      }
      const saved = await this.mutateTasks(
        [this.drawerTask],
        (rawTask) => {
          rawTask.starttime = nextTime
          return true
        },
        `冲突任务时间已调整为 ${nextTime}`
      )
      if (saved) {
        this.closeConflictDrawer()
      }
    },
    async applyDrawerPriority() {
      if (!this.drawerTask) return
      const peerPriorities = this.drawerPeers.map((task) => Number(task.priority || 0))
      const targetPriority = Math.max(Number(this.drawerTask.priority || 0), ...peerPriorities, 0) + 10
      const saved = await this.mutateTasks(
        [this.drawerTask],
        (rawTask) => {
          rawTask.priority = targetPriority
          return true
        },
        `已将 [${this.drawerTask.scheduleName}] 提升为优先级 ${targetPriority}`
      )
      if (saved) {
        this.closeConflictDrawer()
      }
    },
    statusLabel(status) {
      if (status === 'done') return '已完成'
      if (status === 'playing') return '进行中'
      if (status === 'queued') return '待执行'
      if (status === 'issue') return '异常'
      return '未知'
    },
    tagType(status) {
      if (status === 'done') return 'success'
      if (status === 'playing') return 'primary'
      if (status === 'queued') return 'info'
      if (status === 'issue') return 'danger'
      return 'info'
    },
    taskKey(scheduleName, taskId) {
      return `${scheduleName}::${taskId}`
    },
    mergeClass(base, extra) {
      const baseText = base ? String(base) : ''
      if (!baseText) return extra
      if (baseText.includes(extra)) return baseText
      return `${baseText} ${extra}`.trim()
    },
    weekdayLabel(dateKey) {
      const day = new Date(dateKey).getDay()
      const map = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return map[day] || '周一'
    },
    formatDate(date) {
      const d = new Date(date)
      const y = d.getFullYear()
      const m = `${d.getMonth() + 1}`.padStart(2, '0')
      const day = `${d.getDate()}`.padStart(2, '0')
      return `${y}-${m}-${day}`
    },
    normalizeDate(value) {
      if (!value || value === '0-00-00') return ''
      const text = String(value)
      const match = text.match(/\d{4}-\d{2}-\d{2}/)
      return match ? match[0] : ''
    },
    parseDateTime(value) {
      if (!value) return null
      const text = String(value).replace(' ', 'T')
      const date = new Date(text)
      if (Number.isNaN(date.getTime())) return null
      return date
    },
    shiftTimeFromBase(baseDateKey, time, deltaMs) {
      if (!baseDateKey || !time) return ''
      const safe = this.toTime(time)
      const date = new Date(`${baseDateKey}T${safe}`)
      if (Number.isNaN(date.getTime())) return ''
      return this.formatTime(new Date(date.getTime() + deltaMs))
    },
    formatTime(date) {
      const h = `${date.getHours()}`.padStart(2, '0')
      const m = `${date.getMinutes()}`.padStart(2, '0')
      const s = `${date.getSeconds()}`.padStart(2, '0')
      return `${h}:${m}:${s}`
    },
    timeToSeconds(value) {
      if (!value) return 24 * 3600 + 1
      const text = String(value).trim()
      const parts = text.split(':')
      if (parts.length < 2) return 24 * 3600 + 1
      const h = Number(parts[0])
      const m = Number(parts[1])
      const s = Number(parts[2] || 0)
      if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return 24 * 3600 + 1
      return h * 3600 + m * 60 + s
    },
    toTime(value) {
      if (!value) return '00:00:00'
      if (value instanceof Date) return this.formatTime(value)
      const text = String(value).trim()
      if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text
      if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`
      const match = text.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
      if (!match) return '00:00:00'
      const h = Number(match[1])
      const m = Number(match[2])
      const s = Number(match[3] || 0)
      if (h > 23 || m > 59 || s > 59) return '00:00:00'
      return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}:${`${s}`.padStart(2, '0')}`
    },
    toDurationSeconds(value) {
      const num = Number(value)
      if (Number.isNaN(num) || num <= 0) return 1
      return Math.max(1, Math.round(num))
    },
    normalizeTimeInput(value) {
      if (!value) return ''
      if (value instanceof Date) return this.formatTime(value)
      const normalized = this.toTime(value)
      return normalized === '00:00:00' && String(value).trim() !== '00:00:00'
        ? ''
        : normalized
    },
    weekdayLabelShanghai(dateKey) {
      return getShanghaiDateParts(this.dateKeyToDate(dateKey)).weekdayLabel
    },
    formatDateShanghai(date) {
      return this.normalizeDateKey(date)
    }
  }
}
</script>

<style lang="scss" scoped>
.task-management-page {
  min-height: 100%;
  box-sizing: border-box;
  padding: 24px;
  background: #f3f6fb;
}

.page-header {
  margin-bottom: 14px;

  .page-header-copy {
    max-width: 620px;
  }

  h2 {
    margin: 0;
    color: #1f2d3d;
    font-size: 22px;
  }

  p {
    margin: 6px 0 0;
    font-size: 13px;
    color: #5e6d82;
  }
}

.date-focus {
  position: relative;
  overflow: hidden;
  margin-bottom: 16px;
  padding: 28px 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
  background:
    radial-gradient(circle at top, rgba(64, 158, 255, 0.18), transparent 44%),
    linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
}

.date-focus::before {
  content: '';
  position: absolute;
  top: -32px;
  right: 12%;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: rgba(64, 158, 255, 0.1);
}

.date-focus-content,
.date-focus-actions {
  position: relative;
  z-index: 1;
}

.date-focus-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.date-focus-caption {
  font-size: 12px;
  font-weight: 600;
  color: #8b98aa;
}

.date-focus-title {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.date-focus-month {
  margin-bottom: 12px;
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
  color: #8b98aa;
}

.date-focus-day {
  font-size: 84px;
  font-weight: 800;
  line-height: 0.92;
  letter-spacing: -0.04em;
  color: #1a2a40;
}

.date-focus-unit {
  margin-bottom: 12px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: #42546b;
}

.date-focus-back {
  margin-bottom: 12px;
  border-color: rgba(64, 158, 255, 0.32);
  color: #2f7be5;
  background: rgba(255, 255, 255, 0.88);
}

.date-focus-back:hover,
.date-focus-back:focus {
  border-color: rgba(64, 158, 255, 0.5);
  color: #1d65cc;
  background: #fff;
}

.date-focus-subtitle {
  margin: 0;
  font-size: 14px;
  color: #5e6d82;
}

.date-focus-holiday {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.date-focus-holiday-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}

.date-focus-holiday-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.date-focus-holiday-tag.is-holiday {
  color: #b76a0f;
  background: #fff1db;
}

.date-focus-holiday-tag.is-workday {
  color: #1f5fa8;
  background: #eaf4ff;
}

.date-focus-holiday-tag.is-weekend {
  color: #c25b12;
  background: #fff2e8;
}

.date-focus-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.date-focus-actions .el-date-editor.el-input {
  width: 220px;
}

.day-timeline {
  margin-bottom: 14px;
  padding: 14px 14px 10px;
  border: 1px solid #e6ebf5;
  border-radius: 12px;
  background: linear-gradient(180deg, #fcfdff 0%, #f8fbff 100%);
}

.day-timeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.day-timeline-title {
  font-size: 13px;
  font-weight: 700;
  color: #1f2d3d;
}

.day-timeline-count {
  font-size: 12px;
  color: #8b98aa;
}

.day-timeline-track {
  position: relative;
  height: 48px;
  overflow: visible;
  border-radius: 10px;
  border: 1px solid #e6ebf5;
  background:
    linear-gradient(90deg, rgba(64, 158, 255, 0.05) 0%, rgba(64, 158, 255, 0.01) 100%),
    #fff;
}

.day-timeline-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(143, 155, 179, 0.18);
}

.day-timeline-block {
  position: absolute;
  top: 9px;
  height: 28px;
  border-radius: 8px;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.14);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.day-timeline-block:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(31, 45, 61, 0.18);
}

.day-timeline-now {
  position: absolute;
  top: -6px;
  bottom: -10px;
  width: 0;
  border-left: 2px solid #f56c6c;
  z-index: 4;
}

.day-timeline-now-label {
  position: absolute;
  top: -18px;
  left: 6px;
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #f56c6c;
  white-space: nowrap;
}

.day-timeline-scale {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #97a1af;
}

.day-timeline-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #8b98aa;
}

.stats-grid {
  margin-bottom: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stat-card {
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fff;
  box-shadow: 0 10px 24px rgba(31, 45, 61, 0.08);

  p {
    margin: 0;
    font-size: 13px;
    color: #5e6d82;
  }

  strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
    line-height: 1;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 28px rgba(31, 45, 61, 0.12);
  }

  &.active {
    border-color: #409eff;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.18), 0 14px 28px rgba(31, 45, 61, 0.12);
  }

  &.total strong {
    color: #1f2d3d;
  }

  &.running strong {
    color: #409eff;
  }

  &.pending strong {
    color: #67c23a;
  }

  &.warning strong {
    color: #f56c6c;
  }
}

.card {
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(31, 45, 61, 0.08);
}

.timeline-card {
  padding: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
}

.bulk-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.bulk-count {
  color: #5e6d82;
  font-size: 13px;
}

.bulk-volume {
  width: 130px;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict-group {
  border: 1px solid #efc3c3;
  border-radius: 12px;
  background: #fff7f7;
  box-shadow: 0 6px 16px rgba(245, 108, 108, 0.1);
  overflow: hidden;
}

.conflict-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #f5d2d2;
  background: linear-gradient(180deg, #fff0f0 0%, #ffe7e7 100%);
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #b33939;
  font-size: 13px;
  font-weight: 700;
}

.group-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.group-schedules {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7f8c8d;
  font-size: 12px;
}

.group-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-item {
  position: relative;
  overflow: visible;
  display: grid;
  grid-template-columns: 220px minmax(260px, 1fr) auto;
  gap: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  background: linear-gradient(140deg, #f8fbff 0%, #ffffff 75%);
  padding: 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.timeline-item:hover {
  border-color: #c6dbff;
  box-shadow: 0 8px 18px rgba(31, 45, 61, 0.1);
}

.timeline-item.conflict {
  border-color: #f0d0d0;
  background: #fffdfd;
  box-shadow: none;
}

.timeline-item.conflict.group-start,
.timeline-item.conflict.group-middle,
.timeline-item.conflict.group-end {
  border-left: 4px solid #f29b9b;
}

.timeline-item.conflict.group-start::after,
.timeline-item.conflict.group-middle::after {
  content: '';
  position: absolute;
  left: 11px;
  bottom: -9px;
  width: 2px;
  height: 9px;
  border-radius: 1px;
  background: #f29b9b;
}

.timeline-item.conflict.group-middle::before,
.timeline-item.conflict.group-end::before {
  content: '';
  position: absolute;
  left: 11px;
  top: -9px;
  width: 2px;
  height: 9px;
  border-radius: 1px;
  background: #f29b9b;
}

.timeline-item.conflict.group-start .time,
.timeline-item.conflict.group-middle .time,
.timeline-item.conflict.group-end .time {
  color: #b94f4f;
}

.timeline-item.accent-gray {
  border-left: 4px solid #909399;
}

.timeline-item.accent-orange {
  border-left: 4px solid #e6a23c;
}

.timeline-item.accent-swap-a {
  border-left: 4px solid #2f8ff6;
}

.timeline-item.accent-swap-b {
  border-left: 4px solid #23b26b;
}

.timeline-item.muted {
  opacity: 0.55;
}

.left-block {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.expand-btn {
  margin-top: 2px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #5e6d82;
  background: #eef4ff;
}

.expand-btn:hover {
  color: #409eff;
  background: #e1ecff;
}

.time-block {
  min-width: 0;
}

.time {
  font-size: 22px;
  font-weight: 700;
  color: #1f2d3d;
  line-height: 1.1;
}

.duration {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.time-tag {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
}

.time-tag.badge-cancel,
.time-tag.badge-migrate-before {
  color: #909399;
  border-color: #dcdfe6;
  background: #f2f2f2;
}

.time-tag.badge-migrate-after {
  color: #b76a0f;
  border-color: #f0c27a;
  background: #fff5e8;
}

.time-tag.badge-swap-before {
  color: #7f8794;
  border-color: #d5d9e0;
  background: #f4f6f8;
}

.time-tag.badge-swap-after-a {
  color: #1f5fa8;
  border-color: #9ec8f7;
  background: #eaf4ff;
}

.time-tag.badge-swap-after-b {
  color: #1f7a4d;
  border-color: #9edab9;
  background: #e9f9ef;
}

.time-tag.badge-once {
  color: #8a4b00;
  border-color: #f0c27a;
  background: #fff5e8;
}

.content-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-title {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.inline-edit-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.inline-name-input,
.inline-source-input {
  width: 240px;
}

.action-block {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 180px;
  gap: 8px;
}

.status-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.conflict-link {
  display: inline-flex;
  align-items: center;
  padding: 0;
  color: #c0392b;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.conflict-link:hover,
.conflict-link:focus {
  color: #f56c6c;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #5e6d82;
}

.note {
  color: #e67e22;
  font-size: 12px;
}

.inline-editor {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: #f5f8ff;
}

.detail-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #6b778c;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7f9fc;
}

.hover-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transform: translateX(4px);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.timeline-item:hover .hover-actions,
.timeline-item.is-editing .hover-actions {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.conflict-drawer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-text {
  margin: 0;
  color: #5e6d82;
}

.drawer-highlight {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: #fff4f4;
  color: #c0392b;
  font-weight: 600;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-label {
  margin: 0;
  color: #1f2d3d;
  font-size: 13px;
  font-weight: 600;
}

.drawer-peer-hint {
  margin: 0;
  font-size: 12px;
  color: #5e6d82;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.resolve-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resolve-summary {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff5f5;
  color: #b33939;
  font-size: 13px;
}

.resolve-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resolve-option {
  margin-right: 0;
}

.resolve-reschedule {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resolve-select {
  width: 100%;
}

@media (max-width: 960px) {
  .page-header {
    margin-bottom: 12px;
  }

  .date-focus {
    padding: 24px 16px 18px;
  }

  .date-focus-title {
    gap: 8px;
  }

  .date-focus-month {
    margin-bottom: 8px;
    font-size: 24px;
  }

  .date-focus-day {
    font-size: 62px;
  }

  .date-focus-unit {
    margin-bottom: 8px;
    font-size: 22px;
  }

  .date-focus-actions {
    width: 100%;
  }

  .date-focus-actions .el-date-editor.el-input {
    width: 100%;
    max-width: 320px;
  }

  .day-timeline {
    padding: 12px;
  }

  .day-timeline-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .conflict-group-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .group-actions {
    width: 100%;
    justify-content: space-between;
  }

  .timeline-item {
    grid-template-columns: 1fr;
  }

  .left-block {
    align-items: center;
  }

  .action-block {
    min-width: 0;
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

@media (max-width: 640px) {
  .task-management-page {
    padding: 16px;
  }

  .date-focus {
    padding: 20px 14px 16px;
  }

  .date-focus-day {
    font-size: 52px;
  }

  .date-focus-month,
  .date-focus-unit {
    font-size: 20px;
  }

  .date-focus-subtitle {
    font-size: 13px;
  }

  .day-timeline-track {
    height: 44px;
  }

  .day-timeline-block {
    top: 10px;
    height: 24px;
  }

  .day-timeline-now-label {
    left: 4px;
  }
}
</style>

<style lang="scss">
.task-management-holiday-picker .el-date-table td.tm-holiday-cell div,
.task-management-holiday-picker .el-date-table td.tm-workday-cell div,
.task-management-holiday-picker .el-date-table td.tm-weekend-cell div {
  position: relative;
}

.task-management-holiday-picker .el-date-table td.tm-holiday-cell:not(.current) span,
.task-management-holiday-picker .el-date-table td.tm-weekend-cell:not(.current):not(.tm-workday-cell) span {
  color: #d46b08;
  font-weight: 700;
}

.task-management-holiday-picker .el-date-table td.tm-workday-cell:not(.current) span {
  color: #2f8f5b;
  font-weight: 700;
}

.task-management-holiday-picker .el-date-table td.tm-holiday-cell div::after {
  content: '\4f11';
  position: absolute;
  left: 50%;
  bottom: 1px;
  transform: translateX(-50%);
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: #e67e22;
  pointer-events: none;
}

.task-management-holiday-picker .el-date-table td.tm-holiday-cell.current:not(.disabled) div::after {
  color: #fff7ef;
}

.task-management-holiday-picker .el-date-table td.tm-workday-cell div::after {
  content: '\73ed';
  position: absolute;
  left: 50%;
  bottom: 1px;
  transform: translateX(-50%);
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: #2f8f5b;
  pointer-events: none;
}

.task-management-holiday-picker .el-date-table td.tm-workday-cell.current:not(.disabled) div::after {
  color: #effff4;
}

.task-management-holiday-picker .el-date-table td.tm-weekend-cell:not(.tm-holiday-cell):not(.tm-workday-cell) div::after {
  content: '\5468';
  position: absolute;
  right: 5px;
  top: 3px;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: rgba(212, 107, 8, 0.88);
  pointer-events: none;
}

.task-management-holiday-picker .el-date-table td.tm-weekend-cell.current:not(.disabled):not(.tm-holiday-cell):not(.tm-workday-cell) div::after {
  color: #fff7ef;
}
</style>
