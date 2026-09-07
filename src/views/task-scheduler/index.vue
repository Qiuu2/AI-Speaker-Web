<template>
  <div class="scheduler-page">
    <div class="page-header">
      <div>
        <h2>任务编排中心</h2>
        <p>在此编排作息方案、文件广播，保存后各模块页面可直接查看。</p>
      </div>
      <div class="header-actions">
        <el-button
          v-if="hasBroadcastDraft"
          class="save-cta"
          type="primary"
          size="small"
          icon="el-icon-document"
          :loading="isBusyAction('save')"
          :disabled="isActionDisabled('save')"
          @click="savePendingChanges"
        >{{ isBusyAction('save') ? '处理中…' : '保存上传' }}</el-button>
        <el-button
          v-if="hasPlanDraft"
          size="small"
          type="warning"
          plain
          icon="el-icon-delete"
          :disabled="hasBusyAction"
          @click="discardPlanDraft"
        >放弃方案草稿</el-button>
        <el-badge v-if="hasBroadcastDraft" :value="broadcastDraftCount" type="danger">
          <el-tag size="small" type="danger" effect="dark">文件广播草稿待上传</el-tag>
        </el-badge>
        <el-button
          v-if="hasBroadcastDraft"
          size="small"
          type="danger"
          plain
          icon="el-icon-delete"
          :disabled="hasBusyAction"
          @click="discardBroadcastDraft"
        >放弃草稿</el-button>
      </div>
    </div>

    <div
      v-if="saveFeedback.visible"
      class="save-feedback"
      :class="[`is-${saveFeedback.status}`]"
    >
      <div class="save-feedback-head">
        <div class="save-feedback-copy">
          <div class="save-feedback-title">{{ saveFeedbackTitle }}</div>
          <div class="save-feedback-step">{{ saveFeedback.currentLabel || '准备保存' }}</div>
        </div>
        <div class="save-feedback-meta">{{ saveFeedbackStepCounter }}</div>
      </div>
      <div class="save-feedback-message">{{ saveFeedback.message }}</div>
      <el-progress
        :percentage="saveFeedback.percent"
        :status="saveFeedbackProgressStatus"
        :show-text="false"
        :stroke-width="8"
      />
    </div>

    <el-tabs v-model="activeTab" type="card" @tab-click="handleTabClick">
      <!-- 作息方案 -->
      <el-tab-pane label="作息方案" name="plans">
        <div class="toolbar">
          <el-button
            v-if="hasPlanDraft"
            size="mini"
            type="warning"
            plain
            icon="el-icon-close"
            :disabled="hasBusyAction"
            @click="discardPlanDraft"
          >放弃方案草稿</el-button>
          <el-button size="mini" plain icon="el-icon-date" :disabled="!totalOnceChangeCount" @click="openOnceChangesDrawer()">
            临时变更 {{ totalOnceChangeCount }} 条
          </el-button>
          <el-button size="mini" type="primary" icon="el-icon-plus" class="primary-plan-action" :disabled="hasBusyAction" @click="openDialog('plan', 'add')">添加方案</el-button>
          <el-button size="mini" @click="selectAll('plan')">全选</el-button>
          <el-button size="mini" :disabled="!hasPlanSelection" @click="clearSelection('plan')">取消</el-button>
          <el-button
            size="mini"
            type="success"
            :loading="isBusyAction('plan-enable')"
            :disabled="!hasPlanSelection || isActionDisabled('plan-enable')"
            @click="toggleStatus('plan', '启用')"
          >{{ isBusyAction('plan-enable') ? '处理中…' : '启用方案' }}</el-button>
          <el-button
            size="mini"
            type="warning"
            :loading="isBusyAction('plan-disable')"
            :disabled="!hasPlanSelection || isActionDisabled('plan-disable')"
            @click="toggleStatus('plan', '停用')"
          >{{ isBusyAction('plan-disable') ? '处理中…' : '停用方案' }}</el-button>
          <el-button
            size="mini"
            type="danger"
            icon="el-icon-delete"
            :loading="isBusyAction('plan-delete')"
            :disabled="!hasPlanSelection || isActionDisabled('plan-delete')"
            @click="removeSelected('plan')"
          >{{ isBusyAction('plan-delete') ? '处理中…' : '删除方案' }}</el-button>
          <el-dropdown trigger="click" :disabled="hasBusyAction" @command="handlePlanMoreCommand">
            <el-button size="mini" plain :disabled="hasBusyAction">
              更多操作
              <i class="el-icon-arrow-down el-icon--right" />
            </el-button>
            <el-dropdown-menu slot="dropdown">
              <!-- T40 (2026-06-06): "修改方案" 菜单项已移除. :183 vendor 已明确无 schedule rename API,
                   58d5cf4 的 PUT 路径在 backend update_schedule handler 里被强制回旧名,导致 schedule
                   sync reconcile renamed=[] 误删整个 scheme + 全部 task (G4.1 海星作息事故 + 14 task 蒸发).
                   未来如需 rename UX 必须做 "复制为新方案 + 删旧方案" 组合,见 KNOWN_PITFALLS #21. -->
              <el-dropdown-item command="copy" :disabled="!hasPlanSelection">复制方案</el-dropdown-item>
              <el-dropdown-item command="batch" :disabled="!hasPlanSelection">批量修改</el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
        <div v-if="!isMobileLayout" class="table-shell" :class="{ 'is-loading': isTableLoading('plans') }">
          <el-table
            ref="planTable"
            :data="visiblePlans"
            :empty-text="tableEmptyText('plans')"
            border
            size="small"
            @expand-change="handlePlanExpand"
            @selection-change="(vals) => (selected.plans = vals)"
          >
            <el-table-column :resizable="false" type="selection" width="55" />
            <el-table-column :resizable="false" type="expand">
              <template slot-scope="{ row: plan }">
                <div class="task-toolbar task-toolbar-spread">
                  <div class="task-toolbar-left">
                    <el-button size="mini" type="primary" icon="el-icon-plus" @click="addPlanTask(plan)">添加任务</el-button>
                    <el-button size="mini" plain icon="el-icon-date" :disabled="!planOnceTaskCount(plan)" @click="openOnceChangesDrawer(plan.name)">
                      临时变更 {{ planOnceTaskCount(plan) }} 条
                    </el-button>
                  </div>
                </div>
                <div v-if="plan.tasksLoaded && planVisibleTasks(plan).length" class="plan-timeline">
                  <div class="plan-timeline-head">
                    <span class="plan-timeline-title">时间轴预览</span>
                    <span class="plan-timeline-count">{{ planDisplayTaskCount(plan) }} 个长期任务{{ planTaskCountHint(plan) }}</span>
                  </div>
                  <div class="plan-timeline-track">
                    <el-tooltip
                      v-for="slot in planTimelineSlots(plan)"
                      :key="`timeline-${plan.id}-${slot.hour}`"
                      :content="timelineTooltip(slot)"
                      placement="top"
                    >
                      <div class="plan-timeline-block" :style="timelineSlotStyle(slot, plan)" />
                    </el-tooltip>
                  </div>
                  <div class="plan-timeline-scale">
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>24:00</span>
                  </div>
                </div>
                <div v-if="!plan.tasksLoaded" class="note">展开后将加载该方案任务</div>
                <div v-else v-loading="plan.tasksLoading" class="plan-task-wrap">
                  <div v-if="!planVisibleTasks(plan).length" class="plan-task-empty">
                    暂无任务，点击“添加任务”开始编辑。
                  </div>
                  <el-table
                    :data="planVisibleTasks(plan)"
                    border
                    size="mini"
                    class="plan-task-table"
                  >
                    <el-table-column :resizable="false" fixed="left" width="36" class-name="conflict-cell">
                      <template slot-scope="{ row: task }">
                        <el-tooltip v-if="planConflictSummary(plan, task)" :content="planConflictSummary(plan, task)" placement="top">
                          <i class="el-icon-warning conflict-icon" />
                        </el-tooltip>
                      </template>
                    </el-table-column>
                    <el-table-column :resizable="false" type="index" fixed="left" width="40" />
                    <el-table-column :resizable="false" label="任务名" min-width="200">
                      <template slot-scope="{ row: task }">
                        <div class="task-summary-name">
                          <span>{{ taskDisplayName(task) }}</span>
                          <el-tag v-if="task.is_once_ephemeral" size="mini" type="warning">一次性</el-tag>
                          <el-tag v-if="task.is_once_ephemeral" size="mini" type="info">{{ onceActionLabel(task) }}</el-tag>
                          <el-tag v-if="task.is_once_ephemeral && task.once_date" size="mini">{{ task.once_date }}</el-tag>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column :resizable="false" label="音频资源" min-width="200">
                      <template slot-scope="{ row: task }">
                        <div
                          class="inline-edit-cell"
                          :class="{ 'is-saving': inlineEditCellSaving(task, 'audio'), 'is-saved': inlineEditCellSaved(task, 'audio'), 'is-error': inlineEditCellError(task, 'audio') }"
                          @dblclick.stop="startInlineTaskEdit(plan, task, 'audio')"
                        >
                          <template v-if="isInlineTaskEditing(plan, task, 'audio')">
                            <el-select
                              v-model="inlineTaskEditor.value"
                              filterable
                              size="mini"
                              placeholder="选择音频"
                              class="inline-task-editor"
                              @change="commitInlineTaskEdit"
                              @blur="commitInlineTaskEdit"
                              @visible-change="onInlineAudioVisibleChange"
                              @keyup.enter.native="commitInlineTaskEdit"
                            >
                              <el-option v-for="item in audioOptions" :key="item.value" :label="item.label" :value="item.value" />
                            </el-select>
                          </template>
                          <template v-else>
                            <span class="inline-edit-value">{{ task.audio || '—' }}</span>
                            <i v-if="inlineEditCellSaving(task, 'audio')" class="el-icon-loading inline-edit-saving" />
                            <el-tooltip v-else-if="inlineEditCellError(task, 'audio')" :content="inlineEditCellError(task, 'audio')" placement="top">
                              <i class="el-icon-warning inline-edit-error-dot" />
                            </el-tooltip>
                            <i v-else-if="inlineEditCellSaved(task, 'audio')" class="el-icon-circle-check inline-edit-saved" />
                            <i v-else class="el-icon-edit-outline inline-edit-icon" />
                          </template>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column :resizable="false" label="时间" min-width="200">
                      <template slot-scope="{ row: task }">
                        <div
                          class="inline-edit-cell"
                          :class="{ 'is-saving': inlineEditCellSaving(task, 'time'), 'is-saved': inlineEditCellSaved(task, 'time'), 'is-error': inlineEditCellError(task, 'time') }"
                          @dblclick.stop="startInlineTaskEdit(plan, task, 'time')"
                        >
                          <template v-if="isInlineTaskEditing(plan, task, 'time')">
                            <el-time-picker
                              v-model="inlineTaskEditor.value"
                              size="mini"
                              value-format="HH:mm:ss"
                              format="HH:mm:ss"
                              placeholder="播放时间"
                              class="inline-task-editor"
                              @change="commitInlineTaskEdit"
                              @blur="commitInlineTaskEdit"
                              @keyup.enter.native="commitInlineTaskEdit"
                            />
                          </template>
                          <template v-else>
                            <div class="task-summary-time">
                              <span class="task-time">{{ task.time || '--:--' }}</span>
                              <span class="summary-sep">/</span>
                              <span class="task-duration">{{ taskDurationLabel(task) }}</span>
                              <i v-if="inlineEditCellSaving(task, 'time')" class="el-icon-loading inline-edit-saving" />
                              <el-tooltip v-else-if="inlineEditCellError(task, 'time')" :content="inlineEditCellError(task, 'time')" placement="top">
                                <i class="el-icon-warning inline-edit-error-dot" />
                              </el-tooltip>
                              <i v-else-if="inlineEditCellSaved(task, 'time')" class="el-icon-circle-check inline-edit-saved" />
                              <i v-else class="el-icon-edit-outline inline-edit-icon" />
                            </div>
                          </template>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column :resizable="false" label="状态" width="90">
                      <template slot-scope="{ row: task }">
                        <el-tag :type="planTaskStatus(task).type" size="mini">{{ planTaskStatus(task).label }}</el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column :resizable="false" label="操作" width="120">
                      <template slot-scope="{ row: task }">
                        <template v-if="task._draftDirty">
                          <el-button type="primary" size="mini" @click="commitInlineTaskFinish(plan, task)">完成</el-button>
                          <el-button type="text" size="mini" @click="cancelInlineTaskDraft(plan, task)">取消</el-button>
                        </template>
                        <template v-else>
                          <el-button type="text" size="mini" @click="openTaskDrawer(plan, task)">编辑</el-button>
                          <el-button type="text" size="mini" @click="removePlanTask(plan, task)">删除</el-button>
                        </template>
                      </template>
                    </el-table-column>
                  </el-table>

                  <div class="plan-task-cards">
                    <div v-for="task in planVisibleTasks(plan)" :key="task.id" class="task-card">
                      <div class="task-card-header">
                        <div class="task-card-title">
                          <el-tooltip v-if="planConflictSummary(plan, task)" :content="planConflictSummary(plan, task)" placement="top">
                            <i class="el-icon-warning conflict-icon" />
                          </el-tooltip>
                          <span>{{ taskDisplayName(task) }}</span>
                        </div>
                        <el-tag :type="planTaskStatus(task).type" size="mini">{{ planTaskStatus(task).label }}</el-tag>
                      </div>
                      <div class="task-card-meta">
                        <div class="meta-item">
                          <span class="meta-label">时间</span>
                          <span class="meta-value">{{ task.time || '--:--' }}</span>
                        </div>
                        <div class="meta-item">
                          <span class="meta-label">时长</span>
                          <span class="meta-value">{{ taskDurationLabel(task) }}</span>
                        </div>
                      </div>
                      <div class="task-card-actions">
                        <el-button size="mini" @click="openTaskDrawer(plan, task)">编辑</el-button>
                        <el-button size="mini" type="text" @click="removePlanTask(plan, task)">删除</el-button>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" prop="name" label="方案名称" />
            <el-table-column :resizable="false" label="任务名" min-width="200">
              <template slot-scope="{ row }">
                <span>{{ planTaskNames(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="任务数" width="80">
              <template slot-scope="{ row }">
                <span
                  v-if="row.tasksLoading"
                  class="task-count-skeleton-bar"
                  aria-hidden="true"
                />
                <template v-else>
                  {{
                    row.tasksLoaded
                      ? planDisplayTaskCount(row)
                      : (row.taskCount !== undefined && row.taskCount !== null ? row.taskCount : '...')
                  }}
                </template>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" prop="status" label="状态" width="90">
              <template slot-scope="{ row }">
                <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="mini">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="isTableLoading('plans')" class="table-skeleton" aria-hidden="true">
            <div v-for="(cells, rowIndex) in tableSkeletonRows" :key="`plans-skeleton-${rowIndex}`" class="table-skeleton-row">
              <span
                v-for="(width, cellIndex) in cells"
                :key="`plans-skeleton-${rowIndex}-${cellIndex}`"
                class="table-skeleton-bar"
                :style="{ width }"
              />
            </div>
          </div>
        </div>
        <div v-else class="mobile-card-list">
          <div v-for="plan in visiblePlans" :key="`plan-mobile-${plan.id}`" class="mobile-card">
            <div class="mobile-card-head">
              <div>
                <div class="mobile-card-title">{{ plan.name || '未命名方案' }}</div>
                <div class="mobile-card-subtitle">{{ planTaskNames(plan) }}</div>
              </div>
              <el-tag :type="plan.status === '启用' ? 'success' : 'info'" size="mini">{{ plan.status }}</el-tag>
            </div>
            <div class="mobile-card-meta">
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">任务数</span>
                <span class="mobile-meta-value">
                  <span
                    v-if="plan.tasksLoading"
                    class="task-count-skeleton-bar"
                    aria-hidden="true"
                  />
                  <template v-else>
                    {{
                      plan.tasksLoaded
                        ? planDisplayTaskCount(plan)
                        : (plan.taskCount !== undefined && plan.taskCount !== null ? plan.taskCount : '...')
                    }}
                  </template>
                </span>
              </div>
            </div>
            <div class="mobile-card-actions">
              <el-button size="mini" plain @click="toggleMobilePlan(plan)">
                {{ plan.mobileExpanded ? '收起任务' : '展开任务' }}
              </el-button>
              <el-button size="mini" type="primary" plain @click="addPlanTask(plan)">添加任务</el-button>
              <el-button size="mini" @click="editSingle('plan', plan)">编辑方案</el-button>
              <el-button size="mini" type="text" @click="togglePlanCardStatus(plan)">
                {{ plan.status === '启用' ? '停用' : '启用' }}
              </el-button>
            </div>
            <div v-if="plan.mobileExpanded" class="mobile-plan-detail">
              <div v-if="plan.tasksLoaded && planVisibleTasks(plan).length" class="plan-timeline mobile-plan-timeline">
                <div class="plan-timeline-head">
                  <span class="plan-timeline-title">时间轴预览</span>
                  <span class="plan-timeline-count">{{ planDisplayTaskCount(plan) }} 个长期任务{{ planTaskCountHint(plan) }}</span>
                </div>
                <div class="plan-timeline-track">
                  <el-tooltip
                    v-for="slot in planTimelineSlots(plan)"
                    :key="`timeline-mobile-${plan.id}-${slot.hour}`"
                    :content="timelineTooltip(slot)"
                    placement="top"
                  >
                    <div class="plan-timeline-block" :style="timelineSlotStyle(slot, plan)" />
                  </el-tooltip>
                </div>
                <div class="plan-timeline-scale">
                  <span>00:00</span>
                  <span>12:00</span>
                  <span>24:00</span>
                </div>
              </div>
              <div v-if="!plan.tasksLoaded" class="note">点击“展开任务”后将加载该方案任务</div>
              <div v-else-if="!planVisibleTasks(plan).length" class="plan-task-empty">暂无任务，点击“添加任务”开始编辑。</div>
              <div v-else class="plan-task-cards is-mobile-visible">
                <div v-for="task in planVisibleTasks(plan)" :key="`plan-task-mobile-${task.id}`" class="task-card">
                  <div class="task-card-header">
                    <div class="task-card-title">
                      <el-tooltip v-if="planConflictSummary(plan, task)" :content="planConflictSummary(plan, task)" placement="top">
                        <i class="el-icon-warning conflict-icon" />
                      </el-tooltip>
                      <span>{{ taskDisplayName(task) }}</span>
                    </div>
                    <el-tag :type="planTaskStatus(task).type" size="mini">{{ planTaskStatus(task).label }}</el-tag>
                  </div>
                  <div class="task-card-meta">
                    <div class="meta-item">
                      <span class="meta-label">时间</span>
                      <span class="meta-value">{{ task.time || '--:--' }}</span>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">时长</span>
                      <span class="meta-value">{{ taskDurationLabel(task) }}</span>
                    </div>
                    <div class="meta-item">
                      <span class="meta-label">终端</span>
                      <span class="meta-value">{{ locationSummary(task.location) }}</span>
                    </div>
                  </div>
                  <div class="task-card-actions">
                    <el-button size="mini" @click="openTaskDrawer(plan, task)">编辑</el-button>
                    <el-button size="mini" type="text" @click="removePlanTask(plan, task)">删除</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 文件广播 -->
      <el-tab-pane label="文件广播" name="broadcasts">
        <div class="toolbar">
          <el-badge v-if="hasBroadcastDraft" :value="broadcastDraftCount" type="danger">
            <el-tag size="mini" type="warning" effect="dark">当前显示本地草稿</el-tag>
          </el-badge>
          <el-button
            v-if="hasBroadcastDraft"
            size="mini"
            type="danger"
            plain
            icon="el-icon-close"
            @click="discardBroadcastDraft"
          >放弃草稿</el-button>
          <el-button size="mini" @click="selectAll('broadcast')">全选</el-button>
          <el-button size="mini" :disabled="!hasBroadcastSelection" @click="clearSelection('broadcast')">取消</el-button>
          <el-button size="mini" type="success" :disabled="!hasBroadcastSelection" @click="setBroadcastStatus('执行中')">执行</el-button>
          <el-button size="mini" type="warning" :disabled="!hasBroadcastSelection" @click="setBroadcastStatus('停止')">停止</el-button>
          <el-button size="mini" :disabled="!hasBroadcastSelection" @click="setBroadcastStatus('暂停')">暂停</el-button>
          <el-button size="mini" :disabled="!hasBroadcastSelection" @click="setBroadcastStatus('恢复')">恢复</el-button>
          <el-button size="mini" :disabled="!hasBroadcastSelection" @click="setBroadcastStatus('启用')">启用</el-button>
          <el-button size="mini" :disabled="!hasBroadcastSelection" @click="setBroadcastStatus('停用')">停用</el-button>
          <el-button size="mini" type="primary" icon="el-icon-plus" @click="openBroadcastTaskDrawerForAdd">添加</el-button>
          <el-button size="mini" type="danger" icon="el-icon-delete" :disabled="!hasBroadcastSelection" @click="removeSelected('broadcast')">删除</el-button>
          <el-button size="mini" icon="el-icon-bell" :disabled="!hasBroadcastSelection" @click="openVolumeDialog('broadcast')">调整音量</el-button>
        </div>
        <div v-if="!isMobileLayout" class="table-shell" :class="{ 'is-loading': isTableLoading('broadcasts') }">
          <el-table
            ref="broadcastTable"
            :data="modules.broadcasts"
            :empty-text="tableEmptyText('broadcasts')"
            border
            size="small"
            @selection-change="(vals) => (selected.broadcasts = vals)"
          >
            <el-table-column :resizable="false" type="selection" width="55" />
            <el-table-column :resizable="false" label="任务名" min-width="220">
              <template slot-scope="{ row }">
                <div class="audio-cell inline-cell" :class="{ 'inline-cell-error': broadcastInlineCellError(row, 'name'), 'is-saving': isBroadcastInlineSaving(row, 'name') }">
                  <el-input
                    :value="broadcastDraftValue(row, 'name')"
                    size="mini"
                    placeholder="任务名称"
                    :title="broadcastInlineCellError(row, 'name')"
                    @change="(val) => commitBroadcastInlineName(row, val)"
                  />
                  <i v-if="isBroadcastInlineSaving(row, 'name')" class="el-icon-loading inline-cell-spinner" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="音频资源" min-width="200">
              <template slot-scope="{ row }">
                <div class="audio-cell inline-cell" :class="{ 'inline-cell-error': broadcastInlineCellError(row, 'audio'), 'is-saving': isBroadcastInlineSaving(row, 'audio') }">
                  <el-select
                    :value="broadcastDraftValue(row, 'audio')"
                    size="mini"
                    filterable
                    placeholder="选择音频"
                    :title="broadcastInlineCellError(row, 'audio')"
                    @change="(val) => commitBroadcastInlineAudio(row, val)"
                  >
                    <el-option v-for="item in broadcastAudioOptions" :key="item.id || item.value" :label="item.label" :value="item.value" />
                  </el-select>
                  <i v-if="isBroadcastInlineSaving(row, 'audio')" class="el-icon-loading inline-cell-spinner" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="播放时间" min-width="160">
              <template slot-scope="{ row }">
                <div class="inline-cell" :class="{ 'inline-cell-error': broadcastInlineCellError(row, 'time'), 'is-saving': isBroadcastInlineSaving(row, 'time') }">
                  <el-time-picker
                    :value="broadcastDraftValue(row, 'time') || ''"
                    value-format="HH:mm:ss"
                    format="HH:mm:ss"
                    placeholder="留空=手动"
                    size="mini"
                    :clearable="true"
                    :title="broadcastInlineCellError(row, 'time')"
                    @change="(val) => commitBroadcastInlineTime(row, val)"
                  />
                  <i v-if="isBroadcastInlineSaving(row, 'time')" class="el-icon-loading inline-cell-spinner" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="周期" min-width="220">
              <template slot-scope="{ row }">
                <el-tag v-if="isBroadcastManualOnly(row)" type="info" size="mini">手动播放</el-tag>
                <div v-else class="weekday-grid">
                  <span
                    v-for="day in weekdaysOptions"
                    :key="day"
                    class="weekday-cell"
                    :class="{ active: broadcastDraftWeekdays(row).includes(day) }"
                    @click="toggleBroadcastRowWeekday(row, day)"
                  >{{ day.replace('周', '') }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="播放时长" min-width="260">
              <template slot-scope="{ row }">
                <div class="duration-cell inline-cell" :class="{ 'inline-cell-error': broadcastInlineCellError(row, 'duration'), 'is-saving': isBroadcastInlineSaving(row, 'duration') }">
                  <el-select
                    :value="broadcastDraftDuration(row, 'mode')"
                    size="mini"
                    class="duration-mode"
                    placeholder="类型"
                    @change="(val) => commitBroadcastInlineDuration(row, { mode: val })"
                  >
                    <el-option label="循环 (次)" value="loop" />
                    <el-option label="时长" value="duration" />
                  </el-select>
                  <el-input-number
                    v-if="broadcastDraftDuration(row, 'mode') === 'loop'"
                    :value="Number(broadcastDraftDuration(row, 'loop')) || 1"
                    :min="1"
                    :controls="false"
                    size="mini"
                    @change="(val) => commitBroadcastInlineDuration(row, { loop: val })"
                  />
                  <el-input
                    v-else
                    :value="broadcastDraftDuration(row, 'duration') || ''"
                    size="mini"
                    placeholder="时长"
                    @change="(val) => commitBroadcastInlineDuration(row, { duration: val })"
                  />
                  <i v-if="isBroadcastInlineSaving(row, 'duration')" class="el-icon-loading inline-cell-spinner" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="终端地点" min-width="240">
              <template slot-scope="{ row }">
                <div class="inline-cell" :class="{ 'inline-cell-error': broadcastInlineCellError(row, 'location'), 'is-saving': isBroadcastInlineSaving(row, 'location') }">
                  <el-cascader
                    :value="broadcastDraftValue(row, 'location') || []"
                    :options="locationOptions"
                    :props="{ checkStrictly: true, multiple: true }"
                    filterable
                    clearable
                    size="mini"
                    placeholder="选择区域/终端"
                    :title="broadcastInlineCellError(row, 'location')"
                    @change="(val) => commitBroadcastInlineLocation(row, val)"
                  />
                  <i v-if="isBroadcastInlineSaving(row, 'location')" class="el-icon-loading inline-cell-spinner" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="音量" width="140">
              <template slot-scope="{ row }">
                <div class="volume-cell inline-cell" :class="{ 'inline-cell-error': broadcastInlineCellError(row, 'volume'), 'is-saving': isBroadcastInlineSaving(row, 'volume') }">
                  <el-input-number
                    :value="broadcastDraftValue(row, 'volume') !== undefined && broadcastDraftValue(row, 'volume') !== null ? Number(broadcastDraftValue(row, 'volume')) : undefined"
                    :min="0"
                    :max="100"
                    :controls="false"
                    size="mini"
                    :title="broadcastInlineCellError(row, 'volume')"
                    @change="(val) => commitBroadcastInlineVolume(row, val)"
                  />
                  <i v-if="isBroadcastInlineSaving(row, 'volume')" class="el-icon-loading inline-cell-spinner" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" prop="status" label="状态" width="90">
              <template slot-scope="{ row }">
                <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" fixed="right" label="操作" width="140">
              <template slot-scope="{ row }">
                <template v-if="isBroadcastRowDirty(row)">
                  <span class="broadcast-row-actions">
                    <el-button
                      type="primary"
                      size="mini"
                      :loading="isBroadcastRowFinishing(row)"
                      @click="commitBroadcastRowFinish(row)"
                    >完成</el-button>
                    <el-button type="text" size="mini" @click="cancelBroadcastRowDraft(row)">取消</el-button>
                  </span>
                </template>
                <template v-else>
                  <el-button type="primary" size="mini" plain @click="openBroadcastTaskDrawer(row)">编辑</el-button>
                  <el-button type="text" size="mini" @click="removeBroadcastRow(row)">删除</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="isTableLoading('broadcasts')" class="table-skeleton" aria-hidden="true">
            <div v-for="(cells, rowIndex) in tableSkeletonRows" :key="`broadcast-skeleton-${rowIndex}`" class="table-skeleton-row">
              <span
                v-for="(width, cellIndex) in cells"
                :key="`broadcast-skeleton-${rowIndex}-${cellIndex}`"
                class="table-skeleton-bar"
                :style="{ width }"
              />
            </div>
          </div>
        </div>
        <div v-else class="mobile-card-list">
          <div v-for="row in modules.broadcasts" :key="`broadcast-mobile-${row.id}`" class="mobile-card">
            <div class="mobile-card-head">
              <div>
                <div class="mobile-card-title">{{ row.name || '未命名广播任务' }}</div>
                <div class="mobile-card-subtitle">{{ rowAudioLabel(row) }}</div>
              </div>
              <div class="mobile-card-tag-group">
                <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
              </div>
            </div>
            <div class="mobile-card-meta">
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">时长</span>
                <span class="mobile-meta-value">{{ rowDurationLabel(row) }}</span>
              </div>
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">音量</span>
                <span class="mobile-meta-value">{{ row.volume }}%</span>
              </div>
              <div class="mobile-meta-item is-full">
                <span class="mobile-meta-label">终端</span>
                <span class="mobile-meta-value">{{ locationSummary(row.location) }}</span>
              </div>
            </div>
            <div class="mobile-card-actions">
              <el-button size="mini" @click="editSingle('broadcast', row)">编辑</el-button>
              <el-button size="mini" plain @click="openSingleVolumeDialog('broadcast', row)">音量</el-button>
              <el-button size="mini" type="primary" plain @click="setSingleRuntimeStatus('broadcast', row, '执行中')">执行</el-button>
              <el-button size="mini" type="text" @click="removeSingle('broadcast', row)">删除</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 采播管理 -->
      <!-- 临时隐藏“采播管理”标签；需要恢复时将 showLivecastsTab 改为 true。 -->
      <el-tab-pane v-if="showLivecastsTab" label="采播管理" name="livecasts">
        <div class="toolbar">
          <el-button size="mini" @click="selectAll('live')">全选</el-button>
          <el-button size="mini" :disabled="!hasLiveSelection" @click="clearSelection('live')">取消</el-button>
          <el-button size="mini" type="success" :disabled="!hasLiveSelection" @click="setLiveStatus('执行中')">执行</el-button>
          <el-button size="mini" type="warning" :disabled="!hasLiveSelection" @click="setLiveStatus('停止')">停止</el-button>
          <el-button size="mini" type="primary" icon="el-icon-plus" @click="addLiveRow">添加</el-button>
          <el-button size="mini" type="danger" icon="el-icon-delete" :disabled="!hasLiveSelection" @click="removeSelected('live')">删除</el-button>
          <el-button size="mini" :disabled="!hasLiveSelection" @click="setLiveStatus('启用')">启用</el-button>
          <el-button size="mini" :disabled="!hasLiveSelection" @click="setLiveStatus('停用')">停用</el-button>
          <el-button size="mini" icon="el-icon-bell" :disabled="!hasLiveSelection" @click="openVolumeDialog('live')">调整音量</el-button>
          <el-button size="mini" type="success" icon="el-icon-check" @click="finishEdit('live')">完成编辑</el-button>
        </div>
        <div v-if="!isMobileLayout" class="table-shell" :class="{ 'is-loading': isTableLoading('livecasts') }">
          <el-table
            ref="liveTable"
            :data="modules.livecasts"
            :empty-text="tableEmptyText('livecasts')"
            border
            size="small"
            @selection-change="(vals) => (selected.livecasts = vals)"
          >
            <el-table-column :resizable="false" type="selection" width="55" />
            <el-table-column :resizable="false" label="任务名" min-width="180">
              <template slot-scope="{ row }">
                <el-input v-model="row.name" size="mini" placeholder="任务名称" />
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="播放时间 / 时长" min-width="340">
              <template slot-scope="{ row }">
                <div class="time-cell">
                  <el-time-picker
                    v-model="row.time"
                    size="mini"
                    value-format="HH:mm"
                    format="HH:mm"
                    placeholder="播放时间"
                    @change="onLiveTimeChange"
                  />
                  <el-select v-model="row.durationMode" size="mini" class="duration-mode" placeholder="选择类型" @change="onDurationModeChange(row)">
                    <el-option label="循环 (次)" value="loop" />
                    <el-option label="时长 (分钟)" value="duration" />
                  </el-select>
                  <template v-if="row.durationMode !== 'loop'">
                    <el-input
                      v-model="row.duration"
                      size="mini"
                      placeholder="时长"
                      suffix-icon="el-icon-time"
                    />
                    <span class="unit-label">分钟</span>
                  </template>
                  <template v-else>
                    <el-input-number v-model="row.loop" :min="1" size="mini" />
                    <span class="unit-label">次</span>
                  </template>
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="终端地点" min-width="220">
              <template slot-scope="{ row }">
                <el-cascader
                  v-model="row.location"
                  :options="locationOptions"
                  :props="{ checkStrictly: true, multiple: true }"
                  filterable
                  clearable
                  size="mini"
                  placeholder="选择区域/终端"
                  @change="onLiveLocationChange(row, $event)"
                />
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="音量" width="140">
              <template slot-scope="{ row }">
                <div class="volume-cell">
                  <el-input-number v-model="row.volume" :min="0" :max="100" size="mini" />
                </div>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" prop="status" label="状态" width="90">
              <template slot-scope="{ row }">
                <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="操作" width="90">
              <template slot-scope="{ row }">
                <el-button type="text" size="mini" @click="removeLiveRow(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="isTableLoading('livecasts')" class="table-skeleton" aria-hidden="true">
            <div v-for="(cells, rowIndex) in tableSkeletonRows" :key="`live-skeleton-${rowIndex}`" class="table-skeleton-row">
              <span
                v-for="(width, cellIndex) in cells"
                :key="`live-skeleton-${rowIndex}-${cellIndex}`"
                class="table-skeleton-bar"
                :style="{ width }"
              />
            </div>
          </div>
        </div>
        <div v-else class="mobile-card-list">
          <div v-for="row in modules.livecasts" :key="`live-mobile-${row.id}`" class="mobile-card">
            <div class="mobile-card-head">
              <div>
                <div class="mobile-card-title">{{ row.name || '未命名采播任务' }}</div>
              </div>
              <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
            </div>
            <div class="mobile-card-meta">
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">播放时间</span>
                <span class="mobile-meta-value">{{ rowStartTimeLabel(row) }}</span>
              </div>
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">时长</span>
                <span class="mobile-meta-value">{{ rowDurationLabel(row) }}</span>
              </div>
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">音量</span>
                <span class="mobile-meta-value">{{ row.volume }}%</span>
              </div>
              <div class="mobile-meta-item is-full">
                <span class="mobile-meta-label">终端</span>
                <span class="mobile-meta-value">{{ locationSummary(row.location) }}</span>
              </div>
            </div>
            <div class="mobile-card-actions">
              <el-button size="mini" @click="editSingle('live', row)">编辑</el-button>
              <el-button size="mini" plain @click="openSingleVolumeDialog('live', row)">音量</el-button>
              <el-button size="mini" type="primary" plain @click="setSingleRuntimeStatus('live', row, '执行中')">执行</el-button>
              <el-button size="mini" type="text" @click="removeSingle('live', row)">删除</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="即时播放" name="runtimePlays">
        <div class="toolbar">
          <el-button size="mini" icon="el-icon-refresh" @click="refreshRuntimePlays">刷新列表</el-button>
        </div>
        <div v-if="!isMobileLayout" class="table-shell" :class="{ 'is-loading': isTableLoading('runtimePlays') }">
          <el-table
            ref="runtimePlayTable"
            :data="modules.runtimePlays"
            :empty-text="tableEmptyText('runtimePlays')"
            border
            size="small"
          >
            <el-table-column :resizable="false" prop="task_id" label="任务ID" width="120" />
            <el-table-column :resizable="false" label="媒体" min-width="220">
              <template slot-scope="{ row }">
                <span>{{ row.media_name || row.task_name || '--' }}</span>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="终端" min-width="220">
              <template slot-scope="{ row }">
                <span>{{ runtimePlayTerminalLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="播放模式" width="170">
              <template slot-scope="{ row }">
                <span>{{ runtimePlayLengthLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="音量" width="110">
              <template slot-scope="{ row }">
                <span>{{ row.volume }}%</span>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" prop="status" label="状态" width="100">
              <template slot-scope="{ row }">
                <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="创建时间" min-width="180">
              <template slot-scope="{ row }">
                <span>{{ runtimePlayCreatedLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column :resizable="false" label="操作" width="100">
              <template slot-scope="{ row }">
                <el-button
                  size="mini"
                  type="text"
                  :disabled="String(row.status || '').trim() === '停止'"
                  @click="stopRuntimePlay(row)"
                >
                  停止
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="isTableLoading('runtimePlays')" class="table-skeleton" aria-hidden="true">
            <div v-for="(cells, rowIndex) in tableSkeletonRows" :key="`runtime-play-skeleton-${rowIndex}`" class="table-skeleton-row">
              <span
                v-for="(width, cellIndex) in cells"
                :key="`runtime-play-skeleton-${rowIndex}-${cellIndex}`"
                class="table-skeleton-bar"
                :style="{ width }"
              />
            </div>
          </div>
        </div>
        <div v-else class="mobile-card-list">
          <div v-for="row in modules.runtimePlays" :key="`runtime-play-mobile-${row.task_id || row.id}`" class="mobile-card">
            <div class="mobile-card-head">
              <div>
                <div class="mobile-card-title">{{ row.media_name || row.task_name || '未命名即时播放' }}</div>
                <div class="mobile-card-subtitle">{{ runtimePlayTerminalLabel(row) }}</div>
              </div>
              <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
            </div>
            <div class="mobile-card-meta">
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">模式</span>
                <span class="mobile-meta-value">{{ runtimePlayLengthLabel(row) }}</span>
              </div>
              <div class="mobile-meta-item">
                <span class="mobile-meta-label">音量</span>
                <span class="mobile-meta-value">{{ row.volume }}%</span>
              </div>
              <div class="mobile-meta-item is-full">
                <span class="mobile-meta-label">创建时间</span>
                <span class="mobile-meta-value">{{ runtimePlayCreatedLabel(row) }}</span>
              </div>
            </div>
            <div class="mobile-card-actions">
              <el-button
                size="mini"
                type="warning"
                plain
                :disabled="String(row.status || '').trim() === '停止'"
                @click="stopRuntimePlay(row)"
              >
                停止
              </el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 方案新增/修改 -->
    <el-dialog :title="dialogTitle" :visible.sync="dialog.visible" :width="dialogWidth">
      <el-form label-width="80px" size="small">
        <el-form-item label="名称">
          <el-input v-model="dialog.form.name" placeholder="请输入名称" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitDialog">保存</el-button>
      </span>
    </el-dialog>

    <!-- 批量修改 -->
    <el-dialog title="批量修改任务" :visible.sync="batchDialog.visible" :width="batchDialogWidth">
      <el-form label-width="90px" size="small">
        <el-form-item label="音量">
          <el-input-number v-model="batchDialog.volume" :min="0" :max="100" />
          <span class="note">留空则不修改</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="batchDialog.status" placeholder="保持不变">
            <el-option label="启用" value="启用" />
            <el-option label="停用" value="停用" />
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="batchDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitBatch">应用</el-button>
      </span>
    </el-dialog>

    <!-- 音量统一调整 -->
    <el-dialog title="统一调整音量" :visible.sync="volumeDialog.visible" :width="volumeDialogWidth">
      <p>选择的{{ volumeTargetLabel }}将应用以下音量：</p>
      <el-input-number v-model="volumeDialog.value" :min="0" :max="100" />
      <span slot="footer">
        <el-button @click="volumeDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="applyVolume">确定</el-button>
      </span>
    </el-dialog>

    <el-drawer
      :visible.sync="onceChangesDrawer.visible"
      :direction="taskDrawerDirection"
      :size="taskDrawerSize"
      :with-header="false"
      :append-to-body="true"
      :custom-class="isMobileLayout ? 'once-changes-drawer once-changes-drawer-mobile' : 'once-changes-drawer'"
      @close="closeOnceChangesDrawer"
    >
      <div class="task-drawer once-drawer">
        <div class="task-drawer-header">
          <div>
            <div class="drawer-title">临时变更面板</div>
            <div class="drawer-sub">
              {{ onceChangesDrawer.planName ? `${onceChangesDrawer.planName} 的一次性迁移、互换和取消任务都集中展示在这里。` : '集中查看和编辑一次性迁移、互换、取消任务，不会改动长期作息。' }}
            </div>
          </div>
          <el-button type="text" icon="el-icon-close" @click="closeOnceChangesDrawer" />
        </div>

        <div class="task-drawer-body once-drawer-body">
          <div v-if="!onceDrawerGroups.length" class="once-drawer-empty">
            {{ onceDrawerEmptyMessage }}
          </div>
          <div v-else class="once-drawer-groups">
            <section v-for="group in onceDrawerGroups" :key="`${group.dateKey}-${group.actionKey}-${group.overrideId}`" class="once-group-card">
              <div class="once-group-head">
                <div>
                  <div class="once-group-date">{{ group.dateKey || '未设置日期' }}</div>
                  <div class="once-group-meta">{{ group.actionLabel }} · {{ group.items.length }} 条</div>
                </div>
                <div class="once-group-actions">
                  <el-tag size="mini" type="info">{{ group.actionLabel }}</el-tag>
                  <el-button v-if="group.canUndo" size="mini" type="warning" plain @click="undoOncePanelGroup(group)">撤销整批</el-button>
                </div>
              </div>

              <div class="once-group-list">
                <article v-for="item in group.items" :key="`${item.overrideId}-${item.onceTaskId || item.onceAction || item.taskLabel}`" class="once-item-card">
                  <div class="once-item-main">
                    <div class="once-item-title-row">
                      <div class="once-item-title">{{ item.taskLabel || '一次性任务' }}</div>
                      <div class="once-item-time">{{ item.time || '—' }}</div>
                    </div>
                    <div class="once-item-sub">
                      <span>{{ item.scheduleName || '未命名方案' }}</span>
                      <span>{{ onceItemSourceText(item) }}</span>
                    </div>
                    <div class="once-item-summary">{{ oncePanelSummary(item) || '音频、时间和时长信息待补充。' }}</div>
                    <div v-if="item.summaryOnly" class="once-item-summary">{{ item.note }}</div>
                    <div v-if="!item.summaryOnly" class="once-item-terminal">
                      <span>终端：{{ item.terminalnames && item.terminalnames.length ? item.terminalnames.join('，') : '—' }}</span>
                      <span>音量：{{ item.hasVolume ? item.volume : '—' }}</span>
                    </div>
                  </div>
                  <div v-if="item.canEdit || item.canDelete" class="once-item-actions">
                    <el-button
                      v-if="item.canEdit"
                      size="mini"
                      type="primary"
                      plain
                      :disabled="!resolvePlanByName(item.scheduleName)"
                      @click="editOncePanelItem(resolvePlanByName(item.scheduleName), item)"
                    >编辑</el-button>
                    <el-button v-if="item.canDelete" size="mini" type="danger" plain @click="deleteOncePanelItem(item)">删除</el-button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      :visible.sync="taskDrawer.visible"
      :direction="taskDrawerDirection"
      :size="taskDrawerSize"
      :with-header="false"
      :append-to-body="true"
      :custom-class="isMobileLayout ? 'task-editor-drawer task-editor-drawer-mobile' : 'task-editor-drawer'"
      @close="closeTaskDrawer"
    >
      <div class="task-drawer">
        <div class="task-drawer-header">
          <div>
            <div class="drawer-title">{{ taskDrawerTitle }}</div>
            <div class="drawer-sub">{{ taskDrawerSubtitle }}</div>
          </div>
          <el-button type="text" icon="el-icon-close" @click="closeTaskDrawer" />
        </div>

        <div v-if="taskDrawer.draft" class="task-drawer-body">
          <el-form label-position="top" size="small">
            <div v-if="taskDrawer.isOnceOverride && taskDrawer.sourceSummary" class="once-drawer-banner">
              {{ taskDrawer.sourceSummary }}。这里的修改只作用于本次临时任务，不影响原长期作息。
            </div>
            <el-form-item
              data-drawer-field="customName"
              class="drawer-required-item"
              :error="taskDrawerFieldError('customName')"
            >
              <template slot="label">
                任务名
                <span v-if="taskDrawerFieldAlert('customName')" class="field-alert-icon">⚠️</span>
              </template>
              <el-input
                v-model="taskDrawer.draft.customName"
                placeholder="自定义任务名"
                @input="onTaskDrawerFieldChange('customName')"
              />
            </el-form-item>
            <el-form-item
              data-drawer-field="audio"
              class="drawer-required-item"
              :error="taskDrawerFieldError('audio')"
            >
              <template slot="label">
                音频资源
                <span v-if="taskDrawerFieldAlert('audio')" class="field-alert-icon">⚠️</span>
              </template>
              <el-select
                v-model="taskDrawer.draft.audio"
                filterable
                placeholder="选择音频"
                size="small"
                @change="onTaskDrawerAudioChange"
              >
                <el-option v-for="item in filteredAudioOptions" :key="item.id" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>

            <div class="drawer-stack">
              <el-form-item
                data-drawer-field="time"
                class="drawer-required-item"
                :error="taskDrawerFieldError('time')"
              >
                <template slot="label">
                  播放时间
                  <span v-if="taskDrawerFieldAlert('time')" class="field-alert-icon">⚠️</span>
                </template>
                <el-time-picker
                  v-model="taskDrawer.draft.time"
                  size="small"
                  value-format="HH:mm:ss"
                  format="HH:mm:ss"
                  placeholder="播放时间"
                  @change="onTaskDrawerFieldChange('time')"
                />
              </el-form-item>
              <el-form-item
                data-drawer-field="duration"
                class="drawer-required-item"
                :error="taskDrawerFieldError('duration')"
              >
                <template slot="label">
                  时长设置
                  <span v-if="taskDrawerFieldAlert('duration')" class="field-alert-icon">⚠️</span>
                </template>
                <div class="duration-row">
                  <template v-if="taskDrawer.draft.durationMode !== 'loop'">
                    <el-input
                      v-model="taskDrawer.draft.duration"
                      size="small"
                      placeholder="时长"
                      @input="onTaskDrawerFieldChange('duration')"
                    />
                    <span class="unit-label">秒</span>
                  </template>
                  <template v-else>
                    <el-input-number v-model="taskDrawer.draft.loop" :min="1" size="small" @change="onTaskDrawerFieldChange('duration')" />
                    <span class="unit-label">次</span>
                  </template>
                  <el-select
                    v-model="taskDrawer.draft.durationMode"
                    size="small"
                    placeholder="选择类型"
                    @change="onTaskDrawerDurationModeChange"
                  >
                    <el-option label="循环 (次)" value="loop" />
                    <el-option label="时长 (秒)" value="duration" />
                  </el-select>
                </div>
              </el-form-item>
            </div>

            <el-form-item
              v-if="!taskDrawer.isOnceOverride"
              data-drawer-field="weekdays"
              class="drawer-required-item"
              :error="taskDrawerFieldError('weekdays')"
            >
              <template slot="label">
                执行周期
                <span v-if="taskDrawerFieldAlert('weekdays')" class="field-alert-icon">⚠️</span>
              </template>
              <div class="drawer-week-header">
                <span class="drawer-week-hint">勾选要执行的星期</span>
                <el-button type="text" size="mini" class="week-toggle" @click="toggleWeekdays(taskDrawer.draft)">
                  {{ isAllWeekdays(taskDrawer.draft) ? '取消全选' : '全选' }}
                </el-button>
              </div>
              <div class="week-group-wrap" :class="{ 'is-error': taskDrawerFieldAlert('weekdays') }">
                <el-checkbox-group
                  v-model="taskDrawer.draft.weekdays"
                  size="mini"
                  class="week-group"
                  @change="onTaskDrawerFieldChange('weekdays')"
                >
                  <el-checkbox v-for="day in weekdaysOptions" :key="day" :label="day">{{ day }}</el-checkbox>
                </el-checkbox-group>
              </div>
            </el-form-item>

            <el-form-item
              data-drawer-field="dateRange"
              class="drawer-required-item"
              :error="taskDrawerFieldError('dateRange')"
            >
              <template slot="label">
                {{ taskDrawer.isOnceOverride ? '执行日期' : '时效范围' }}
                <span v-if="taskDrawerFieldAlert('dateRange')" class="field-alert-icon">⚠️</span>
              </template>
              <el-date-picker
                v-model="taskDrawer.draft.dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="yyyy-MM-dd"
                size="small"
                @change="onTaskDrawerFieldChange('dateRange')"
              />
            </el-form-item>

            <el-form-item
              data-drawer-field="location"
              class="drawer-required-item"
              :error="taskDrawerFieldError('location')"
            >
              <template slot="label">
                终端地点
                <span v-if="taskDrawerFieldAlert('location')" class="field-alert-icon">⚠️</span>
              </template>
              <el-cascader
                v-model="taskDrawer.draft.location"
                :options="locationOptions"
                :props="{ checkStrictly: true, multiple: true }"
                filterable
                clearable
                size="small"
                placeholder="选择区域/终端"
                @change="onTaskDrawerLocationChange"
              />
            </el-form-item>

            <div class="drawer-grid">
              <el-form-item label="音量">
                <el-input-number v-model="taskDrawer.draft.volume" :min="0" :max="100" size="small" />
              </el-form-item>
              <el-form-item v-if="taskDrawer.kind === 'plan'" label="启用状态">
                <el-switch v-model="taskDrawer.draft.powerOn" active-text="启用" inactive-text="停用" />
              </el-form-item>
              <el-form-item label="预开电源">
                <el-input-number v-model="taskDrawer.draft.prepower" :min="0" :max="120" :step="1" size="small" />
              </el-form-item>
              <el-form-item label="等级">
                <el-input-number v-model="taskDrawer.draft.level" :min="0" :max="100" :step="1" size="small" />
              </el-form-item>
            </div>

            <template v-if="taskDrawer.kind === 'plan'">
              <el-divider content-position="left">高级设置</el-divider>

              <div class="drawer-grid">
                <el-form-item label="发送模式">
                  <el-select v-model="taskDrawer.draft.sendMode" size="small">
                    <el-option label="单播" value="单播" />
                    <el-option label="组播" value="组播" />
                    <el-option label="广播" value="广播" />
                  </el-select>
                </el-form-item>
                <el-form-item label="播放模式">
                  <el-select v-model="taskDrawer.draft.playMode" size="small">
                    <el-option label="串行" value="串行" />
                    <el-option label="并行" value="并行" />
                    <el-option label="循环" value="循环" />
                  </el-select>
                </el-form-item>
              </div>

              <el-form-item label="LED 播报">
                <el-input v-model="taskDrawer.draft.ledSetting" placeholder="LED 播报设置" />
              </el-form-item>
            </template>
          </el-form>
        </div>

        <div class="task-drawer-footer">
          <el-button size="small" @click="closeTaskDrawer">取消</el-button>
          <el-button type="primary" size="small" :disabled="taskDrawerSaving" :loading="taskDrawerSaving" @click="saveTaskDrawer">完成编辑</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>
<script>
import {
  fetchAllAudio,
  fetchAllLoc,
  fetchAllTerminalData,
  fetchAllTask,
  fetchBroadcasts,
  fetchLivecasts,
  fetchRuntimePlayTasks,
  stopRuntimePlayTasks,
  fetchBroadcastSchedulesSummary,
  fetchTaskOverrides,
  updateOnceOverrideTask,
  deleteOnceOverrideTask,
  undoOnceOverride,
  fetchScheduleTasks,
  setTaskStatus,
  setScheduleStatus,
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  updateSingleTask,
  deleteSingleTask,
  addBroadcastImmediate,
  deleteBroadcastImmediate,
  commitBroadcastFields,
  updateBroadcastSchedules,
  updateAllTask
} from '@/api/dataService'
import {
  areBroadcastRowsSubstantivelyEqual,
  clearBroadcastDraft,
  clearPlanDraft,
  diffPlanDraft,
  discardInvalidPlanDrafts,
  getDefaultSchedulerData,
  getDefaultSchedulerDrafts,
  hasSchedulerDirtyScope,
  loadSchedulerDrafts,
  recoverInvalidPlanDrafts,
  saveBroadcastDraft,
  savePlanDraft
} from '@/utils/schedulerStorage'
import { emitAssistantRefresh, offAssistantRefresh, onAssistantRefresh } from '@/utils/assistantRefreshBus'
import { buildOnceDisplaySnapshot, countOnceSpecs, groupOncePanelItems } from '@/utils/onceTaskSpecs'

const extractList = (payload) => {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

const DEFAULT_TEMPLATE_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五']
const UNASSIGNED_ZONE_LABEL = '无分区终端'
const TABLE_SKELETON_ROWS = [
  ['12%', '28%', '18%', '12%', '16%'],
  ['10%', '22%', '24%', '14%', '18%'],
  ['14%', '30%', '16%', '10%', '20%'],
  ['11%', '26%', '20%', '15%', '17%'],
  ['13%', '24%', '22%', '12%', '19%']
]
const SAVE_FEEDBACK_AUTO_HIDE_MS = 1800

const createSaveFeedbackState = () => ({
  visible: false,
  status: 'idle',
  steps: [],
  currentStepIndex: -1,
  currentLabel: '',
  percent: 0,
  message: '',
  hideTimer: null
})

const DEFAULT_SCHEDULE_TEMPLATE = {
  tasks: [
    {
      taskname: '第一节课上课铃',
      customName: '第一节课上课铃',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '08:20:00',
      startdate: '2026-01-14',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '早读开始铃',
      customName: '早读开始铃',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '07:50:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '第一节课下课铃',
      customName: '第一节课下课铃',
      audio: '下课铃',
      medianame: '下课铃',
      starttime: '09:00:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 21,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '第二节课上课铃',
      customName: '第二节课上课铃',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '09:10:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '大课间',
      customName: '大课间',
      audio: '大课间',
      medianame: '大课间',
      starttime: '09:50:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 8,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '第三节课上课铃',
      customName: '第三节课上课铃',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '10:10:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '第三节课下课铃',
      customName: '第三节课下课铃',
      audio: '下课铃',
      medianame: '下课铃',
      starttime: '10:50:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 21,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '第四节课上课铃',
      customName: '第四节课上课铃',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '11:00:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '第四节课下课铃',
      customName: '第四节课下课铃',
      audio: '下课铃',
      medianame: '下课铃',
      starttime: '11:40:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 1,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '午休结束铃',
      customName: '午休结束铃',
      audio: '下课铃',
      medianame: '下课铃',
      starttime: '13:50:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 1,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '下午第一节课上课',
      customName: '下午第一节课上课',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '14:25:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '下午第一节课下课',
      customName: '下午第一节课下课',
      audio: '下课铃',
      medianame: '下课铃',
      starttime: '15:05:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 21,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '下午第二节课上课',
      customName: '下午第二节课上课',
      audio: '上课铃',
      medianame: '上课铃',
      starttime: '15:15:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 20,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    },
    {
      taskname: '快乐放学季',
      customName: '快乐放学季',
      audio: '下课铃',
      medianame: '下课铃',
      starttime: '16:15:00',
      startdate: '2026-01-18',
      enddate: '2039-01-31',
      timelength: 1,
      timelengthtype: 1,
      volume: 80,
      weekdays: DEFAULT_TEMPLATE_WEEKDAYS
    }
  ]
}

export default {
  name: 'TaskSchedulerPage',
  data() {
    return {
      activeTab: 'plans',
      // 临时关闭“采播管理”页签显示；恢复入口时改为 true。
      showLivecastsTab: false,
      modules: {
        plans: [],
        broadcasts: [],
        livecasts: [],
        runtimePlays: [],
        directories: []
      },
      hidePlanCount: 0,
      selected: {
        plans: [],
        broadcasts: [],
        livecasts: [],
        runtimePlays: []
      },
      dialog: {
        visible: false,
        type: 'plan',
        mode: 'add',
        form: {
          name: ''
        }
      },
      batchDialog: {
        visible: false,
        volume: null,
        status: ''
      },
      volumeDialog: {
        visible: false,
        target: '',
        value: 50
      },
      taskDrawer: {
        visible: false,
        plan: null,
        task: null,
        draft: null,
        isNew: false,
        isOnceOverride: false,
        overrideId: '',
        onceTaskId: '',
        sourceSummary: '',
        kind: 'plan',
        broadcastRow: null
      },
      onceChangesDrawer: {
        visible: false,
        planName: '',
        date: ''
      },
      onceRoutePanelKey: '',
      taskDrawerErrors: {},
      taskDrawerMidnightWarning: false,
      taskDrawerSaving: false,
      inlineTaskEditor: {
        active: false,
        plan: null,
        task: null,
        field: '',
        value: '',
        // Per-cell save state machine for immediate-write (P-B):
        // idle → saving → saved | error. 'saving' blocks re-entry (idempotency
        // gate); 'saved' carries savedAt so a transition can be made visible
        // (stylist owns the actual animation) and is NOT auto-cleared here.
        status: 'idle',
        savedAt: 0
      },
      // Field-level error store, keyed by `${taskId}__${field}`. A non-empty
      // entry drives the cell's red dot + hover reason (rendered by stylist).
      inlineEditErrors: {},
      // Broadcast inline-edit field error store (separate scope from plans),
      // keyed by `${broadcastTaskId}__${field}`. Drives the broadcast cell's
      // error indicator + the per-cell saving guard (T57 批1).
      broadcastInlineErrors: {},
      broadcastInlineSaving: {},
      // Per-row "完成" in-flight guard, keyed by broadcast task id, so a
      // double-click on 完成 cannot fire two batch PUTs for the same row.
      broadcastRowFinishing: {},
      // T62 per-row inline draft store, kept OFF the modules.broadcasts rows so
      // staging an edit never mutates a reactive row (which would fire the
      // deep watcher → syncBroadcastDraftState → dirtyScopes染'broadcasts' →
      // global "保存上传" badge false-positive; critic r1 f1). Keyed by task id:
      //   broadcastRowDrafts[taskId] = { patch: { field: { value, spec } } }
      // The cell editors read an overlay (broadcastDraftValue) so the staged
      // value shows without touching the row; 完成 replays the specs into one
      // commitBroadcastFields PUT, 取消 just drops the entry (row was never
      // changed). Mirrors plans T42's "don't mutate the real row"真因.
      broadcastRowDrafts: {},
      audioOptions: [],
      locationOptions: [],
      hasReliableLocationOptions: false,
      zoneLookup: {},
      zoneValueMap: {},
      terminalIdMap: {},
      terminalNameZoneMap: {},
      schedulePayload: {},
      taskOverrides: [],
      draftState: getDefaultSchedulerDrafts(),
      lastSyncedPlans: [],
      lastSyncedBroadcasts: [],
      lastSyncedBroadcastBaseSnapshot: [],
      saveFeedback: createSaveFeedbackState(),
      loading: false,
      persisting: false,
      busyActionKey: '',
      tableSkeletonRows: TABLE_SKELETON_ROWS,
      tableLoadingByTab: {
        plans: true,
        broadcasts: false,
        livecasts: false,
        runtimePlays: false
      },
      tableLoadedByTab: {
        plans: false,
        broadcasts: false,
        livecasts: false,
        runtimePlays: false
      },
      suspendBroadcastDraftSync: false,
      broadcastDraftSyncSuspendDepth: 0,
      broadcastsLoaded: false,
      broadcastsLoading: false,
      // T36 Phase 2 M1: in-flight guard for the immediate "添加" handler so
      // a quick double-click can't fire two POST /data/broadcasts in parallel.
      addingBroadcast: false,
      livecastsLoaded: false,
      livecastsLoading: false,
      runtimePlaysLoaded: false,
      runtimePlaysLoading: false,
      runtimePlayPollTimer: null,
      invalidPlanDraftPromptKey: '',
      legacyPlanDraftPromptShown: false,
      weekdaysOptions: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    }
  },
  computed: {
    isMobileLayout() {
      return this.$store?.state?.app?.device === 'mobile'
    },
    dialogWidth() {
      return this.isMobileLayout ? '92%' : '360px'
    },
    batchDialogWidth() {
      return this.isMobileLayout ? '94%' : '420px'
    },
    volumeDialogWidth() {
      return this.isMobileLayout ? '92%' : '360px'
    },
    taskDrawerDirection() {
      return this.isMobileLayout ? 'btt' : 'rtl'
    },
    taskDrawerSize() {
      return this.isMobileLayout ? '100%' : '420px'
    },
    filteredAudioOptions() {
      const kind = this.taskDrawer && this.taskDrawer.kind ? this.taskDrawer.kind : 'plan'
      if (kind === 'broadcast') {
        return (this.audioOptions || []).filter((item) => Number(item && item.folderid) === 2)
      }
      return this.audioOptions || []
    },
    // 批3: the inline broadcast audio dropdown always scopes to the file-broadcast
    // library (folderid===2), regardless of the drawer state — the f2/f3 same-name
    // / different-mediaid collision is avoided by this scope + stripping mediaid on
    // commit so resolve_media_id re-derives from the name (GLOSSARY 2026-06-03).
    broadcastAudioOptions() {
      return (this.audioOptions || []).filter((item) => Number(item && item.folderid) === 2)
    },
    visiblePlans() {
      const list = Array.isArray(this.modules.plans) ? this.modules.plans : []
      if (!this.hidePlanCount) return list
      return list.slice(this.hidePlanCount)
    },
    dialogTitle() {
      const map = { plan: '作息方案', broadcast: '文件广播', live: '采播管理' }
      const name = map[this.dialog.type] || '项'
      return `${this.dialog.mode === 'add' ? '添加' : '修改'}${name}`
    },
    volumeTargetLabel() {
      if (this.volumeDialog.target === 'broadcast') return '文件广播'
      if (this.volumeDialog.target === 'live') return '采播任务'
      return '任务'
    },
    hasPlanSelection() {
      return Array.isArray(this.selected?.plans) && this.selected.plans.length > 0
    },
    hasPlanDraft() {
      return hasSchedulerDirtyScope('plans', this.draftState)
    },
    planDraftCount() {
      const dirtyIds = Array.isArray(this.draftState?.planDirtyIds) ? this.draftState.planDirtyIds : []
      const deletedIds = Array.isArray(this.draftState?.planDeletedIds) ? this.draftState.planDeletedIds : []
      return new Set([...dirtyIds, ...deletedIds].map((item) => String(item || '').trim()).filter((item) => item)).size
    },
    hasBroadcastSelection() {
      return Array.isArray(this.selected?.broadcasts) && this.selected.broadcasts.length > 0
    },
    hasLiveSelection() {
      return Array.isArray(this.selected?.livecasts) && this.selected.livecasts.length > 0
    },
    hasBroadcastDraft() {
      return hasSchedulerDirtyScope('broadcasts', this.draftState)
    },
    broadcastDraftCount() {
      const dirtyIds = Array.isArray(this.draftState?.broadcastDirtyIds) ? this.draftState.broadcastDirtyIds : []
      const deletedIds = Array.isArray(this.draftState?.broadcastDeletedIds) ? this.draftState.broadcastDeletedIds : []
      return new Set([...dirtyIds, ...deletedIds].map((item) => String(item || '').trim()).filter((item) => item)).size
    },
    selectedBroadcastCount() {
      return Array.isArray(this.selected?.broadcasts) ? this.selected.broadcasts.length : 0
    },
    selectedBroadcastPreview() {
      const rows = Array.isArray(this.selected?.broadcasts) ? this.selected.broadcasts : []
      if (!rows.length) return '请先在列表中勾选要处理的文件广播任务。'
      const names = rows
        .map((row) => String(row?.name || row?.audio || row?.medianame || '未命名任务').trim())
        .filter((item) => item)
      if (!names.length) return '已选择文件广播任务'
      if (names.length <= 3) return names.join('、')
      return `${names.slice(0, 3).join('、')} 等 ${names.length} 项`
    },
    taskDrawerTitle() {
      if (!this.taskDrawer.plan) return '任务编辑'
      const planName = this.taskDrawer.plan?.name || '作息方案'
      if (this.taskDrawer.isOnceOverride) return `编辑临时任务 · ${planName}`
      return this.taskDrawer.isNew ? `新建任务 · ${planName}` : `编辑任务 · ${planName}`
    },
    taskDrawerSubtitle() {
      if (this.taskDrawer.isOnceOverride) {
        return '这里修改的是一次性临时任务，保存后会同步到远端临时任务，不会改动长期作息。'
      }
      return '在这里集中修改任务参数，完成后记得点击“完成编辑”。'
    },
    totalOnceChangeCount() {
      return countOnceSpecs(this.activeOnceOverridesForPlan(''))
    },
    onceDrawerGroups() {
      return groupOncePanelItems(this.activeOnceOverridesForPlan(this.onceChangesDrawer.planName), {
        scheduleName: this.onceChangesDrawer.planName,
        date: this.onceChangesDrawer.date
      })
    },
    onceDrawerEmptyMessage() {
      if (this.onceChangesDrawer.planName || this.onceChangesDrawer.date) {
        return '当前筛选条件下暂无临时变更。'
      }
      return '暂无临时变更。'
    },
    saveFeedbackTitle() {
      if (this.saveFeedback.status === 'success') return '保存上传完成'
      if (this.saveFeedback.status === 'error') return '保存上传失败'
      return '正在保存上传'
    },
    saveFeedbackStepCounter() {
      const total = Array.isArray(this.saveFeedback.steps) ? this.saveFeedback.steps.length : 0
      if (!total) return '0 / 0'
      if (this.saveFeedback.status === 'success') return `${total} / ${total}`
      const current = Math.min(Math.max(this.saveFeedback.currentStepIndex + 1, 1), total)
      return `${current} / ${total}`
    },
    saveFeedbackProgressStatus() {
      if (this.saveFeedback.status === 'success') return 'success'
      if (this.saveFeedback.status === 'error') return 'exception'
      return undefined
    },
    hasBusyAction() {
      return Boolean(this.busyActionKey)
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
    },
    '$route.query': {
      deep: true,
      handler() {
        this.onceRoutePanelKey = ''
        this.applyOnceDrawerRouteQuery()
      }
    }
  },
  created() {
    // Component-level record of plan names already warmed (see
    // warmSuspectPlanTaskCounts). A plain Set, not reactive state — it is
    // internal bookkeeping that is never rendered. Survives across refreshes
    // (plan objects are rebuilt each refresh, so a per-object flag would not).
    this.warmedPlanNames = new Set()
    this.loadDraftState()
    this.bootstrap()
    onAssistantRefresh(this.handleAssistantRefresh)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload)
    }
  },
  beforeDestroy() {
    offAssistantRefresh(this.handleAssistantRefresh)
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload)
    }
    this.stopRuntimePlayPolling()
    this.clearSaveFeedbackHideTimer()
  },
  methods: {
    clearSaveFeedbackHideTimer() {
      if (!this.saveFeedback?.hideTimer) return
      clearTimeout(this.saveFeedback.hideTimer)
      this.saveFeedback.hideTimer = null
    },
    resetSaveFeedback() {
      this.clearSaveFeedbackHideTimer()
      this.saveFeedback = createSaveFeedbackState()
    },
    buildPendingSaveFeedbackSteps() {
      if (!this.hasPlanDraft && !this.hasBroadcastDraft) return []
      const steps = ['准备保存']
      if (this.hasPlanDraft) steps.push('上传作息方案')
      if (this.hasBroadcastDraft) steps.push('上传文件广播')
      if (this.hasPlanDraft) steps.push('刷新方案数据')
      return steps
    },
    startSaveFeedback(steps) {
      const normalized = Array.isArray(steps) ? steps.filter((item) => item) : []
      if (!normalized.length) {
        this.resetSaveFeedback()
        return
      }
      this.clearSaveFeedbackHideTimer()
      this.saveFeedback = {
        ...createSaveFeedbackState(),
        visible: true,
        status: 'active',
        steps: normalized,
        currentStepIndex: 0,
        currentLabel: normalized[0],
        percent: Math.max(8, Math.round(100 / normalized.length)),
        message: '正在校验待上传内容…'
      }
    },
    setSaveFeedbackStep(label, message = '') {
      if (!this.saveFeedback.visible) return
      const steps = Array.isArray(this.saveFeedback.steps) ? this.saveFeedback.steps : []
      const nextIndex = Math.max(steps.indexOf(label), 0)
      const total = Math.max(steps.length, 1)
      this.saveFeedback = {
        ...this.saveFeedback,
        status: 'active',
        currentStepIndex: nextIndex,
        currentLabel: label || this.saveFeedback.currentLabel,
        percent: Math.min(99, Math.max(8, Math.round(((nextIndex + 1) / total) * 100))),
        message: message || this.saveFeedback.message
      }
    },
    finishSaveFeedback(message = '已保存上传') {
      if (!this.saveFeedback.visible) return
      const steps = Array.isArray(this.saveFeedback.steps) ? this.saveFeedback.steps : []
      const total = Math.max(steps.length, 1)
      this.clearSaveFeedbackHideTimer()
      const nextState = {
        ...this.saveFeedback,
        visible: true,
        status: 'success',
        currentStepIndex: total - 1,
        currentLabel: steps[total - 1] || this.saveFeedback.currentLabel || '保存完成',
        percent: 100,
        message
      }
      const hideTimer = setTimeout(() => {
        this.resetSaveFeedback()
      }, SAVE_FEEDBACK_AUTO_HIDE_MS)
      this.saveFeedback = {
        ...nextState,
        hideTimer
      }
    },
    failSaveFeedback(message) {
      if (!this.saveFeedback.visible) return
      const steps = Array.isArray(this.saveFeedback.steps) ? this.saveFeedback.steps : []
      const total = Math.max(steps.length, 1)
      const currentStepIndex = Math.max(this.saveFeedback.currentStepIndex, 0)
      this.clearSaveFeedbackHideTimer()
      this.saveFeedback = {
        ...this.saveFeedback,
        visible: true,
        status: 'error',
        currentStepIndex,
        percent: Math.min(99, Math.max(8, Math.round(((currentStepIndex + 1) / total) * 100))),
        message: message || '保存失败，请稍后重试'
      }
    },
    selectionKey(type) {
      if (type === 'plan') return 'plans'
      if (type === 'broadcast') return 'broadcasts'
      if (type === 'live') return 'livecasts'
      return ''
    },
    withSingleSelection(type, row, callback) {
      const key = this.selectionKey(type)
      const previous = key ? this.selected[key] : null
      if (key) {
        this.$set(this.selected, key, row ? [row] : [])
      }
      const finalize = () => {
        if (key) {
          this.$set(this.selected, key, previous || [])
        }
      }
      try {
        const result = callback()
        if (result && typeof result.then === 'function') {
          return result.finally(finalize)
        }
        finalize()
        return result
      } catch (err) {
        finalize()
        throw err
      }
    },
    editSingle(type, row) {
      return this.withSingleSelection(type, row, () => this.openDialog(type, 'edit'))
    },
    copySingle(type, row) {
      return this.withSingleSelection(type, row, () => this.copySelected(type))
    },
    removeSingle(type, row) {
      return this.withSingleSelection(type, row, () => this.removeSelected(type))
    },
    openSingleVolumeDialog(type, row) {
      return this.withSingleSelection(type, row, () => this.openVolumeDialog(type))
    },
    setSingleRuntimeStatus(type, row, status) {
      return this.withSingleSelection(type, row, () => {
        if (type === 'broadcast') return this.setBroadcastStatus(status)
        if (type === 'live') return this.setLiveStatus(status)
        return null
      })
    },
    async togglePlanCardStatus(plan) {
      if (!plan) return
      const nextStatus = plan.status === '启用' ? '停用' : '启用'
      await this.applyImmediatePlanStatus([plan], nextStatus)
    },
    async toggleMobilePlan(plan) {
      if (!plan) return
      const next = !plan.mobileExpanded
      this.$set(plan, 'mobileExpanded', next)
      if (next) {
        await this.loadPlanTasks(plan)
      }
    },
    locationSummary(location) {
      const paths = this.normalizeLocationPaths(location)
      if (!paths.length) return '未设置'
      const preview = paths.slice(0, 2).map((path) => path.join(' / '))
      return paths.length > 2 ? `${preview.join('；')} 等${paths.length}处` : preview.join('；')
    },
    uniqueLocationPaths(list) {
      const values = Array.isArray(list) ? list : []
      const result = []
      const seen = new Set()
      values.forEach((entry) => {
        if (!Array.isArray(entry) || !entry.length) return
        const normalized = entry
          .map((value) => String(value ?? '').trim())
          .filter((value) => value)
        if (!normalized.length) return
        const signature = JSON.stringify(normalized)
        if (seen.has(signature)) return
        seen.add(signature)
        result.push(normalized)
      })
      return result
    },
    locationOptionZoneLabel(option) {
      if (!option || typeof option !== 'object') return ''
      const normalized = this.normalizeLocationPaths([[option.value]])
      if (normalized.length && normalized[0].length) {
        return String(normalized[0][0] || '').trim()
      }
      return String(option.label || option.value || '').trim()
    },
    locationPathsForZoneLabel(zoneLabel) {
      const target = String(zoneLabel || '').trim()
      if (!target) return []
      const options = Array.isArray(this.locationOptions) ? this.locationOptions : []
      const match = options.find((option) => {
        const optionZoneLabel = this.locationOptionZoneLabel(option)
        return optionZoneLabel === target ||
          String(option?.label || '').trim() === target ||
          String(option?.value || '').trim() === target
      })
      if (!match || !Array.isArray(match.children) || !match.children.length) return []
      const resolvedZoneLabel = this.locationOptionZoneLabel(match) || target
      return this.uniqueLocationPaths(
        match.children.map((child) => {
          const terminalLabel = String(child?.label ?? child?.value ?? '').trim()
          return terminalLabel ? [resolvedZoneLabel, terminalLabel] : []
        })
      )
    },
    normalizeExplicitLocationEntry(entry) {
      const normalized = this.normalizeLocationPaths([entry])[0] || []
      if (normalized.length < 2) return normalized
      const candidates = typeof this.matchingTerminalCandidatesForLocationEntry === 'function'
        ? this.matchingTerminalCandidatesForLocationEntry(normalized)
        : []
      if (candidates.length === 1) {
        const candidate = candidates[0] || {}
        return [
          String(normalized[normalized.length - 2] || UNASSIGNED_ZONE_LABEL),
          String(candidate.terminalName || normalized[normalized.length - 1] || '')
        ].filter((value) => value)
      }
      return [
        String(normalized[normalized.length - 2] || UNASSIGNED_ZONE_LABEL),
        String(normalized[normalized.length - 1] || '')
      ].filter((value) => value)
    },
    expandLocationSelection(location, options = {}) {
      const { preserveUnresolvedZones = false } = options
      const normalizedEntries = this.normalizeLocationPaths(location)
      const resolved = []
      const emptyZones = []
      normalizedEntries.forEach((entry) => {
        if (!Array.isArray(entry) || !entry.length) return
        if (entry.length >= 2) {
          const explicit = this.normalizeExplicitLocationEntry(entry)
          if (explicit.length >= 2) {
            resolved.push(explicit)
          }
          return
        }
        const zoneLabel = String(entry[0] || '').trim()
        if (!zoneLabel) return
        const zonePaths = this.locationPathsForZoneLabel(zoneLabel)
        if (zonePaths.length) {
          resolved.push(...zonePaths)
          return
        }
        if (preserveUnresolvedZones) {
          resolved.push([zoneLabel])
        } else {
          emptyZones.push(zoneLabel)
        }
      })
      return {
        paths: this.uniqueLocationPaths(resolved),
        emptyZones: this.uniqueStringList(emptyZones)
      }
    },
    emptyZoneLocationMessage(zoneLabels) {
      const zones = this.uniqueStringList(zoneLabels)
      if (!zones.length) return ''
      if (zones.length === 1) return `分区“${zones[0]}”下暂无可用终端`
      return `以下分区暂无可用终端：${zones.join('、')}`
    },
    syncTerminalFieldsFromLocation(target, location, options = {}) {
      if (!target || typeof target !== 'object') {
        return { paths: [], emptyZones: [] }
      }
      const {
        warn = false,
        preserveUnresolvedZones = false,
        clearExistingBindings = true
      } = options
      const { paths, emptyZones } = this.expandLocationSelection(location, { preserveUnresolvedZones })
      const source = {
        ...target,
        location: this.uniqueLocationPaths(paths)
      }
      if (clearExistingBindings) {
        source.terminalids = []
        source.terminalnames = []
        source.liveterminalid = ''
        source.liveterminalname = ''
      }
      const fields = this.resolvePlanTaskTerminalFields(source)
      target.location = this.uniqueLocationPaths(this.normalizeLocationPaths(fields.location))
      target.terminalids = this.uniqueStringList(fields.terminalids)
      target.terminalnames = this.uniqueStringList(fields.terminalnames)
      target.liveterminalid = fields.liveterminalid || ''
      target.liveterminalname = fields.liveterminalname || ''
      if (warn && emptyZones.length) {
        this.$message.warning(this.emptyZoneLocationMessage(emptyZones))
      }
      return { paths: target.location, emptyZones }
    },
    repairStoredLocationBinding(target, fallbackLocation = null) {
      if (!target || typeof target !== 'object') return
      const sourceLocation = Array.isArray(fallbackLocation) ? fallbackLocation : target.location
      this.syncTerminalFieldsFromLocation(target, sourceLocation, {
        preserveUnresolvedZones: true,
        clearExistingBindings: false
      })
    },
    onBroadcastLocationChange(row, value) {
      this.syncTerminalFieldsFromLocation(row, value, { warn: true })
    },
    onLiveLocationChange(row, value) {
      this.syncTerminalFieldsFromLocation(row, value, { warn: true })
    },
    rowAudioLabel(row) {
      return row?.audio || row?.medianame || row?.name || '—'
    },
    rowDurationLabel(row) {
      if (!row) return '—'
      if (row.durationMode === 'loop') {
        return `循环 ${row.loop || 1} 次`
      }
      return this.formatDurationHms(row.duration || row.timelength || '00:00:00')
    },
    rowStartTimeLabel(row) {
      return row?.time || row?.starttime || '--:--'
    },
    isBroadcastManualOnly(row) {
      // 播放时间为 00:00:00 / 00:00 / 空 → 视作只手动播放,不参与定时周期
      const text = String(row?.time || row?.starttime || '').trim()
      if (!text) return true
      return text === '00:00:00' || text === '00:00'
    },
    runtimePlayTerminalLabel(row) {
      const names = Array.isArray(row?.terminal_names) ? row.terminal_names.filter(Boolean) : []
      if (names.length) return names.join(' / ')
      const ids = Array.isArray(row?.terminal_ids) ? row.terminal_ids.filter(Boolean) : []
      if (ids.length) return ids.map((id) => `终端${id}`).join(' / ')
      return '—'
    },
    runtimePlayLengthLabel(row) {
      if (!row) return '—'
      if (String(row.playtype) === '2') {
        return `循环 ${row.playlength || 1} 次`
      }
      return this.formatDurationHms(row.playlength || row.duration || '00:00:00')
    },
    runtimePlayCreatedLabel(row) {
      return row?.created_at || row?.createdAt || row?.time || '--'
    },
    isBusyAction(key) {
      return this.busyActionKey === key
    },
    isActionDisabled(key) {
      return Boolean(this.busyActionKey && this.busyActionKey !== key)
    },
    async runBusyAction(key, callback) {
      if (this.busyActionKey) return false
      this.busyActionKey = key
      try {
        return await callback()
      } catch (err) {
        this.$message.error('加载即时播放任务失败')
        this.stopRuntimePlayPolling()
      } finally {
        if (this.busyActionKey === key) {
          this.busyActionKey = ''
        }
      }
    },
    setTableLoading(tab, loading) {
      if (!tab) return
      this.$set(this.tableLoadingByTab, tab, Boolean(loading))
    },
    setTableLoaded(tab, loaded) {
      if (!tab) return
      this.$set(this.tableLoadedByTab, tab, Boolean(loaded))
    },
    isTableLoading(tab) {
      return Boolean(this.tableLoadingByTab?.[tab])
    },
    tableEmptyText(tab) {
      if (this.isTableLoading(tab)) return ''
      return this.tableLoadedByTab?.[tab] ? '暂无数据' : ''
    },
    handleAssistantRefresh(payload = {}) {
      const runtimeScope = String(payload?.runtime_scope || '').trim()
      const actionLog = Array.isArray(payload?.action_log) ? payload.action_log : []
      const runtimePlayChanged = runtimeScope === 'temp_task' || actionLog.some((item) => item?.action === 'play_media')
      const onceScheduleActions = ['move_schedule', 'swap_schedule', 'cancel_schedule']
      const createScheduleActions = ['create_schedule', 'create_scheme']
      const intent = String(payload?.intent || '').trim()
      const isCreateSchedule =
        createScheduleActions.includes(intent) ||
        actionLog.some((item) => createScheduleActions.includes(String(item?.action || '').trim()))
      const createdPlanName = isCreateSchedule ? this.assistantCreatedPlanName(payload) : ''
      const shouldReloadModules =
        onceScheduleActions.includes(intent) ||
        actionLog.some((item) => onceScheduleActions.includes(String(item?.action || '').trim()))
      const refreshPromise = shouldReloadModules || !payload || payload.schedules === undefined
        ? this.loadModules()
        : Promise.resolve().then(() => this.applySchedulePayloadToModules(payload.schedules))
      refreshPromise.then(() => {
        // T47: AI create is immediate (backend already wrote :183); a stale plan
        // draft surviving the refresh would keep the badge lit. Clear it guarded
        // so we never swallow another plan's pending staging (KP #22 r2).
        if (isCreateSchedule) this.clearStalePlanDraftAfterCreate(createdPlanName)
        if (runtimePlayChanged) {
          this.applyAssistantRuntimePlayPreview(payload)
          this.loadRuntimePlays({ force: true })
          return
        }
        if (this.activeTab === 'broadcasts') this.loadBroadcasts()
        if (this.activeTab === 'livecasts') this.loadLivecasts()
        if (this.activeTab === 'runtimePlays') this.loadRuntimePlays({ force: true })
      })
    },
    assistantCreatedPlanName(payload = {}) {
      const slots = payload?.slots || {}
      const fromSlots = String(slots.schedule_name_matched || slots.schedule_name || '').trim()
      if (fromSlots) return fromSlots
      const actionLog = Array.isArray(payload?.action_log) ? payload.action_log : []
      for (const item of actionLog) {
        const name = String(item?.schedule_name || item?.name || '').trim()
        if (name) return name
      }
      return ''
    },
    runtimePlayRemoteState(row) {
      if (!row || typeof row !== 'object') return null
      const rawValue = row.remote_state
      if (rawValue === null || rawValue === undefined) return null
      if (typeof rawValue === 'string' && !rawValue.trim()) return null
      const numeric = Number(rawValue)
      if (Number.isFinite(numeric)) return numeric
      return null
    },
    hasActiveRuntimePlays(rows = this.modules.runtimePlays) {
      return (Array.isArray(rows) ? rows : []).some((row) => this.runtimePlayRemoteState(row) === 0)
    },
    syncRuntimePlayPolling(rows = this.modules.runtimePlays) {
      if (this.activeTab !== 'runtimePlays' || !this.hasActiveRuntimePlays(rows)) {
        this.stopRuntimePlayPolling()
        return
      }
      this.startRuntimePlayPolling()
    },
    startRuntimePlayPolling() {
      if (this.runtimePlayPollTimer) return
      this.runtimePlayPollTimer = setInterval(() => {
        if (this.activeTab !== 'runtimePlays' || !this.hasActiveRuntimePlays()) {
          this.stopRuntimePlayPolling()
          return
        }
        this.loadRuntimePlays({ force: true })
      }, 60000)
    },
    stopRuntimePlayPolling() {
      if (!this.runtimePlayPollTimer) return
      clearInterval(this.runtimePlayPollTimer)
      this.runtimePlayPollTimer = null
    },
    handleBeforeUnload(event) {
      if (!this.hasPlanDraft && !this.hasBroadcastDraft) return undefined
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault()
      }
      if (event) {
        event.returnValue = ''
      }
      return ''
    },
    cloneRows(rows) {
      try {
        return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []))
      } catch (err) {
        return Array.isArray(rows) ? rows.map((item) => ({ ...(item || {}) })) : []
      }
    },
    prepareBroadcastRows(rows) {
      const list = this.cloneRows(rows)
      const normalizeBroadcastTempId = typeof this.normalizeBroadcastTempId === 'function'
        ? this.normalizeBroadcastTempId.bind(this)
        : (value, fallbackTaskId, idx) => {
          const candidates = [value, fallbackTaskId]
          for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) continue
            const text = String(candidate).trim()
            if (/^\d+$/.test(text) && text !== '0') return text
            if (text) return text
          }
          return `draft-broadcast-${idx}`
        }
      const uniqueStringList = typeof this.uniqueStringList === 'function'
        ? this.uniqueStringList.bind(this)
        : (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter((item) => item)))
      const normalizeLocationPaths = typeof this.normalizeLocationPaths === 'function'
        ? this.normalizeLocationPaths.bind(this)
        : (value) => (Array.isArray(value) ? value : [])
      const formatDurationHms = typeof this.formatDurationHms === 'function'
        ? this.formatDurationHms.bind(this)
        : (value) => String(value || '00:05:00')
      return list.map((row, index) => {
        const source = row && typeof row === 'object' ? row : {}
        const durationMode = source.durationMode === 'duration' ? 'duration' : 'loop'
        const resolvedLocation = typeof this.resolveLocationFromRow === 'function'
          ? this.resolveLocationFromRow(source)
          : normalizeLocationPaths(source.location)
        const duration = durationMode === 'loop'
          ? ''
          : (source.duration ? formatDurationHms(source.duration) : '00:05:00')
        const sourceId = normalizeBroadcastTempId(
          source.id ?? source.broadcastDraftId ?? source.broadcast_draft_id,
          source.taskid ?? source.task_id,
          index
        )
        const sourceTaskId = source.taskid ?? source.task_id ?? source.id ?? ''
        return {
          id: String(sourceId),
          taskid: sourceTaskId === undefined || sourceTaskId === null ? '' : String(sourceTaskId),
          name: String(source.name || source.taskname || ''),
          status: String(source.status || ''),
          volume: Number.isFinite(Number(source.volume)) ? Number(source.volume) : 50,
          emergency: Boolean(source.emergency),
          audio: String(source.audio || source.medianame || ''),
          durationMode,
          duration,
          loop: durationMode === 'loop'
            ? Math.max(1, Number(source.loop || 1) || 1)
            : Math.max(1, Number(source.loop || 1) || 1),
          // T63/T13: keep the backend-decoded weekdays (api_public
          // _normalize_view_task already turns execmode → weekdays array for
          // broadcast rows). Without this the whitelist dropped it, so after a
          // finish→backfill the weekday grid read row.weekdays = [] and all
          // cells went dark even though the save (execmode) landed. Reuse
          // normalizeWeekdays for stable order; do NOT re-decode here.
          weekdays: this.normalizeWeekdays(Array.isArray(source.weekdays) ? source.weekdays : []),
          location: normalizeLocationPaths(resolvedLocation),
          terminalids: uniqueStringList(source.terminalids ?? source.terminal_ids),
          terminalnames: uniqueStringList(source.terminalnames ?? source.terminal_names),
          liveterminalid: source.liveterminalid === undefined || source.liveterminalid === null ? '' : String(source.liveterminalid),
          liveterminalname: String(source.liveterminalname || ''),
          time: String(source.time || ''),
          starttime: String(source.starttime || ''),
          startdate: String(source.startdate || ''),
          enddate: String(source.enddate || ''),
          taskstate: source.taskstate ?? null,
          state: source.state ?? null,
          enablestate: source.enablestate ?? 1
        }
      })
    },
    buildBroadcastBaseSnapshot(rows) {
      return this.prepareBroadcastRows(rows)
    },
    areBroadcastRowsEqual(left, right) {
      return JSON.stringify(this.buildBroadcastBaseSnapshot(left)) === JSON.stringify(this.buildBroadcastBaseSnapshot(right))
    },
    currentBroadcastBaseSnapshot() {
      if (
        Array.isArray(this.draftState?.broadcastBaseSnapshot) &&
        (
          this.draftState.broadcastBaseSnapshot.length ||
          hasSchedulerDirtyScope('broadcasts', this.draftState)
        )
      ) {
        return this.buildBroadcastBaseSnapshot(this.draftState.broadcastBaseSnapshot)
      }
      return this.buildBroadcastBaseSnapshot(this.lastSyncedBroadcastBaseSnapshot)
    },
    normalizePlanDraftIds(ids) {
      const list = Array.isArray(ids) ? ids : []
      return Array.from(new Set(list.map((item) => String(item || '').trim()).filter((item) => item)))
    },
    preparePlanRows(rows, options = {}) {
      const { persisted = false, excludeOnce = false } = options
      const nextRows = this.clonePlanList(rows)
      nextRows.forEach((plan) => {
        if (!plan || typeof plan !== 'object') return
        plan.name = plan.name ? String(plan.name) : ''
        plan.originName = persisted
          ? plan.name
          : (plan.originName ? String(plan.originName) : (plan.isNew ? '' : plan.name))
        plan.isNew = persisted ? false : Boolean(plan.isNew)
        if (!Array.isArray(plan.tasks)) plan.tasks = []
        if (excludeOnce) {
          plan.tasks = this.stripOnceEphemeralPlanTasks(plan.tasks)
        }
        plan.tasksLoaded = plan.tasksLoaded !== false
        plan.tasksLoading = Boolean(plan.tasksLoading)
        plan.taskCount = plan.tasksLoaded
          ? plan.tasks.length
          : (plan.taskCount !== undefined && plan.taskCount !== null ? plan.taskCount : plan.tasks.length)
      })
      return nextRows
    },
    buildPlanBaseSnapshot(rows) {
      return this.preparePlanRows(rows, { persisted: true, excludeOnce: true })
    },
    setPlanRows(rows, options = {}) {
      const { rememberRemote = false, clearSelection = true } = options
      const nextRows = this.preparePlanRows(rows)
      if (rememberRemote) {
        this.lastSyncedPlans = this.buildPlanBaseSnapshot(nextRows)
      }
      this.modules.plans = nextRows
      this.normalizeModules()
      this.refreshLoadedPlanOnceTasks()
      this.sortAllModules()
      this.refreshPlanPayload()
      this.resetInlineTaskEdit()
      if (clearSelection) {
        this.selected.plans = []
        this.$nextTick(() => {
          this.clearSelection('plan')
        })
      }
    },
    loadDraftState() {
      this.draftState = loadSchedulerDrafts()
      this.$nextTick(() => {
        this.promptInvalidPlanDrafts(this.draftState)
        this.promptLegacyPlanDraftMigration()
      })
    },
    async promptLegacyPlanDraftMigration() {
      // T39 收口后 plans tab 不再生成新草稿;只剩"老版本 / 旧 session 残留"
      // 的草稿。一次性 prompt 让用户决定上传还是丢弃,然后这条路径就只在
      // 本次启动起作用 — 上次 prompt 之后产生的本地状态不会再走旧链路。
      if (this.legacyPlanDraftPromptShown) return
      if (!this.hasPlanDraft) return
      this.legacyPlanDraftPromptShown = true
      const draftCount = this.planDraftCount
      try {
        await this.$confirm(
          `检测到 ${draftCount} 个未上传的作息方案草稿。本次启动会一次性同步到远端;否则直接丢弃。`,
          '检测到旧版作息方案草稿',
          {
            confirmButtonText: '立即上传',
            cancelButtonText: '丢弃草稿',
            distinguishCancelAndClose: true,
            type: 'warning'
          }
        )
      } catch (action) {
        // cancel / close 都按"丢弃"处理 — distinguishCancelAndClose 让两边可分,
        // 但产品意图相同。
        this.clearPlanDraftState()
        this.$message.info('已丢弃旧版作息方案草稿')
        return
      }
      await this.uploadLegacyPlanDraftsParallel()
    },
    async uploadLegacyPlanDraftsParallel() {
      // Migration path for the one-shot legacy-draft prompt. Mirrors Step 1 (B)
      // batch volume fan-out: per remote plan, one updateScheduleEntry; isNew
      // plans get a fail-loud warning instead of a silent draft-create that the
      // backend can no longer fulfill. Errors are surfaced via planSaveError +
      // loadModules; success clears the draft and reloads the official state.
      if (this.persisting) {
        this.$message.warning('正在保存中，请稍候…')
        return
      }
      const draftPlans = Array.isArray(this.draftState?.plans) ? this.draftState.plans : []
      const dirtyIds = new Set(this.normalizePlanDraftIds(this.draftState?.planDirtyIds))
      const dirtyDraftPlans = draftPlans.filter((plan) => dirtyIds.has(String(plan?.id ?? '')))
      const localOnly = dirtyDraftPlans.filter((plan) => plan?.isNew || !String(plan?.originName || '').trim())
      const remoteTargets = dirtyDraftPlans.filter((plan) => !plan?.isNew && String(plan?.originName || '').trim())
      if (localOnly.length) {
        this.$message.warning(`已忽略 ${localOnly.length} 个未上传的本地新建草稿，请通过"新建方案"重新创建`)
      }
      if (!remoteTargets.length) {
        this.clearPlanDraftState()
        await this.loadModules()
        return
      }
      this.persisting = true
      try {
        const settled = await Promise.allSettled(
          remoteTargets.map((plan) => {
            const originalName = String(plan.originName || plan.name).trim()
            return updateScheduleEntry(originalName, this.serializePlanForApi(plan, draftPlans))
          })
        )
        const rejections = settled.filter((entry) => entry.status === 'rejected')
        if (rejections.length) {
          this.planSaveError(rejections[0].reason || new Error('旧版草稿上传失败'))
          await this.loadModules()
          return
        }
        this.clearPlanDraftState()
        await this.loadModules()
        this.$message.success('旧版作息方案草稿已上传')
      } catch (err) {
        this.planSaveError(err)
        await this.loadModules()
      } finally {
        this.persisting = false
      }
    },
    clearPlanDraftState() {
      this.draftState = clearPlanDraft()
    },
    // T47 (plans-side analogue of _canClearBroadcastDraftAfterImmediateCommit,
    // KP #22 r2): after an immediate plan create succeeds, a stale plan draft
    // from a prior session can survive and keep the "未上传草稿" badge lit (the
    // create refresh re-overlays it). Clearing it on create is safe ONLY when
    // the residue is not someone else's pending plan staging — otherwise the
    // unconditional clear would swallow it (exactly the KP #22 r2 反例). Refuse
    // when any plan delete is pending (delete is batch-natured), or when any
    // dirty plan id is NOT the just-created plan's own id.
    _canClearPlanDraftAfterImmediateCreate(createdPlanId) {
      const dirtyIds = (this.draftState && this.draftState.planDirtyIds) || []
      const deletedIds = (this.draftState && this.draftState.planDeletedIds) || []
      if (!dirtyIds.length && !deletedIds.length) return true
      if (deletedIds.length) return false
      const ownId = String(createdPlanId || '').trim()
      if (!ownId) return false
      return dirtyIds.every((id) => String(id) === ownId)
    },
    // Guarded clear used by both immediate plan-create paths (UI
    // createPlanImmediate + AI handleAssistantRefresh). Clears a surviving
    // stale plan draft only when it is safe (see the guard above); a no-op when
    // there is nothing to clear or when another plan's staging would be lost.
    clearStalePlanDraftAfterCreate(createdPlanId) {
      if (!hasSchedulerDirtyScope('plans', this.draftState)) return
      if (!this._canClearPlanDraftAfterImmediateCreate(createdPlanId)) return
      this.clearPlanDraftState()
    },
    invalidPlanDraftSummary(draftState = this.draftState) {
      const invalidPlans = Array.isArray(draftState?.invalidPlanDrafts) ? draftState.invalidPlanDrafts.length : 0
      const invalidBasePlans = Array.isArray(draftState?.invalidPlanBaseSnapshot) ? draftState.invalidPlanBaseSnapshot.length : 0
      return {
        invalidPlans,
        invalidBasePlans,
        total: invalidPlans + invalidBasePlans
      }
    },
    refreshVisiblePlansFromDraftState() {
      if (this.hasPlanDraft && Array.isArray(this.draftState?.plans)) {
        this.setPlanRows(this.draftState.plans, { clearSelection: false })
        return
      }
      if (Array.isArray(this.lastSyncedPlans) && this.lastSyncedPlans.length) {
        this.setPlanRows(this.lastSyncedPlans, { rememberRemote: true, clearSelection: false })
      }
    },
    async promptInvalidPlanDrafts(draftState = this.draftState) {
      const summary = this.invalidPlanDraftSummary(draftState)
      if (!summary.total) {
        this.invalidPlanDraftPromptKey = ''
        return
      }
      const promptKey = `${summary.invalidPlans}:${summary.invalidBasePlans}:${summary.total}`
      if (this.invalidPlanDraftPromptKey === promptKey) return
      this.invalidPlanDraftPromptKey = promptKey
      try {
        await this.$confirm(
          `发现 ${summary.total} 个异常作息草稿数据，已暂时隔离且不会参与保存上传。点击“恢复可识别草稿”会按兼容字段尝试恢复；完全无名称的数据仍会继续隔离。`,
          '检测到异常草稿',
          {
            confirmButtonText: '恢复可识别草稿',
            cancelButtonText: '丢弃异常草稿',
            distinguishCancelAndClose: true,
            type: 'warning'
          }
        )
        const nextDraftState = recoverInvalidPlanDrafts()
        const nextSummary = this.invalidPlanDraftSummary(nextDraftState)
        const recoveredCount = Math.max(0, summary.total - nextSummary.total)
        this.draftState = nextDraftState
        this.refreshVisiblePlansFromDraftState()
        if (recoveredCount > 0) {
          this.$message.success(`已恢复 ${recoveredCount} 个可识别的异常草稿`)
        } else {
          this.$message.info('未找到可恢复的异常草稿，已继续隔离')
        }
      } catch (action) {
        if (action !== 'cancel') return
        this.draftState = discardInvalidPlanDrafts()
        this.refreshVisiblePlansFromDraftState()
        this.$message.success('宸蹭涪寮冨紓甯镐綔鎭崏绋?')
      }
    },
    notifyIgnoredUnnamedDraftPlans(draftState) {
      const count = Number(draftState?.planSanitizeReport?.totalIgnoredPlans || 0)
      if (!count) return
      this.$message.warning(`发现 ${count} 个无名称本地草稿方案，已自动忽略`)
    },
    startBroadcastDraftSyncSuspension() {
      const depth = Number(this.broadcastDraftSyncSuspendDepth || 0) + 1
      this.broadcastDraftSyncSuspendDepth = depth
      this.suspendBroadcastDraftSync = true
    },
    stopBroadcastDraftSyncSuspension() {
      const depth = Math.max(0, Number(this.broadcastDraftSyncSuspendDepth || 0) - 1)
      this.broadcastDraftSyncSuspendDepth = depth
      if (!depth) {
        this.suspendBroadcastDraftSync = false
      }
    },
    async getPlanDraftSourcePlans() {
      if (this.hasPlanDraft && Array.isArray(this.draftState?.plans)) {
        return this.preparePlanRows(this.draftState.plans, { excludeOnce: true })
      }
      await this.ensurePlanTasksLoaded()
      const sourcePlans = this.buildPlanBaseSnapshot(this.modules.plans)
      this.lastSyncedPlans = this.buildPlanBaseSnapshot(sourcePlans)
      return this.preparePlanRows(sourcePlans, { excludeOnce: true })
    },
    savePlanDraftState(plans, dirtyIds, baseSnapshot, options = {}) {
      const nextDraft = savePlanDraft(
        this.preparePlanRows(plans, { excludeOnce: true }),
        this.normalizePlanDraftIds(dirtyIds),
        this.buildPlanBaseSnapshot(baseSnapshot),
        {
          planDeletedIds: options.planDeletedIds !== undefined
            ? options.planDeletedIds
            : this.draftState?.planDeletedIds,
          invalidPlanDrafts: options.invalidPlanDrafts !== undefined
            ? options.invalidPlanDrafts
            : this.draftState?.invalidPlanDrafts,
          invalidPlanBaseSnapshot: options.invalidPlanBaseSnapshot !== undefined
            ? options.invalidPlanBaseSnapshot
            : this.draftState?.invalidPlanBaseSnapshot
        }
      )
      this.draftState = nextDraft
      return nextDraft
    },
    async discardPlanDraft() {
      if (!this.hasPlanDraft) return
      try {
        await this.$confirm(
          `确定放弃当前 ${this.planDraftCount} 个未上传的作息方案草稿吗？此操作不可撤销。`,
          '放弃本地草稿',
          {
            confirmButtonText: '放弃草稿',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch (err) {
        return
      }
      const nextPlans = Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
        ? this.draftState.planBaseSnapshot
        : this.lastSyncedPlans
      this.clearPlanDraftState()
      if (Array.isArray(nextPlans) && nextPlans.length) {
        this.setPlanRows(nextPlans, { rememberRemote: true })
      } else {
        await this.loadModules()
      }
      this.$message.success('已放弃作息方案草稿')
    },
    withBroadcastDraftSyncSuspended(callback) {
      this.startBroadcastDraftSyncSuspension()
      try {
        callback()
      } finally {
        this.$nextTick(() => {
          this.stopBroadcastDraftSyncSuspension()
        })
      }
    },
    async withBroadcastDraftSyncSuspendedAsync(callback) {
      this.startBroadcastDraftSyncSuspension()
      try {
        return await callback()
      } finally {
        if (typeof this.$nextTick === 'function') {
          await this.$nextTick()
        }
        this.stopBroadcastDraftSyncSuspension()
      }
    },
    // F4 (T43 phantom-dirty 治本 / KP #22 suspect A): the immediate broadcast
    // handlers (drawer add / drawer edit / toolbar add) used to apply the row +
    // recompute + clear all synchronously, but the modules.broadcasts deep
    // watcher fires its recompute on the NEXT tick. If that recompute landed
    // AFTER the synchronous clear, it re-dirtied the just-cleared draft and the
    // "未上传草稿" badge phantom-lit (PO G4). Running the apply inside the async
    // suspension means the watcher fires while still suspended (handler
    // early-returns on suspendBroadcastDraftSync) and settles before the await
    // resolves — so the guarded clear below is genuinely the LAST step, after
    // every recompute tick.
    //
    // The _canClearBroadcastDraftAfterImmediateCommit guard semantics are
    // unchanged: only clear when the residue is the committed row's own id (no
    // other-row batch staging, no pending delete) — KP #22 r2 batch-staging
    // protection is preserved.
    async applyBroadcastImmediateThenClear(applyRow, committedTaskId) {
      if (typeof this.withBroadcastDraftSyncSuspendedAsync === 'function') {
        await this.withBroadcastDraftSyncSuspendedAsync(applyRow)
      } else if (typeof this.withBroadcastDraftSyncSuspended === 'function') {
        this.withBroadcastDraftSyncSuspended(applyRow)
      } else {
        applyRow()
      }
      if (typeof this.syncBroadcastDraftState === 'function') {
        this.syncBroadcastDraftState()
      }
      if (
        typeof this.clearBroadcastDraftState === 'function' &&
        this._canClearBroadcastDraftAfterImmediateCommit(committedTaskId)
      ) {
        this.clearBroadcastDraftState()
      }
    },
    // T36 G4 Bug 2 fix: shared snapshot-patch helper.
    //
    // Background: after an immediate broadcast write (add / volume edit /
    // starttime edit), the synced-snapshot shadows must be patched so the
    // deep watcher's next diff does NOT treat the row as "dirty vs.
    // baseline" — otherwise the badge phantom-counts the just-saved row.
    //
    // f2 (critic r1) added the 3-snapshot patch only for the add path
    // (lastSyncedBroadcasts / lastSyncedBroadcastBaseSnapshot /
    // draftState.broadcastBaseSnapshot). G4 PO实锤: volume / starttime
    // edits still phantom-dirty because their handlers never patched the
    // shadows. This helper centralizes the 3-snapshot patch so the three
    // handlers (add / volume / starttime) all do the same thing.
    //
    // Mode semantics (explicit so add's "unshift new row" and edit's
    // "replace existing row by taskid" do NOT mash into one ambiguous
    // path — see SOUL anti-pattern "硬拗一个签名"):
    //   - mode='add'    → new row, unshift it onto each shadow (no
    //                     prior match expected; falls back to unshift if
    //                     by some race condition the taskid is already
    //                     in a shadow, the helper replaces in-place).
    //   - mode='update' → existing row, locate by taskid and replace
    //                     in-place. If no match (defensive: shadow
    //                     somehow drifted away from modules.broadcasts),
    //                     no-op + console.warn — do NOT throw and do NOT
    //                     silently unshift (would corrupt the diff).
    //
    // The row passed in is the FULL current row state (v-model already
    // wrote the new volume / starttime to modules.broadcasts before this
    // helper runs). Helper does NOT take a delta — taking the full row
    // means B-round new fields (audio / weekday / terminal immediate
    // handlers) can reuse this same helper without changing the signature.
    //
    // Caller contract: invoke INSIDE withBroadcastDraftSyncSuspended (so
    // the deep watcher does not re-snapshot the now-patched state) and
    // BEFORE syncBroadcastDraftState() (which recomputes the badge from
    // the patched shadows).
    patchBroadcastSyncedSnapshotForRow(row, mode = 'update') {
      if (!row || typeof row !== 'object') return
      const taskIdText = String(row.taskid || row.id || '').trim()
      if (!taskIdText) {
        // No taskid → cannot key the patch. This should never happen for
        // immediate handlers (they all guard on /^\d+$/.test(taskid)
        // before calling the remote) but defend against a future caller
        // that forgets.
        // eslint-disable-next-line no-console
        console.warn('[patchBroadcastSyncedSnapshotForRow] missing taskid', { mode, row })
        return
      }
      const isAdd = mode === 'add'
      const isUpdate = mode === 'update'
      if (!isAdd && !isUpdate) {
        // eslint-disable-next-line no-console
        console.warn('[patchBroadcastSyncedSnapshotForRow] unknown mode', mode)
        return
      }
      const buildBroadcastBaseSnapshot = typeof this.buildBroadcastBaseSnapshot === 'function'
        ? this.buildBroadcastBaseSnapshot.bind(this)
        : null
      const cloneRows = typeof this.cloneRows === 'function'
        ? this.cloneRows.bind(this)
        : (rows) => JSON.parse(JSON.stringify(rows || []))
      // Helper: locate row index by taskid match in a shadow list.
      const indexByTaskId = (list) => {
        if (!Array.isArray(list)) return -1
        return list.findIndex((item) => {
          const id = String(item?.taskid || item?.id || '').trim()
          return id === taskIdText
        })
      }
      // (1) lastSyncedBroadcasts — raw row clone (matches what a
      //     loadBroadcasts() GET would write).
      if (Array.isArray(this.lastSyncedBroadcasts)) {
        const rawClone = cloneRows([row])
        const idx = indexByTaskId(this.lastSyncedBroadcasts)
        if (idx >= 0) {
          this.lastSyncedBroadcasts.splice(idx, 1, rawClone[0])
        } else if (isAdd) {
          this.lastSyncedBroadcasts.unshift(rawClone[0])
        } else {
          // eslint-disable-next-line no-console
          console.warn('[patchBroadcastSyncedSnapshotForRow] update miss in lastSyncedBroadcasts', taskIdText)
        }
      }
      // (2) lastSyncedBroadcastBaseSnapshot — normalized row (matches
      //     the diff seam calculateBroadcastDraftMeta uses).
      if (Array.isArray(this.lastSyncedBroadcastBaseSnapshot) && buildBroadcastBaseSnapshot) {
        const normalized = buildBroadcastBaseSnapshot([row])
        const idx = indexByTaskId(this.lastSyncedBroadcastBaseSnapshot)
        if (idx >= 0) {
          this.lastSyncedBroadcastBaseSnapshot.splice(idx, 1, normalized[0])
        } else if (isAdd) {
          this.lastSyncedBroadcastBaseSnapshot.unshift(normalized[0])
        } else {
          // eslint-disable-next-line no-console
          console.warn('[patchBroadcastSyncedSnapshotForRow] update miss in lastSyncedBroadcastBaseSnapshot', taskIdText)
        }
      }
      // (3) draftState.broadcastBaseSnapshot — only patch when it's the
      //     active baseline (currentBroadcastBaseSnapshot prefers it
      //     when broadcasts is in a dirty scope).
      if (
        this.draftState &&
        Array.isArray(this.draftState.broadcastBaseSnapshot) &&
        this.draftState.broadcastBaseSnapshot.length &&
        buildBroadcastBaseSnapshot
      ) {
        const normalized = buildBroadcastBaseSnapshot([row])
        const idx = indexByTaskId(this.draftState.broadcastBaseSnapshot)
        if (idx >= 0) {
          const nextSnapshot = this.draftState.broadcastBaseSnapshot.slice()
          nextSnapshot.splice(idx, 1, normalized[0])
          this.draftState = {
            ...this.draftState,
            broadcastBaseSnapshot: nextSnapshot
          }
        } else if (isAdd) {
          this.draftState = {
            ...this.draftState,
            broadcastBaseSnapshot: [normalized[0], ...this.draftState.broadcastBaseSnapshot]
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn('[patchBroadcastSyncedSnapshotForRow] update miss in draftState.broadcastBaseSnapshot', taskIdText)
        }
      }
    },
    setBroadcastRows(rows, options = {}) {
      const { rememberRemote = false } = options
      const nextRows = this.cloneRows(rows)
      if (rememberRemote) {
        const buildBroadcastBaseSnapshot = typeof this.buildBroadcastBaseSnapshot === 'function'
          ? this.buildBroadcastBaseSnapshot.bind(this)
          : (value) => this.cloneRows(value)
        this.lastSyncedBroadcasts = this.cloneRows(nextRows)
        this.lastSyncedBroadcastBaseSnapshot = buildBroadcastBaseSnapshot(nextRows)
      }
      this.withBroadcastDraftSyncSuspended(() => {
        this.modules.broadcasts = nextRows
        this.normalizeModules()
      })
    },
    persistBroadcastDraftLocally(message = '') {
      const nextDraft = saveBroadcastDraft(
        this.buildBroadcastBaseSnapshot(this.modules.broadcasts),
        this.currentBroadcastBaseSnapshot()
      )
      this.draftState = nextDraft
      if (message && hasSchedulerDirtyScope('broadcasts', nextDraft)) {
        this.$message.success(message)
      }
    },
    syncBroadcastDraftState(message = '') {
      this.persistBroadcastDraftLocally(message)
    },
    restoreBroadcastDraftOverlay() {
      if (!hasSchedulerDirtyScope('broadcasts', this.draftState)) return
      const draftRows = Array.isArray(this.draftState?.broadcasts) ? this.draftState.broadcasts : []
      this.setBroadcastRows(draftRows)
    },
    clearBroadcastDraftState() {
      this.draftState = clearBroadcastDraft()
    },
    // T41 critic r1 f1 guard — the broadcast tab DOES have batch draft
    // entries that legitimately stage to localStorage (KP #22 反例):
    //   - applyVolume('broadcast') :5569-5571 → persistBroadcastDraftLocally
    //     ('音量已暂存到本地')
    //   - setBroadcastStatus :6926-6929 暂停/恢复/执行中/停止 →
    //     persistBroadcastDraftLocally('广播状态已暂存到本地')
    // The "no inline editor → safe to nuke" invariant only holds when
    // the current dirty set is EITHER empty or contains ONLY the row
    // this immediate handler just committed (so the residue we are
    // clearing is the row's own phantom — not another row's real batch
    // staging). Any other-row dirty / any pending delete → refuse to
    // clear and let the user's batch staging survive.
    _canClearBroadcastDraftAfterImmediateCommit(commitedTaskId) {
      const dirtyIds = (this.draftState && this.draftState.broadcastDirtyIds) || []
      const deletedIds = (this.draftState && this.draftState.broadcastDeletedIds) || []
      if (!dirtyIds.length && !deletedIds.length) return true
      const ownId = String(commitedTaskId || '').trim()
      // No own id ⇒ we cannot prove the residue is ours; refuse.
      if (!ownId) return false
      // delete is batch-natured (the user picked rows to delete in
      // bulk); if any deleted id is pending, the clear would silently
      // drop them — refuse.
      if (deletedIds.length) return false
      // Safe to clear iff every dirty id is our own id (i.e. the only
      // residue is the row this handler just committed).
      return dirtyIds.every((id) => String(id) === ownId)
    },
    async confirmDiscardLocalDrafts() {
      const draftParts = []
      if (this.hasPlanDraft) {
        draftParts.push(`作息方案 ${this.planDraftCount} 个`)
      }
      if (this.hasBroadcastDraft) {
        draftParts.push(`文件广播 ${this.broadcastDraftCount} 条`)
      }
      if (!draftParts.length) return true
      try {
        await this.$confirm(
          `检测到本地存在未上传草稿（${draftParts.join('，')}）。继续同步后台会丢弃这些草稿，是否继续？`,
          '丢弃本地草稿',
          {
            confirmButtonText: '丢弃并同步',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        return true
      } catch (err) {
        return false
      }
    },
    async confirmDiscardBroadcastDraft() {
      if (!this.hasBroadcastDraft) return true
      try {
        await this.$confirm(
          '检测到文件广播存在未上传草稿。继续同步后台会丢弃本地草稿，是否继续？',
          '丢弃本地草稿',
          {
            confirmButtonText: '丢弃并同步',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        return true
      } catch (err) {
        return false
      }
    },
    async discardBroadcastDraft() {
      if (!hasSchedulerDirtyScope('broadcasts', this.draftState)) return
      try {
        await this.$confirm(
          `确定放弃当前 ${this.broadcastDraftCount} 条未上传的文件广播草稿吗？此操作不可撤销。`,
          '放弃本地草稿',
          {
            confirmButtonText: '放弃草稿',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch (err) {
        return
      }
      const baseSnapshot = this.currentBroadcastBaseSnapshot()
      const shouldRestore = !this.areBroadcastRowsEqual(this.modules.broadcasts, baseSnapshot)
      this.clearBroadcastDraftState()
      if (shouldRestore && baseSnapshot.length) {
        this.setBroadcastRows(baseSnapshot, { rememberRemote: true })
      } else if (shouldRestore && this.lastSyncedBroadcasts.length) {
        this.setBroadcastRows(this.lastSyncedBroadcasts, { rememberRemote: true })
      } else {
        this.lastSyncedBroadcasts = this.cloneRows(baseSnapshot)
      }
      this.$message.success('已放弃本地草稿')
    },
    async savePendingChanges() {
      await this.runBusyAction('save', async() => {
        const steps = this.buildPendingSaveFeedbackSteps()
        if (steps.length) {
          this.startSaveFeedback(steps)
        }
        await this.persist('已保存上传', 'all', { pendingOnly: true })
      })
    },
    handleTabClick(tab) {
      const name = tab?.name || tab
      if (name === 'broadcasts') this.loadBroadcasts()
      if (name === 'livecasts') this.loadLivecasts()
      if (name === 'runtimePlays') {
        this.loadRuntimePlays()
        return
      }
      this.stopRuntimePlayPolling()
    },
    handlePlanExpand(row, expandedRows) {
      const expanded = Array.isArray(expandedRows) && expandedRows.some((item) => item === row)
      if (expanded) {
        this.loadPlanTasks(row)
      }
    },
    async bootstrap() {
      this.loading = true
      this.setTableLoading('plans', true)
      try {
        // loadAssets (audio + terminal/location options) and loadModules
        // (schedules + overrides) are independent — run them in parallel so the
        // initial render isn't gated on the sum of both round-trips. Each owns
        // its try/catch internally, so one failing does not reject the other.
        await Promise.all([this.loadAssets(), this.loadModules()])
      } finally {
        this.loading = false
      }
    },
    async loadAssets() {
      // fetchAllAudio and fetchAllTerminalData are independent reads — fire
      // both before awaiting so they overlap on the wire. Each result is still
      // consumed inside its own try/catch below, so error handling and the
      // downstream fetchAllLoc fallback are unchanged.
      const audioRequest = fetchAllAudio()
      const terminalDataRequest = fetchAllTerminalData()
      try {
        const audioPayload = await audioRequest
        this.audioOptions = this.mapAudioOptions(audioPayload)
      } catch (err) {
        this.$message.error('加载音频资源失败')
      }
      let zoneList = []
      let locationOptions = []
      this.hasReliableLocationOptions = false
      try {
        const allData = await terminalDataRequest
        const zonesPayload = allData?.zones
        const zoneTerminalsMap = allData?.zone_terminals || {}
        const terminalInfoPayload = allData?.terminal_info

        zoneList = extractList(zonesPayload)
        this.zoneLookup = zoneList.reduce((acc, item) => {
          if (!item || typeof item !== 'object') return acc
          const id = item.id ?? item.zone ?? item.zoneid
          if (id === undefined || id === null) return acc
          acc[String(id)] = this.zoneNameFromItem(item)
          return acc
        }, {})
        this.zoneValueMap = zoneList.reduce((acc, item) => {
          if (!item || typeof item !== 'object') return acc
          const id = item.id ?? item.zone ?? item.zoneid
          if (id === undefined || id === null) return acc
          const value = this.zoneValueLabel(id)
          const label = this.zoneNameFromItem(item) || value
          acc[String(value)] = String(label || value)
          return acc
        }, {})

        if (zoneList.length) {
          const zoneTerminals = {}
          const zoneTerminalIds = new Set()
          for (const zone of zoneList) {
            const zoneId = zone?.id ?? zone?.zone ?? zone?.zoneid
            if (zoneId === undefined || zoneId === null) continue
            const terminals = extractList(zoneTerminalsMap[String(zoneId)])
            zoneTerminals[String(zoneId)] = terminals
            terminals.forEach((item) => {
              const terminalId = item?.id ?? item?.terminalid ?? item?.terminal_id
              if (terminalId !== undefined && terminalId !== null) {
                zoneTerminalIds.add(String(terminalId))
              }
            })
          }
          const allTerminals = extractList(terminalInfoPayload)
          const unassignedTerminals = allTerminals.filter((item) => {
            const terminalId = item?.id ?? item?.terminalid ?? item?.terminal_id
            if (terminalId === undefined || terminalId === null) return false
            return !zoneTerminalIds.has(String(terminalId))
          })
          const maps = this.buildTerminalMaps(zoneList, zoneTerminals, unassignedTerminals)
          this.zoneValueMap = maps.zoneValueMap
          this.terminalIdMap = maps.terminalIdMap
          this.terminalNameZoneMap = maps.terminalNameZoneMap
          locationOptions = this.buildLocationOptionsFromZones(zoneList, zoneTerminals, unassignedTerminals)
          this.hasReliableLocationOptions = locationOptions.some((item) => Array.isArray(item?.children) && item.children.length > 0)
        }
      } catch (err) {
        this.zoneLookup = {}
        this.zoneValueMap = {}
        this.hasReliableLocationOptions = false
      }
      if (!locationOptions.length) {
        try {
          const locPayload = await fetchAllLoc()
          locationOptions = this.mapLocationOptions(locPayload)
        } catch (err) {
          this.$message.error('加载终端资源失败')
        }
      }
      this.locationOptions = locationOptions
      if (!zoneList.length) {
        this.terminalIdMap = {}
        this.terminalNameZoneMap = {}
      }
    },
    async loadModules(options = {}) {
      const applyDraftOverlay = options?.applyDraftOverlay !== false
      try {
        const [rawPayload, overridesPayload] = await Promise.all([
          fetchBroadcastSchedulesSummary(),
          fetchTaskOverrides()
        ])
        this.taskOverrides = Array.isArray(overridesPayload?.overrides) ? overridesPayload.overrides : []
        this.applySchedulePayloadToModules(rawPayload, { applyDraftOverlay })
        this.applyOnceDrawerRouteQuery()
      } catch (err) {
        this.modules = { plans: [], broadcasts: [], livecasts: [], runtimePlays: [], directories: [] }
        this.taskOverrides = []
        this.lastSyncedPlans = []
        this.lastSyncedBroadcastBaseSnapshot = []
        this.$message.error('加载作息方案失败')
      } finally {
        this.setTableLoaded('plans', true)
        this.setTableLoading('plans', false)
      }
    },
    applyOnceDrawerRouteQuery() {
      const query = this.$route?.query || {}
      if (String(query.oncePanel || '') !== '1') return
      const planName = String(query.planName || '').trim()
      const date = this.normalizeDate(query.date) || ''
      const key = `${planName}|${date}`
      if (this.onceRoutePanelKey === key) return
      this.onceRoutePanelKey = key
      this.openOnceChangesDrawer(planName, date)
    },
    async loadPlanTasks(plan, options = {}) {
      if (!plan || plan.tasksLoaded || plan.tasksLoading) return
      const silent = options?.silent === true
      this.setPlanTasksLoading(plan, true)
      try {
        const payload = await fetchScheduleTasks(plan.name)
        const tasks = Array.isArray(payload?.tasks) ? payload.tasks : []
        this.applyPlanTasksPayload(plan, tasks)
      } catch (err) {
        // The background warm (warmSuspectPlanTaskCounts) runs unprompted, so a
        // failed correction must not surface a toast — the user never asked for
        // it and the stale summary count is a harmless fallback. A manual expand
        // still surfaces the error so the user knows their action failed.
        if (silent) {
          // eslint-disable-next-line no-console
          console.warn('[loadPlanTasks] silent warm failed', plan?.name, err)
        } else {
          this.$message.error('加载方案任务失败')
        }
      } finally {
        this.setPlanTasksLoading(plan, false)
      }
    },
    async reloadPlanTasksFromRemote(plan, options = {}) {
      // Force-refresh a single plan's tasks from the live remote, bypassing
      // the tasksLoaded cache. Used after per-edit immediate mutations
      // (updateSingleTask / deleteSingleTask) so the UI reflects the new
      // remote state without falling into the require-atomic-updates trap
      // of flipping tasksLoaded around an await.
      if (!plan || !plan.name) return
      const silent = options?.silent === true
      this.setPlanTasksLoading(plan, true)
      try {
        const payload = await fetchScheduleTasks(plan.name)
        const tasks = Array.isArray(payload?.tasks) ? payload.tasks : []
        this.applyPlanTasksPayload(plan, tasks)
      } catch (err) {
        // The background warm runs unprompted, so a failed correction stays
        // quiet (the stale count is a harmless fallback). Manual / per-edit
        // callers keep surfacing the error.
        if (silent) {
          // eslint-disable-next-line no-console
          console.warn('[reloadPlanTasksFromRemote] silent warm failed', plan?.name, err)
        } else {
          this.$message.error('刷新方案任务失败')
        }
      } finally {
        this.setPlanTasksLoading(plan, false)
      }
    },
    setPlanTasksLoading(plan, loading) {
      if (!plan || typeof plan !== 'object') return
      plan.tasksLoading = Boolean(loading)
    },
    applyPlanTasksPayload(plan, tasks) {
      if (!plan || typeof plan !== 'object') return
      const mappedTasks = (Array.isArray(tasks) ? tasks : []).map((task, idx) => this.buildPlanTaskFromSchedule(task, idx))
      plan.tasks = mappedTasks
      plan.tasksLoaded = true
      plan.taskCount = mappedTasks.length
      this.normalizeModules()
      this.sortTasksByTime(plan.tasks)
    },
    warmSuspectPlanTaskCounts() {
      // The plans summary draws task_count from the flat sechinfoall endpoint,
      // which returns a single placeholder row for a just-created schedule while
      // the authoritative per-schedule sechetaskinfo endpoint already has the
      // full set. That makes a fresh plan show "1 task" until refresh/expand.
      //
      // T46: the AI-create refresh comes through the FULL endpoint, which embeds
      // that single placeholder row AND sets tasks_loaded=true — so the plan
      // arrives as tasksLoaded=true + taskCount=1 and the old `tasksLoaded ===
      // false` guard let it slip through uncorrected. We now warm purely on
      // `taskCount <= 1` and go through reloadPlanTasksFromRemote, which has NO
      // tasksLoaded guard (loadPlanTasks would no-op on a tasksLoaded=true plan).
      //
      // warmedPlanNames (component-level Set, keyed by plan.id = schedule name)
      // keeps a genuinely 0/1-task plan from being re-fetched on every refresh.
      // It is keyed by name, not the plan object, because plan objects are
      // rebuilt on every refresh — a per-object flag would reset and re-warm
      // each time (critic-fix12 MINOR f1). pruneWarmedPlanNames() drops names
      // that no longer exist so a delete + same-name recreate can warm again.
      // This only mutates plan.tasks/taskCount/tasksLoaded; it never touches the
      // draft dirty calculation (KP #22).
      if (!this.warmedPlanNames) this.warmedPlanNames = new Set()
      this.pruneWarmedPlanNames()
      const plans = Array.isArray(this.modules?.plans) ? this.modules.plans : []
      plans
        .filter((plan) => {
          if (!plan || Number(plan.taskCount) > 1) return false
          return !this.warmedPlanNames.has(this.warmPlanKey(plan))
        })
        .forEach((plan) => {
          this.warmedPlanNames.add(this.warmPlanKey(plan))
          this.reloadPlanTasksFromRemote(plan, { silent: true })
        })
    },
    warmPlanKey(plan) {
      return String(plan?.id ?? plan?.name ?? '').trim()
    },
    pruneWarmedPlanNames() {
      // Drop warmed-name entries whose plan no longer exists (e.g. deleted), so
      // a later same-name recreate is warmed again instead of being skipped.
      if (!this.warmedPlanNames || !this.warmedPlanNames.size) return
      const plans = Array.isArray(this.modules?.plans) ? this.modules.plans : []
      const live = new Set(plans.map((plan) => this.warmPlanKey(plan)))
      for (const key of Array.from(this.warmedPlanNames)) {
        if (!live.has(key)) this.warmedPlanNames.delete(key)
      }
    },
    async loadBroadcasts() {
      if (this.broadcastsLoaded || this.broadcastsLoading) return
      this.setTableLoading('broadcasts', true)
      this.broadcastsLoading = true
      const buildBroadcastBaseSnapshot = typeof this.buildBroadcastBaseSnapshot === 'function'
        ? this.buildBroadcastBaseSnapshot.bind(this)
        : (rows) => this.cloneRows(rows)
      const clearBroadcastDraftState = typeof this.clearBroadcastDraftState === 'function'
        ? this.clearBroadcastDraftState.bind(this)
        : () => {
          this.draftState = clearBroadcastDraft()
        }
      try {
        await this.withBroadcastDraftSyncSuspendedAsync(async() => {
          const payload = await fetchBroadcasts()
          const broadcasts = Array.isArray(payload?.broadcasts) ? payload.broadcasts : []
          const remoteRows = this.cloneRows(broadcasts)
          const needsAllTask = remoteRows.some((row) => {
            const hasLocation = Array.isArray(row?.location) && row.location.length
            const hasTerminals = Array.isArray(row?.terminalids) && row.terminalids.length
            const hasNames = Array.isArray(row?.terminalnames) && row.terminalnames.length
            return !hasLocation && !hasTerminals && !hasNames
          })
          if (needsAllTask) {
            try {
              const allPayload = await fetchAllTask()
              this.applyTerminalInfoFromAllTask(remoteRows, allPayload)
            } catch (err) {
              // ignore, fallback to row data
            }
          }
          const remoteSnapshot = buildBroadcastBaseSnapshot(remoteRows)
          this.lastSyncedBroadcasts = this.cloneRows(broadcasts)
          this.lastSyncedBroadcastBaseSnapshot = this.cloneRows(remoteSnapshot)
          const hasDraft = hasSchedulerDirtyScope('broadcasts', this.draftState)
          if (hasDraft) {
            const normalizedDraft = buildBroadcastBaseSnapshot(this.draftState?.broadcasts)
            // T51 ②: auto-clear when the draft differs from the server only in
            // derived/format fields (taskstate / time format / liveterminalname)
            // — substantively equal → the draft is stale, do not re-perpetuate
            // it. A substantive edit (status / volume / audio / terminals) still
            // keeps the draft so batch staging is never swallowed (KP #22 r2).
            if (areBroadcastRowsSubstantivelyEqual(normalizedDraft, remoteSnapshot)) {
              clearBroadcastDraftState()
              this.setBroadcastRows(remoteSnapshot)
            } else {
              this.draftState = saveBroadcastDraft(normalizedDraft, remoteSnapshot)
              if (hasSchedulerDirtyScope('broadcasts', this.draftState)) {
                this.setBroadcastRows(this.draftState.broadcasts)
              } else {
                this.setBroadcastRows(remoteSnapshot)
              }
            }
          } else {
            this.setBroadcastRows(remoteSnapshot)
          }
          this.broadcastsLoaded = true
        })
      } catch (err) {
        this.$message.error('加载文件广播失败')
      } finally {
        this.broadcastsLoading = false
        this.setTableLoaded('broadcasts', true)
        this.setTableLoading('broadcasts', false)
      }
    },
    async backfillBroadcastsFromRemote() {
      // T51 ①: after an immediate broadcast add, the local row we unshifted is
      // shape-A (status '待执行', taskstate null, time 'HH:MM:SS', a populated
      // liveterminalname …) while the server's canonical form is shape-B. Left
      // alone, that fork lets the draft self-perpetuate across refreshes
      // (loadBroadcasts hasDraft branch keeps re-saving the never-equal row).
      // Re-fetch so the server canonical form replaces the locally-built row in
      // all three sources of truth (modules + lastSynced + base snapshot).
      //
      // Best-effort: the POST already ACKed, so a failed GET must NOT make the
      // add look failed (KP #19). loadBroadcasts owns its own try/catch (keeps
      // the local rows + surfaces 加载文件广播失败), and we additionally guard
      // here so nothing throws out of the add flow.
      this.broadcastsLoaded = false
      try {
        await this.loadBroadcasts()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[backfillBroadcastsFromRemote] canonical refill failed; keeping local row', err)
      }
    },
    // ── Broadcast inline edit (T57 批1 地基) ──────────────────────────────
    //
    // Each editable broadcast cell commits its single field immediately on
    // @change/@blur via commit_broadcast_fields (the same leaf the drawer uses),
    // then canonical-refills from the remote so the locally-edited row never
    // forks from the server form (KP#23). This generic helper is what 批2-4
    // inherit — they only supply the field's alias + dirty_fields + any strip.
    broadcastInlineCellKey(row, field) {
      const taskId = String(row?.taskid || row?.id || '').trim()
      return `${taskId}__${field}`
    },
    broadcastInlineCellError(row, field) {
      return this.broadcastInlineErrors[this.broadcastInlineCellKey(row, field)] || ''
    },
    clearBroadcastInlineCellError(row, field) {
      const key = this.broadcastInlineCellKey(row, field)
      if (this.broadcastInlineErrors[key]) {
        this.$delete(this.broadcastInlineErrors, key)
      }
    },
    isBroadcastInlineSaving(row, field) {
      return Boolean(this.broadcastInlineSaving[this.broadcastInlineCellKey(row, field)])
    },
    // Build the {row, dirty_fields} payload for a single inline field edit.
    // fieldSpec describes how the field maps onto the remote payload:
    //   { dirtyFields: [...], apply(payload) {...}, strip: [...] }
    // The payload starts as a clone of the row with `value` already applied to
    // the canonical key, then apply() sets aliases and strip[] removes id
    // columns that would short-circuit fuzzy fallback (mediaid / terminal ids).
    buildBroadcastInlinePayload(row, fieldSpec) {
      const payload = { ...(row || {}) }
      delete payload._draftDirty
      delete payload._draftPatch
      delete payload._originalSnapshot
      if (typeof fieldSpec.apply === 'function') {
        fieldSpec.apply(payload)
      }
      if (Array.isArray(fieldSpec.strip)) {
        fieldSpec.strip.forEach((key) => { delete payload[key] })
      }
      return payload
    },
    // The generic per-field immediate commit. Returns true on success.
    //
    // T62: this is no longer wired from the cell @change (which now records a
    // per-row draft via recordBroadcastInlineDraft); it stays the single edit
    // leaf that commitBroadcastRowFinish replays each draft field through, and
    // a few specs (KP#19 spec) still call it directly. Behaviour is unchanged.
    async commitBroadcastInlineField(row, field, fieldSpec) {
      const remoteTaskId = String(row?.taskid || row?.id || '').trim()
      if (!remoteTaskId || !/^\d+$/.test(remoteTaskId)) {
        this.$message.error('保存失败：任务编号无效，请重新加载')
        return false
      }
      const cellKey = this.broadcastInlineCellKey(row, field)
      // Idempotency gate: @change + @blur can fire back to back; ignore repeats
      // while a write for this cell is in flight.
      if (this.broadcastInlineSaving[cellKey]) return false
      this.$set(this.broadcastInlineSaving, cellKey, true)
      this.clearBroadcastInlineCellError(row, field)
      try {
        const payload = this.buildBroadcastInlinePayload(row, fieldSpec)
        await commitBroadcastFields(remoteTaskId, {
          row: payload,
          dirty_fields: fieldSpec.dirtyFields
        })
      } catch (err) {
        const status = err && err.response && err.response.status
        const detail = (err && err.response && err.response.data && err.response.data.detail) ||
          err?.message || '保存失败，请重试'
        this.$set(this.broadcastInlineErrors, cellKey, detail)
        if (status === 422) {
          this.$message.warning(detail)
        } else {
          this.$message.error(`保存失败：${detail}`)
        }
        return false
      } finally {
        this.$delete(this.broadcastInlineSaving, cellKey)
      }
      // PUT已 200 落库. Mirror the new value onto the row ONLY now (after ACK) so
      // a failed commit never strands an optimistic local mutation that would
      // fork from the server form. The canonical refill then reconciles the row
      // to shape-B; it is best-effort — a failed refill GET keeps the optimistic
      // value and only console.warns, it must NOT tell the user the edit failed
      // (KP#19: the PUT already landed).
      if (typeof fieldSpec.applyToRow === 'function') {
        fieldSpec.applyToRow(row)
      }
      await this.backfillBroadcastsFromRemote()
      this.$message.success('已保存')
      return true
    },
    // ── T62 per-row draft model (照搬 plans T42 的真因: 不碰真行) ──────────
    //
    // A broadcast cell edit no longer writes immediately AND no longer mutates
    // the modules.broadcasts row. It records the change into an OFF-ROW store
    // (broadcastRowDrafts, keyed by task id):
    //   broadcastRowDrafts[taskId].patch[field] = { value, spec }
    // where spec is the same {dirtyFields, apply, strip} the immediate handler
    // built — so 完成 replays every staged field through the one
    // commitBroadcastFields leaf.
    //
    // Why off-row (critic r1 f1): the modules.broadcasts deep watcher (:1804)
    // fires on ANY row mutation → syncBroadcastDraftState diffs vs the synced
    // base snapshot. canonicalizeBroadcastRowForCompare does NOT strip draft
    // markers and DOES compare field values, so writing either the optimistic
    // value OR a _draftPatch marker onto the reactive row染es dirtyScopes with
    // 'broadcasts' → hasSchedulerDirtyScope fallback → global "保存上传" badge
    // false-positive (KP#22/#23). Keeping the draft off-row leaves the real row
    // == the synced snapshot, so the watcher (even if it fires) finds no diff.
    // The cell editors read an overlay (broadcastDraftValue) to show the staged
    // value without touching the row — exactly plans T42's真做法.
    broadcastRowDraftKey(row) {
      return String(row?.taskid || row?.id || '').trim()
    },
    broadcastRowDraftEntry(row) {
      return this.broadcastRowDrafts[this.broadcastRowDraftKey(row)] || null
    },
    isBroadcastRowDirty(row) {
      const entry = this.broadcastRowDraftEntry(row)
      return Boolean(entry && entry.patch && Object.keys(entry.patch).length)
    },
    // Overlay read: the staged draft value for a field, else the row's value.
    // Drives every editable cell's :value / :class so staging shows immediately
    // without mutating the row.
    broadcastDraftValue(row, field) {
      const entry = this.broadcastRowDraftEntry(row)
      if (entry && entry.patch && Object.prototype.hasOwnProperty.call(entry.patch, field)) {
        return entry.patch[field].value
      }
      return row ? row[field] : undefined
    },
    // Overlay for the weekday grid's active state (staged weekdays else row's).
    broadcastDraftWeekdays(row) {
      const value = this.broadcastDraftValue(row, 'weekdays')
      return Array.isArray(value) ? value : []
    },
    // Overlay for the duration cell's three derived fields. The staged draft
    // value is the resolved candidate {mode, loop, duration, ...}; fall back to
    // the row's field when not staged.
    broadcastDraftDuration(row, key) {
      const entry = this.broadcastRowDraftEntry(row)
      if (entry && entry.patch && entry.patch.duration) {
        const cand = entry.patch.duration.value || {}
        if (key === 'mode') return cand.mode || 'loop'
        return cand[key]
      }
      if (key === 'mode') return (row && row.durationMode) || 'loop'
      return row ? row[key] : undefined
    },
    recordBroadcastInlineDraft(row, field, value, spec) {
      if (!row) return
      const key = this.broadcastRowDraftKey(row)
      if (!key) return
      if (!this.broadcastRowDrafts[key]) {
        this.$set(this.broadcastRowDrafts, key, { patch: {}})
      }
      // NOTE: deliberately do NOT mutate row[field] — the overlay accessors show
      // the staged value; the real row stays == the synced snapshot.
      this.$set(this.broadcastRowDrafts[key].patch, field, { value, spec })
    },
    isBroadcastRowFinishing(row) {
      return Boolean(this.broadcastRowFinishing[this.broadcastRowDraftKey(row)])
    },
    // 完成: pack every staged field into ONE commitBroadcastFields PUT (一次 PUT
    // 重建一次 triad,比逐格即时省). Each draft entry carries the field's spec,
    // so the merge inherits the immediate handlers' aliasing (taskname/medianame
    // /starttime…), id-stripping (audio→strip mediaid, location→strip 5 id cols)
    // and fail-loud 422 behaviour without re-implementing any of it.
    async commitBroadcastRowFinish(row) {
      if (!row) return
      const remoteTaskId = this.broadcastRowDraftKey(row)
      if (!remoteTaskId || !/^\d+$/.test(remoteTaskId)) {
        this.$message.error('保存失败：任务编号无效，请重新加载')
        return
      }
      if (this.broadcastRowFinishing[remoteTaskId]) return
      const entry = this.broadcastRowDraftEntry(row)
      const patch = (entry && entry.patch) || {}
      const fields = Object.keys(patch)
      if (!fields.length) {
        // Nothing staged — recover the default action buttons (defensive).
        this.clearBroadcastRowDraft(row)
        return
      }
      // Merge all staged specs into one payload + one dirty_fields list. The
      // payload starts as a clone of the row (the synced form), each spec.apply
      // sets its alias from the staged value (captured in closure), each
      // spec.strip removes id columns so the backend re-resolves fuzzily.
      const dirtyFields = []
      const applyFns = []
      const stripKeys = []
      fields.forEach((field) => {
        const spec = (patch[field] && patch[field].spec) || {}
        if (Array.isArray(spec.dirtyFields)) {
          spec.dirtyFields.forEach((df) => { if (!dirtyFields.includes(df)) dirtyFields.push(df) })
        }
        if (typeof spec.apply === 'function') applyFns.push(spec.apply)
        if (Array.isArray(spec.strip)) {
          spec.strip.forEach((key) => { if (!stripKeys.includes(key)) stripKeys.push(key) })
        }
      })
      const mergedSpec = {
        dirtyFields,
        strip: stripKeys,
        apply: (payload) => { applyFns.forEach((fn) => fn(payload)) }
      }
      this.$set(this.broadcastRowFinishing, remoteTaskId, true)
      this.clearBroadcastInlineCellError(row, 'row')
      try {
        const payload = this.buildBroadcastInlinePayload(row, mergedSpec)
        await commitBroadcastFields(remoteTaskId, {
          row: payload,
          dirty_fields: dirtyFields
        })
      } catch (err) {
        const status = err && err.response && err.response.status
        const detail = (err && err.response && err.response.data && err.response.data.detail) ||
          err?.message || '保存失败，请重试'
        this.$set(this.broadcastInlineErrors, this.broadcastInlineCellKey(row, 'row'), detail)
        if (status === 422) {
          this.$message.warning(detail)
        } else {
          this.$message.error(`保存失败：${detail}`)
        }
        // Keep the draft staged so the user can fix + retry — do NOT clear.
        return
      } finally {
        this.$delete(this.broadcastRowFinishing, remoteTaskId)
      }
      // PUT 200 落库. Drop the off-row draft, then canonical-refill so the server
      // form (shape-B) becomes the row in all sources of truth — never let a
      // locally-built row participate in the dirty compare (KP#23 form fork →
      // "必现重生"). Best-effort refill (KP#19).
      this.clearBroadcastRowDraft(row)
      await this.backfillBroadcastsFromRemote()
      this.$message.success('任务已更新')
    },
    // 取消: drop the staged edits. The row was never mutated, so dropping the
    // off-row draft entry instantly reverts the (overlay-driven) display — no
    // field-by-field restore needed (unlike plans cancelInlineTaskDraft :6522,
    // which had to undo row mutations).
    cancelBroadcastRowDraft(row) {
      if (!row) return
      this.clearBroadcastRowDraft(row)
      this.clearBroadcastInlineCellError(row, 'row')
    },
    clearBroadcastRowDraft(row) {
      const key = this.broadcastRowDraftKey(row)
      if (key && this.broadcastRowDrafts[key]) {
        this.$delete(this.broadcastRowDrafts, key)
      }
    },
    // Click a weekday cell → toggle that day in the row's STAGED weekdays (the
    // overlay, not the row) and record it as a draft. Mirrors the el-select
    // multiple semantics through the same weekdays spec the immediate handler
    // used.
    toggleBroadcastRowWeekday(row, day) {
      if (!row || this.isBroadcastManualOnly(row)) return
      const staged = this.normalizeWeekdays(this.broadcastDraftWeekdays(row))
      const next = staged.includes(day)
        ? staged.filter((d) => d !== day)
        : this.normalizeWeekdays([...staged, day])
      this.recordBroadcastInlineDraft(row, 'weekdays', next, {
        dirtyFields: ['weekdays'],
        apply: (payload) => { payload.weekdays = next }
      })
    },
    // Task name cell. T62: records a per-row draft (off-row) instead of an
    // immediate PUT. No applyToRow — the cell shows the staged value via the
    // broadcastDraftValue overlay, the real row stays == the synced snapshot.
    commitBroadcastInlineName(row, rawValue) {
      const value = String(rawValue == null ? '' : rawValue).trim()
      if (!value) {
        this.$message.warning('任务名称不能为空')
        return
      }
      // no-op vs the currently-shown value (staged overlay, else row)
      if (String(this.broadcastDraftValue(row, 'name') || '') === value) return
      this.recordBroadcastInlineDraft(row, 'name', value, {
        dirtyFields: ['taskname'],
        apply: (payload) => { payload.taskname = value; payload.name = value }
      })
    },
    // Volume cell (0-100).
    commitBroadcastInlineVolume(row, rawValue) {
      const num = Number(rawValue)
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        this.$message.warning('音量需在 0-100 之间')
        return
      }
      const volume = Math.round(num)
      if (Number(this.broadcastDraftValue(row, 'volume')) === volume) return
      this.recordBroadcastInlineDraft(row, 'volume', volume, {
        dirtyFields: ['volume'],
        apply: (payload) => { payload.volume = volume }
      })
    },
    // ── 批2: time / weekdays / duration-mode ─────────────────────────────
    // Time cell. The el-time-picker yields HH:MM:SS directly; pass it through
    // verbatim — do NOT run it through toTime (the backend format_hhmmss keeps
    // seconds, and stripping them re-triggers the KP#23 shape fork / critic r3 f1).
    commitBroadcastInlineTime(row, rawValue) {
      const value = String(rawValue == null ? '' : rawValue).trim()
      // empty = manual-play; allow clearing the time
      if (String(this.broadcastDraftValue(row, 'time') || '') === value) return
      this.recordBroadcastInlineDraft(row, 'time', value, {
        dirtyFields: ['starttime'],
        apply: (payload) => { payload.starttime = value; payload.time = value }
      })
    },
    // Weekdays cell (multi-select array). Kept for the el-select path; the new
    // clickable day grid records through toggleBroadcastRowWeekday instead.
    commitBroadcastInlineWeekdays(row, rawValue) {
      const value = this.normalizeWeekdays(Array.isArray(rawValue) ? rawValue : [])
      const current = this.normalizeWeekdays(this.broadcastDraftWeekdays(row))
      if (JSON.stringify(value) === JSON.stringify(current)) return
      this.recordBroadcastInlineDraft(row, 'weekdays', value, {
        dirtyFields: ['weekdays'],
        apply: (payload) => { payload.weekdays = value }
      })
    },
    // Duration / loop (mutually exclusive). One commit carries both timelength
    // and timelengthtype ('2'=loop count, '1'=duration seconds), mirroring the
    // drawer save aliasing. Called by the durationMode @change and by the value
    // inputs (loop count / duration) @change.
    //
    // Resolve the candidate {mode, loop, duration} from the change, defaulting
    // the same way onDurationModeChange would, reading the staged overlay (not
    // the row) so consecutive edits compound on the staged value. The candidate
    // is recorded into the off-row draft; the row is never mutated (so a staged
    // duration cannot fork the row from the synced snapshot — KP#22/#23).
    resolveBroadcastDurationCandidate(row, change = {}) {
      const useHms = (change.durationFormat ?? this.broadcastDraftDuration(row, 'durationFormat')) === 'hms'
      const mode = (change.mode ?? this.broadcastDraftDuration(row, 'mode')) === 'duration' ? 'duration' : 'loop'
      let loop = change.loop ?? this.broadcastDraftDuration(row, 'loop')
      let duration = change.duration ?? this.broadcastDraftDuration(row, 'duration')
      if (mode === 'loop') {
        loop = Number(loop) > 0 ? Number(loop) : 1
      } else if (!duration) {
        duration = useHms ? '00:05:00' : '05'
      } else if (useHms) {
        duration = this.formatDurationHms(duration)
      }
      const timelength = mode === 'loop'
        ? String(loop || 1)
        : String(this.toDurationSeconds(duration || ''))
      return { mode, loop, duration, timelength, timelengthtype: mode === 'loop' ? '2' : '1' }
    },
    commitBroadcastInlineDuration(row, change = {}) {
      const cand = this.resolveBroadcastDurationCandidate(row, change)
      const noChange = String(this.broadcastDraftDuration(row, 'mode')) === cand.mode &&
        String(this.broadcastDraftDuration(row, 'loop') ?? '') === String(cand.loop ?? '') &&
        String(this.broadcastDraftDuration(row, 'duration') ?? '') === String(cand.duration ?? '')
      if (noChange) return
      this.recordBroadcastInlineDraft(row, 'duration', cand, {
        dirtyFields: ['timelength', 'timelengthtype'],
        apply: (payload) => {
          payload.timelength = cand.timelength
          payload.timelengthtype = cand.timelengthtype
        }
      })
    },
    // ── 批3: audio (f2 scope) ────────────────────────────────────────────
    // The selected value IS the audio name. We strip row.mediaid from the
    // payload so the backend resolve_media_id walks the name → media_map branch
    // within the file-broadcast library (folderid===2), avoiding the f2/f3
    // same-name collision (the drawer save uses the same guardrail).
    commitBroadcastInlineAudio(row, rawValue) {
      const value = String(rawValue == null ? '' : rawValue).trim()
      if (!value) {
        this.$message.warning('请选择音频资源')
        return
      }
      if (String(this.broadcastDraftValue(row, 'audio') || '') === value) return
      this.recordBroadcastInlineDraft(row, 'audio', value, {
        dirtyFields: ['medianame'],
        strip: ['mediaid'],
        apply: (payload) => { payload.medianame = value; payload.audio = value }
      })
    },
    // ── 批4: terminal two-level (zone → terminal) ────────────────────────
    // The el-cascader yields location as an array of [zone, terminal] paths.
    // We send location in dirty_fields and STRIP all five terminal id columns so
    // the backend resolve_terminal_ids re-derives from location with
    // allow_default_fallback=False — an unresolvable / ambiguous edit surfaces as
    // 422, NOT a silent guess (PO钦定 fail-loud). On 422 the shared helper sets
    // the cell error (red highlight) and, because applyToRow runs only after ACK,
    // the row keeps its pre-edit binding so the user can reselect. Real-vendor
    // probe (74206) measured ~1.1s per terminal triad rewrite, so the saving
    // guard on this cell matters for UX.
    commitBroadcastInlineLocation(row, rawValue) {
      const value = Array.isArray(rawValue) ? rawValue : []
      if (!value.length) {
        this.$message.warning('请选择终端地点')
        return
      }
      const staged = this.broadcastDraftValue(row, 'location') || []
      if (JSON.stringify(staged) === JSON.stringify(value)) return
      this.recordBroadcastInlineDraft(row, 'location', value, {
        dirtyFields: ['location'],
        // strip every id column so the backend re-resolves from location
        // (fail-loud 422 when unresolvable) instead of trusting a stale id.
        strip: ['terminalids', 'liveterminalid', 'taskterminal', 'terminalnames', 'liveterminalname'],
        apply: (payload) => { payload.location = value }
      })
    },
    async loadLivecasts() {
      if (this.livecastsLoaded || this.livecastsLoading) return
      this.setTableLoading('livecasts', true)
      this.livecastsLoading = true
      try {
        const payload = await fetchLivecasts()
        this.modules.livecasts = Array.isArray(payload?.livecasts) ? payload.livecasts : []
        this.livecastsLoaded = true
        this.normalizeModules()
        this.sortTasksByTime(this.modules.livecasts)
      } catch (err) {
        this.$message.error('加载采播任务失败')
      } finally {
        this.livecastsLoading = false
        this.setTableLoaded('livecasts', true)
        this.setTableLoading('livecasts', false)
      }
    },
    applyAssistantRuntimePlayPreview(payload = {}) {
      const actionLog = Array.isArray(payload?.action_log) ? payload.action_log : []
      const previews = actionLog
        .filter((item) => item?.action === 'play_media')
        .map((item) => {
          const details = item?.details || {}
          const taskId = String(details.task_id || (Array.isArray(item?.task_ids) ? item.task_ids[0] : '') || '').trim()
          return {
            task_id: taskId,
            id: taskId,
            task_name: String(details.media_name || '').trim(),
            media_id: String(details.media_id || '').trim(),
            media_ids: details.media_id ? [String(details.media_id).trim()] : [],
            media_name: String(details.media_name || '').trim(),
            media_names: details.media_name ? [String(details.media_name).trim()] : [],
            terminal_ids: Array.isArray(details.terminal_ids) ? details.terminal_ids.map((item) => String(item)) : [],
            terminal_names: Array.isArray(details.terminal_names) ? details.terminal_names.map((item) => String(item)) : [],
            volume: Number(details.volume || 0),
            playtype: Number(details.playtype || 0),
            playlength: Number(details.playlength || 0),
            remote_state: 0,
            status: '执行中',
            created_at: String(details.created_at || '').trim(),
            source: 'runtime_play'
          }
        })
        .filter((item) => item.media_name || item.task_id)
      if (!previews.length) return
      const existing = Array.isArray(this.modules.runtimePlays) ? this.cloneRows(this.modules.runtimePlays) : []
      const seen = new Set()
      const merged = []
      ;[...previews, ...existing].forEach((item) => {
        const key = String(item?.task_id || item?.id || '').trim() || JSON.stringify(item)
        if (seen.has(key)) return
        seen.add(key)
        merged.push(item)
      })
      this.modules.runtimePlays = merged
      this.runtimePlaysLoaded = true
      this.setTableLoaded('runtimePlays', true)
      this.syncRuntimePlayPolling(merged)
    },
    async loadRuntimePlays(options = {}) {
      const force = Boolean(options.force)
      if (!force && (this.runtimePlaysLoaded || this.runtimePlaysLoading)) return
      this.setTableLoading('runtimePlays', true)
      this.runtimePlaysLoading = true
      try {
        const payload = await fetchRuntimePlayTasks(force)
        this.modules.runtimePlays = Array.isArray(payload?.runtime_play_tasks) ? payload.runtime_play_tasks : []
        this.runtimePlaysLoaded = true
        this.setTableLoaded('runtimePlays', true)
        this.syncRuntimePlayPolling(this.modules.runtimePlays)
      } catch (err) {
        this.$message.error('加载即时播放任务失败')
      } finally {
        this.runtimePlaysLoading = false
        this.setTableLoading('runtimePlays', false)
      }
    },
    async refreshRuntimePlays() {
      this.runtimePlaysLoaded = false
      await this.loadRuntimePlays({ force: true })
    },
    async stopRuntimePlay(row) {
      const taskId = String(row?.task_id || row?.id || '').trim()
      if (!taskId) {
        this.$message.warning('当前即时播放还没有可用的任务ID')
        return
      }
      try {
        if (row && typeof row === 'object') {
          row.status = '停止'
          row.remote_state = -1
        }
        const payload = await stopRuntimePlayTasks([taskId])
        if (Array.isArray(payload?.runtime_play_tasks)) {
          this.modules.runtimePlays = payload.runtime_play_tasks
          this.runtimePlaysLoaded = true
          this.setTableLoaded('runtimePlays', true)
          this.syncRuntimePlayPolling(this.modules.runtimePlays)
        } else {
          await this.loadRuntimePlays({ force: true })
        }
        emitAssistantRefresh({
          runtime_scope: 'temp_task',
          action_log: [{
            action: 'stop_runtime_play',
            details: {
              runtime_scope: 'temp_task',
              task_id: taskId
            }
          }]
        })
        this.$message.success('即时播放已停止')
      } catch (err) {
        const detail = err?.response?.data?.detail
        this.$message.error(detail || '停止即时播放失败')
        await this.loadRuntimePlays({ force: true })
      }
    },
    async ensurePlanTasksLoaded() {
      const plans = (this.modules.plans || []).filter((plan) => !plan.tasksLoaded)
      if (!plans.length) return
      await Promise.all(plans.map((plan) => this.loadPlanTasks(plan)))
    },
    async ensureAllModulesLoaded(scope) {
      if (scope && scope !== 'all') {
        if (scope === 'plans') {
          await this.ensurePlanTasksLoaded()
        }
        if (scope === 'broadcasts' && !this.broadcastsLoaded) {
          await this.loadBroadcasts()
        }
        if (scope === 'livecasts' && !this.livecastsLoaded) {
          await this.loadLivecasts()
        }
        if (scope === 'runtimePlays' && !this.runtimePlaysLoaded) {
          await this.loadRuntimePlays()
        }
        return
      }
      await this.ensurePlanTasksLoaded()
      if (!this.broadcastsLoaded) {
        await this.loadBroadcasts()
      }
      if (!this.livecastsLoaded) {
        await this.loadLivecasts()
      }
      if (!this.runtimePlaysLoaded) {
        await this.loadRuntimePlays()
      }
    },
    mapAudioOptions(payload) {
      const list = payload && Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : []
      return list
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const name = item.name || item.medianame || item.taskname || item.mediaid
          if (!name) return null
          return {
            label: String(name),
            value: String(name),
            id: item.mediaid,
            folderid: item.folderid
          }
        })
        .filter((item) => item)
    },
    zoneValueLabel(value) {
      const text = value !== undefined && value !== null ? String(value) : '0'
      if (!text || text === '0') return UNASSIGNED_ZONE_LABEL
      const mapping = {
        '1': '区域一',
        '2': '区域二',
        '3': '区域三',
        '4': '区域四',
        '5': '区域五',
        '6': '区域六',
        '7': '区域七',
        '8': '区域八',
        '9': '区域九'
      }
      return mapping[text] || `区域${text}`
    },
    zoneNameFromItem(item) {
      if (!item || typeof item !== 'object') return ''
      return String(item.name || item.zonename || item.zone_name || item.description || '').trim()
    },
    zoneDisplayLabel(value) {
      const text = value !== undefined && value !== null ? String(value) : '0'
      const zoneMap = this.zoneLookup || {}
      const hasZones = Object.keys(zoneMap).length > 0
      if (zoneMap[text]) return zoneMap[text]
      if (hasZones || !text || text === '0') return UNASSIGNED_ZONE_LABEL
      return this.zoneValueLabel(text)
    },
    mapTerminalChildren(list) {
      const items = Array.isArray(list) ? list : []
      const children = []
      const seen = new Set()
      items.forEach((item) => {
        const value = item?.name || item?.ip || item?.id
        if (!value) return
        const key = String(value)
        if (seen.has(key)) return
        seen.add(key)
        children.push({ value: key, label: key })
      })
      return children
    },
    buildLocationOptionsFromZones(zones, zoneTerminals, unassignedTerminals) {
      const options = []
      const zoneList = Array.isArray(zones) ? zones : []
      zoneList.forEach((zone) => {
        if (!zone || typeof zone !== 'object') return
        const zoneId = zone.id ?? zone.zone ?? zone.zoneid
        if (zoneId === undefined || zoneId === null) return
        const label = this.zoneNameFromItem(zone) || this.zoneDisplayLabel(zoneId)
        const groupValue = String(label || this.zoneValueLabel(zoneId))
        const terminals = zoneTerminals && zoneTerminals[String(zoneId)]
          ? zoneTerminals[String(zoneId)]
          : []
        options.push({
          value: groupValue,
          label: String(label || groupValue),
          children: this.mapTerminalChildren(terminals)
        })
      })
      const unassignedChildren = this.mapTerminalChildren(unassignedTerminals)
      if (unassignedChildren.length) {
        options.push({
          value: UNASSIGNED_ZONE_LABEL,
          label: UNASSIGNED_ZONE_LABEL,
          children: unassignedChildren
        })
      }
      return options
    },
    mapLocationOptions(payload) {
      const list = payload && Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : []
      const groups = {}
      list.forEach((item) => {
        if (!item || typeof item !== 'object') return
        if (String(item.type ?? '').trim() === '0') return
        const zone = item.zone !== undefined && item.zone !== null ? String(item.zone) : '0'
        const isUnassignedZone = !zone || zone === '0'
        const groupValue = isUnassignedZone ? UNASSIGNED_ZONE_LABEL : this.zoneValueLabel(zone)
        const label = isUnassignedZone ? UNASSIGNED_ZONE_LABEL : this.zoneDisplayLabel(zone)
        if (!groups[groupValue]) {
          groups[groupValue] = { value: groupValue, label, children: [] }
        }
        const leaf = item.name || item.ip || item.id
        if (!leaf) return
        groups[groupValue].children.push({ value: String(leaf), label: String(leaf) })
      })
      return Object.values(groups)
    },
    applyTerminalInfoFromAllTask(rows, payload) {
      const items = extractList(payload)
      const taskMap = new Map()
      items.forEach((item) => {
        if (!item || typeof item !== 'object') return
        const taskId = item.taskid || item.id || item.task_id
        if (taskId === undefined || taskId === null) return
        taskMap.set(String(taskId), item)
      })
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return
        const taskId = row.id || row.taskid || row.task_id
        if (taskId === undefined || taskId === null) return
        const source = taskMap.get(String(taskId))
        if (!source) return
        if (!Array.isArray(row.terminalids) && Array.isArray(source.terminalids)) {
          row.terminalids = source.terminalids
        }
        if (!Array.isArray(row.terminalnames) && Array.isArray(source.terminalnames)) {
          row.terminalnames = source.terminalnames
        }
        if (!Array.isArray(row.location) && Array.isArray(source.location)) {
          row.location = source.location
        }
        if (!row.liveterminalname && source.liveterminalname) {
          row.liveterminalname = source.liveterminalname
        }
      })
    },
    buildTerminalMaps(zones, zoneTerminals, unassignedTerminals) {
      const zoneList = Array.isArray(zones) ? zones : []
      const zoneNameById = zoneList.reduce((acc, zone) => {
        if (!zone || typeof zone !== 'object') return acc
        const zoneId = zone.id ?? zone.zone ?? zone.zoneid
        if (zoneId === undefined || zoneId === null) return acc
        const zoneLabel = this.zoneNameFromItem(zone) || this.zoneValueLabel(zoneId)
        acc[String(zoneId)] = String(zoneLabel || zoneId)
        return acc
      }, {})
      const zoneValueMap = zoneList.reduce((acc, zone) => {
        if (!zone || typeof zone !== 'object') return acc
        const zoneId = zone.id ?? zone.zone ?? zone.zoneid
        if (zoneId === undefined || zoneId === null) return acc
        const value = this.zoneValueLabel(zoneId)
        const zoneLabel = zoneNameById[String(zoneId)] || value
        acc[String(value)] = String(zoneLabel || value)
        return acc
      }, {})
      const terminalIdMap = {}
      const terminalNameZoneMap = {}
      const addCandidate = (bucket, key, candidate) => {
        if (!key || !candidate) return
        const list = Array.isArray(bucket[key]) ? bucket[key] : []
        const signature = [
          String(candidate.zoneId || ''),
          String(candidate.zoneLabel || ''),
          String(candidate.terminalId || ''),
          String(candidate.terminalName || '')
        ].join('|')
        if (!list.some((item) => [
          String(item?.zoneId || ''),
          String(item?.zoneLabel || ''),
          String(item?.terminalId || ''),
          String(item?.terminalName || '')
        ].join('|') === signature)) {
          list.push(candidate)
        }
        bucket[key] = list
      }
      const zoneEntries = Object.entries(zoneTerminals || {})
      zoneEntries.forEach(([zoneId, terminals]) => {
        const zoneLabel = zoneNameById[String(zoneId)] || this.zoneValueLabel(zoneId)
        const items = Array.isArray(terminals) ? terminals : []
        items.forEach((item) => {
          if (!item || typeof item !== 'object') return
          const terminalId = item?.id ?? item?.terminalid ?? item?.terminal_id
          const name = item?.name || item?.ip || terminalId
          if (terminalId !== undefined && terminalId !== null && name) {
            const candidate = {
              zoneId: String(zoneId),
              zoneLabel: String(zoneLabel || '无分区终端'),
              terminalId: String(terminalId),
              terminalName: String(name)
            }
            addCandidate(terminalIdMap, String(terminalId), candidate)
            addCandidate(terminalNameZoneMap, String(name), candidate)
          }
        })
      })
      const unassignedLabel = '无分区终端'
      const unassignedItems = Array.isArray(unassignedTerminals) ? unassignedTerminals : []
      unassignedItems.forEach((item) => {
        if (!item || typeof item !== 'object') return
        const terminalId = item?.id ?? item?.terminalid ?? item?.terminal_id
        const name = item?.name || item?.ip || terminalId
        if (terminalId !== undefined && terminalId !== null && name) {
          const candidate = {
            zoneId: '0',
            zoneLabel: unassignedLabel,
            terminalId: String(terminalId),
            terminalName: String(name)
          }
          addCandidate(terminalIdMap, String(terminalId), candidate)
          addCandidate(terminalNameZoneMap, String(name), candidate)
        }
      })
      return { zoneValueMap, terminalIdMap, terminalNameZoneMap }
    },
    uniqueTerminalZoneCandidates(list) {
      const values = Array.isArray(list) ? list : []
      const result = []
      const seen = new Set()
      values.forEach((item) => {
        if (!item || typeof item !== 'object') return
        const zoneId = String(item.zoneId ?? '')
        const zoneLabel = String(item.zoneLabel ?? '')
        const terminalId = String(item.terminalId ?? '')
        const terminalName = String(item.terminalName ?? '')
        const signature = [zoneId, zoneLabel, terminalId, terminalName].join('|')
        if (!terminalName || seen.has(signature)) return
        seen.add(signature)
        result.push({ zoneId, zoneLabel, terminalId, terminalName })
      })
      return result
    },
    terminalCandidatesById(terminalId) {
      if (terminalId === undefined || terminalId === null) return []
      const key = String(terminalId)
      const raw = this.terminalIdMap?.[key]
      if (Array.isArray(raw)) return this.uniqueTerminalZoneCandidates(raw)
      if (raw && typeof raw === 'object') {
        return this.uniqueTerminalZoneCandidates([{
          zoneId: String(raw.zoneId ?? ''),
          zoneLabel: String(raw.zoneLabel ?? raw.zone ?? ''),
          terminalId: key,
          terminalName: String(raw.terminalName ?? raw.name ?? '')
        }])
      }
      return []
    },
    terminalCandidatesByName(name) {
      if (!name) return []
      const key = String(name)
      const raw = this.terminalNameZoneMap?.[key]
      if (Array.isArray(raw)) return this.uniqueTerminalZoneCandidates(raw)
      if (raw && typeof raw === 'object') {
        return this.uniqueTerminalZoneCandidates([{
          zoneId: String(raw.zoneId ?? ''),
          zoneLabel: String(raw.zoneLabel ?? raw.zone ?? ''),
          terminalId: String(raw.terminalId ?? ''),
          terminalName: key
        }])
      }
      if (typeof raw === 'string') {
        return this.uniqueTerminalZoneCandidates([{
          zoneId: '',
          zoneLabel: raw,
          terminalId: '',
          terminalName: key
        }])
      }
      return []
    },
    singleLocationPathFromCandidates(candidates) {
      const list = this.uniqueTerminalZoneCandidates(candidates)
      if (list.length !== 1) return []
      const candidate = list[0]
      return [String(candidate.zoneLabel || UNASSIGNED_ZONE_LABEL), String(candidate.terminalName)]
    },
    matchingTerminalCandidatesForLocationEntry(entry) {
      if (!Array.isArray(entry) || !entry.length) return []
      const terminalToken = String(entry[entry.length - 1] ?? '').trim()
      const zoneToken = entry.length >= 2 ? String(entry[entry.length - 2] ?? '').trim() : ''
      if (!terminalToken) return []
      let candidates = /^\d+$/.test(terminalToken)
        ? this.terminalCandidatesById(terminalToken)
        : this.terminalCandidatesByName(terminalToken)
      if (zoneToken) {
        const filtered = candidates.filter((candidate) => String(candidate.zoneLabel) === zoneToken)
        if (filtered.length) candidates = filtered
      }
      return this.uniqueTerminalZoneCandidates(candidates)
    },
    resolveLocationFromRow(row, preferTerminal = true) {
      if (!row || typeof row !== 'object') return []
      const existing = Array.isArray(row.location) ? row.location : []
      const normalizedExisting = this.normalizeLocationPaths(existing)
      if (normalizedExisting.length) return normalizedExisting
      const terminalCandidatesById = typeof this.terminalCandidatesById === 'function'
        ? this.terminalCandidatesById.bind(this)
        : (value) => {
          const raw = this.terminalIdMap?.[String(value)]
          return raw && typeof raw === 'object'
            ? [{ zoneLabel: String(raw.zoneLabel || raw.zone || ''), terminalName: String(raw.name || '') }]
            : []
        }
      const terminalCandidatesByName = typeof this.terminalCandidatesByName === 'function'
        ? this.terminalCandidatesByName.bind(this)
        : (name) => {
          const raw = this.terminalNameZoneMap?.[String(name)]
          if (typeof raw === 'string') return [{ zoneLabel: raw, terminalName: String(name) }]
          return raw && typeof raw === 'object'
            ? [{ zoneLabel: String(raw.zoneLabel || raw.zone || ''), terminalName: String(raw.name || name) }]
            : []
        }
      const singleLocationPathFromCandidates = typeof this.singleLocationPathFromCandidates === 'function'
        ? this.singleLocationPathFromCandidates.bind(this)
        : (candidates) => {
          const list = Array.isArray(candidates) ? candidates : []
          if (list.length !== 1) return []
          const candidate = list[0] || {}
          return [String(candidate.zoneLabel || UNASSIGNED_ZONE_LABEL), String(candidate.terminalName || '')].filter((value) => value)
        }
      const paths = []
      let ambiguous = false
      const ids = Array.isArray(row.terminalids) ? row.terminalids : []
      if (preferTerminal && ids.length) {
        ids.forEach((value) => {
          const candidates = terminalCandidatesById(value)
          const path = singleLocationPathFromCandidates(candidates)
          if (path.length) {
            paths.push(path)
            return
          }
          if (candidates.length > 1) ambiguous = true
        })
        if (ambiguous) return []
      }
      if (!paths.length) {
        const names = Array.isArray(row.terminalnames) ? row.terminalnames : []
        if (preferTerminal && names.length) {
          names.forEach((name) => {
            if (!name) return
            const candidates = terminalCandidatesByName(name)
            const path = singleLocationPathFromCandidates(candidates)
            if (path.length) {
              paths.push(path)
              return
            }
            if (candidates.length > 1) ambiguous = true
          })
          if (ambiguous) return []
        }
      }
      if (!paths.length) {
        const singleName = row.liveterminalname || row.terminalname
        if (singleName) {
          const candidates = terminalCandidatesByName(singleName)
          const path = singleLocationPathFromCandidates(candidates)
          if (path.length) return [path]
          if (candidates.length > 1) return []
        }
      }
      if (paths.length) {
        return paths.filter((path, index, arr) => arr.findIndex((item) => JSON.stringify(item) === JSON.stringify(path)) === index)
      }
      return []
    },
    uniqueStringList(list) {
      const values = Array.isArray(list) ? list : []
      const result = []
      const seen = new Set()
      values.forEach((value) => {
        if (value === undefined || value === null) return
        const text = String(value).trim()
        if (!text || seen.has(text)) return
        seen.add(text)
        result.push(text)
      })
      return result
    },
    buildTerminalNameIdMap() {
      const map = {}
      const terminalIdMap = this.terminalIdMap || {}
      const terminalCandidatesById = typeof this.terminalCandidatesById === 'function'
        ? this.terminalCandidatesById.bind(this)
        : (value) => {
          const raw = terminalIdMap[String(value)]
          return raw && typeof raw === 'object'
            ? [{ terminalName: String(raw.name || ''), terminalId: String(value) }]
            : []
        }
      Object.keys(terminalIdMap).forEach((id) => {
        const candidates = terminalCandidatesById(id)
        const names = this.uniqueStringList(candidates.map((item) => item.terminalName).filter((name) => name))
        if (names.length !== 1) return
        const key = String(names[0])
        if (!map[key]) map[key] = String(id)
      })
      return map
    },
    extractTerminalIdsFromLocation(location) {
      const normalized = this.normalizeLocationPaths(location)
      if (!normalized.length) return []
      const terminalIdMap = this.terminalIdMap || {}
      const nameIdMap = this.buildTerminalNameIdMap()
      const ids = []
      normalized.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return
        const candidate = String(entry[entry.length - 1] ?? '').trim()
        if (!candidate) return
        const matchedCandidates = typeof this.matchingTerminalCandidatesForLocationEntry === 'function'
          ? this.matchingTerminalCandidatesForLocationEntry(entry)
          : []
        const matchedIds = this.uniqueStringList(matchedCandidates.map((item) => item.terminalId).filter((value) => value))
        if (matchedIds.length === 1) {
          ids.push(matchedIds[0])
          return
        }
        if (terminalIdMap[candidate] && /^\d+$/.test(candidate)) {
          ids.push(candidate)
          return
        }
        if (nameIdMap[candidate]) {
          ids.push(nameIdMap[candidate])
          return
        }
        if (/^\d+$/.test(candidate)) {
          ids.push(candidate)
        }
      })
      return this.uniqueStringList(ids)
    },
    resolvePlanTaskTerminalFields(task) {
      const source = task && typeof task === 'object' ? task : {}
      const existingLocation = this.normalizeLocationPaths(source.location)
      const location = existingLocation.length
        ? existingLocation
        : (typeof this.resolveLocationFromRow === 'function' ? this.resolveLocationFromRow(source) : [])
      const locationTerminalIds = this.extractTerminalIdsFromLocation(location)
      const existingTerminalIds = this.uniqueStringList(
        Array.isArray(source.terminalids)
          ? source.terminalids
          : Array.isArray(source.terminal_ids)
            ? source.terminal_ids
            : Array.isArray(source.liveterminalids)
              ? source.liveterminalids
              : []
      )
      const terminalids = locationTerminalIds.length ? locationTerminalIds : existingTerminalIds
      const directTerminal = source.liveterminalid ?? source.terminalid ?? source.terminal_id
      const directTerminalText = directTerminal === undefined || directTerminal === null
        ? ''
        : String(directTerminal).trim()
      if (!terminalids.length && directTerminalText && directTerminalText !== '0') {
        terminalids.push(directTerminalText)
      }

      const namesFromLocation = this.uniqueStringList(
        location
          .filter((entry) => Array.isArray(entry) && entry.length >= 2)
          .map((entry) => String(entry[entry.length - 1] ?? '').trim())
          .filter((value) => value && !/^\d+$/.test(value))
      )
      const terminalCandidatesById = typeof this.terminalCandidatesById === 'function'
        ? this.terminalCandidatesById.bind(this)
        : (value) => {
          const raw = this.terminalIdMap?.[String(value)]
          return raw && typeof raw === 'object'
            ? [{ terminalName: String(raw.name || ''), terminalId: String(value) }]
            : []
        }
      const namesFromIds = this.uniqueStringList(
        terminalids
          .map((id) => {
            const candidates = terminalCandidatesById(id)
            const names = this.uniqueStringList(candidates.map((item) => item.terminalName).filter((name) => name))
            return names.length === 1 ? names[0] : ''
          })
          .filter((name) => name)
      )
      const existingTerminalNames = this.uniqueStringList(
        Array.isArray(source.terminalnames)
          ? source.terminalnames
          : Array.isArray(source.terminal_names)
            ? source.terminal_names
            : Array.isArray(source.liveterminalnames)
              ? source.liveterminalnames
              : []
      )
      const directTerminalName = source.liveterminalname || source.terminalname || source.terminal_name || ''
      const terminalnames = namesFromLocation.length
        ? this.uniqueStringList([...namesFromLocation, ...namesFromIds, ...existingTerminalNames])
        : this.uniqueStringList([...existingTerminalNames, ...namesFromIds])
      if (!terminalnames.length && directTerminalName) {
        terminalnames.push(String(directTerminalName))
      }

      const liveterminalid = terminalids[0] || (directTerminalText && directTerminalText !== '0' ? directTerminalText : '')
      const liveterminalname = terminalnames[0] || (directTerminalName ? String(directTerminalName) : '')

      return {
        location,
        terminalids,
        terminalnames,
        liveterminalid,
        liveterminalname
      }
    },
    sanitizeSchedulePayload(payload) {
      const source = payload && typeof payload === 'object' ? payload : {}
      const schedules = Array.isArray(source.schedules) ? source.schedules : []
      return {
        ...source,
        schedules: schedules.filter((schedule) => {
          const name = String(schedule?.schedule_name || schedule?.name || '').trim()
          return Boolean(name)
        })
      }
    },
    applySchedulePayloadToModules(rawPayload, options = {}) {
      const applyDraftOverlay = options?.applyDraftOverlay !== false
      const payload = this.sanitizeSchedulePayload(rawPayload)
      this.schedulePayload = payload
      const nextModules = this.buildModulesFromSchedules(payload)
      this.modules = nextModules
      this.setPlanRows(nextModules.plans, { rememberRemote: true, clearSelection: false })
      this.notifyIgnoredUnnamedSchedules(rawPayload)
      if (applyDraftOverlay && this.hasPlanDraft && Array.isArray(this.draftState?.plans)) {
        const baseSnapshot = Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
          ? this.draftState.planBaseSnapshot
          : this.lastSyncedPlans
        this.savePlanDraftState(this.draftState.plans, this.draftState.planDirtyIds, baseSnapshot)
        this.setPlanRows(this.draftState.plans, { clearSelection: false })
      }
      this.refreshLoadedPlanOnceTasks()
      this.warmSuspectPlanTaskCounts()
      this.broadcastsLoaded = false
      this.livecastsLoaded = false
      this.runtimePlaysLoaded = false
      return payload
    },
    notifyIgnoredUnnamedSchedules(payload) {
      const count = Number(payload?.ignored_unnamed_schedules || 0)
      if (!count) return
      this.$message.warning(`发现 ${count} 个未命名远端作息，已自动忽略`)
    },
    serializePlanListForApi(plans) {
      const sourcePlans = Array.isArray(plans) ? plans : []
      return sourcePlans.map((plan) => this.serializePlanForApi(plan, sourcePlans))
    },
    buildModulesFromSchedules(payload) {
      const schedules = payload && Array.isArray(payload.schedules) ? payload.schedules : []
      const modules = {
        plans: schedules.map((schedule, index) => this.buildPlanFromSchedule(schedule, index)).filter((plan) => plan),
        broadcasts: [],
        livecasts: []
      }
      return modules
    },
    buildPlanFromSchedule(schedule, index) {
      const name = String(schedule?.schedule_name || schedule?.name || '').trim()
      if (!name) return null
      const tasks = Array.isArray(schedule?.tasks) ? schedule.tasks : []
      const tasksLoaded = schedule?.tasks_loaded === false ? false : tasks.length > 0
      const taskCount = schedule?.task_count !== undefined && schedule?.task_count !== null
        ? schedule.task_count
        : tasks.length
      return {
        id: schedule?.schedule_id || schedule?.schedule_name || `plan-${index + 1}`,
        name,
        originName: name,
        isNew: false,
        status: schedule?.status || '启用',
        tasks: tasks.map((task, idx) => this.buildPlanTaskFromSchedule(task, idx)),
        tasksLoaded,
        tasksLoading: false,
        taskCount
      }
    },
    isOnceEphemeralTask(task) {
      return Boolean(task?.is_once_ephemeral)
    },
    stripOnceEphemeralPlanTasks(tasks) {
      return (Array.isArray(tasks) ? tasks : []).filter((task) => !this.isOnceEphemeralTask(task))
    },
    isActiveOnceOverride(override) {
      if (!override || override.mode !== 'once') return false
      if (String(override.execution_state || '') !== 'scheduled') return false
      if (override.active !== true) return false
      if (override.remote_synced === false) return false
      if (String(override.cleanup_state || '') === 'cleaned') return false
      return true
    },
    activeOnceOverridesForPlan(planName) {
      const targetName = String(planName || '').trim()
      return (Array.isArray(this.taskOverrides) ? this.taskOverrides : []).filter((override) => {
        if (!this.isActiveOnceOverride(override)) return false
        if (!targetName) return true
        return String(override.schedule_name || '').trim() === targetName
      })
    },
    planVisibleTasks(plan) {
      return this.stripOnceEphemeralPlanTasks(plan?.tasks)
    },
    buildPlanOnceTask(override, spec, idx) {
      const defaults = this.newPlanTask()
      const once = buildOnceDisplaySnapshot(spec, override)
      const time = this.toTime(once.time) || ''
      return {
        ...defaults,
        id: `once-${override?.id || 'override'}-${idx}`,
        taskid: once.taskId || '0',
        customName: once.label,
        audio: once.mediaDisplay,
        time,
        duration: once.hasDurationSeconds ? this.formatDurationHms(once.durationSeconds) : '',
        durationMode: 'duration',
        loop: 1,
        weekdays: [],
        dateRange: once.onceDate ? [once.onceDate, once.onceDate] : [],
        location: Array.isArray(once.location) ? once.location : [],
        terminalids: Array.isArray(once.terminalids) ? once.terminalids : [],
        terminalnames: Array.isArray(once.terminalnames) ? once.terminalnames : [],
        liveterminalid: once.liveterminalid || '',
        liveterminalname: once.liveterminalname || '',
        volume: once.hasVolume ? once.volume : '',
        powerOn: true,
        is_once_ephemeral: true,
        once_action: once.onceAction,
        once_date: once.onceDate,
        once_task_id: once.taskId,
        once_role: once.onceRole
      }
    },
    buildOnceTasksForPlan(planName) {
      const rows = []
      this.activeOnceOverridesForPlan(planName).forEach((override, overrideIndex) => {
        const specs = Array.isArray(override?.once_task_specs) ? override.once_task_specs : []
        specs.forEach((spec, specIndex) => {
          rows.push(this.buildPlanOnceTask(override, spec, `${overrideIndex}-${specIndex}`))
        })
      })
      return rows
    },
    refreshLoadedPlanOnceTasks() {
      const plans = Array.isArray(this.modules?.plans) ? this.modules.plans : []
      plans.forEach((plan) => {
        if (!plan || typeof plan !== 'object' || !plan.tasksLoaded) return
        const baseTasks = this.stripOnceEphemeralPlanTasks(plan.tasks)
        plan.tasks = baseTasks
        if (plan.taskCount === undefined || plan.taskCount === null) {
          plan.taskCount = baseTasks.length
        }
        this.sortTasksByTime(plan.tasks)
      })
    },
    openOnceChangesDrawer(planName = '', date = '') {
      this.onceChangesDrawer.visible = true
      this.onceChangesDrawer.planName = String(planName || '').trim()
      this.onceChangesDrawer.date = this.normalizeDate(date) || ''
    },
    closeOnceChangesDrawer() {
      this.onceChangesDrawer.visible = false
      this.onceChangesDrawer.planName = ''
      this.onceChangesDrawer.date = ''
    },
    resolvePlanByName(planName) {
      const targetName = String(planName || '').trim()
      if (!targetName) return null
      return (Array.isArray(this.modules?.plans) ? this.modules.plans : []).find((plan) => String(plan?.name || '').trim() === targetName) || null
    },
    onceItemSourceText(item) {
      if (item?.sourceTaskName) return `来源：${item.sourceTaskName}`
      if (Array.isArray(item?.taskIds) && item.taskIds.length) return `来源任务 ID：${item.taskIds.join('、')}`
      return '来源：—'
    },
    oncePanelSummary(item) {
      if (item?.summaryOnly) {
        const parts = []
        if (Array.isArray(item?.taskIds) && item.taskIds.length) {
          parts.push(`任务 ID：${item.taskIds.join('、')}`)
        }
        if (item?.time && item?.endTime) {
          parts.push(`取消窗口：${item.time} - ${item.endTime}`)
        } else if (item?.time) {
          parts.push(`取消时间：${item.time}`)
        }
        return parts.join(' · ')
      }
      const parts = []
      if (item?.sourceTaskName) parts.push(`来源：${item.sourceTaskName}`)
      if (item?.mediaDisplay) parts.push(`音频：${item.mediaDisplay}`)
      if (item?.time) parts.push(`时间：${item.time}`)
      if (item?.hasDurationSeconds) parts.push(`时长：${item.durationSeconds} 秒`)
      return parts.join(' · ')
    },
    editOncePanelItem(plan, item) {
      if (!plan || !item || !item.canEdit || item.summaryOnly) return
      const draft = this.newPlanTask()
      draft.customName = item.taskLabel || ''
      draft.audio = item.mediaName || ''
      draft.time = this.toTime(item.time) || '00:00:00'
      draft.durationMode = String(item?.editablePayload?.timelengthtype || '') === '2' ? 'loop' : 'duration'
      if (draft.durationMode === 'loop') {
        draft.loop = Number(item?.editablePayload?.timelength || 1) || 1
      } else {
        draft.duration = item?.hasDurationSeconds ? this.formatDurationHms(item.durationSeconds) : ''
      }
      draft.weekdays = Array.isArray(this.weekdaysOptions) ? [...this.weekdaysOptions] : []
      draft.dateRange = item.onceDate ? [item.onceDate, item.onceDate] : []
      draft.volume = item.hasVolume ? item.volume : ''
      draft.location = Array.isArray(item.location) ? this.cloneTask(item.location) : []
      draft.terminalids = Array.isArray(item.terminalids) ? [...item.terminalids] : []
      draft.terminalnames = Array.isArray(item.terminalnames) ? [...item.terminalnames] : []
      draft.liveterminalid = item.liveterminalid || ''
      draft.liveterminalname = item.liveterminalname || ''
      this.repairStoredLocationBinding(draft)
      this.resetTaskDrawerValidation()
      this.taskDrawer = {
        visible: true,
        plan,
        task: null,
        draft,
        isNew: false,
        isOnceOverride: true,
        overrideId: item.overrideId || '',
        onceTaskId: item.onceTaskId || '',
        sourceSummary: item.sourceSummary || ''
      }
    },
    async deleteOncePanelItem(item) {
      if (!item?.overrideId || !item?.onceTaskId || !item?.canDelete) return
      const ok = await this.confirmDelete(`确定删除这条临时任务“${item.taskLabel || item.onceTaskId}”吗？`)
      if (!ok) return
      try {
        await deleteOnceOverrideTask(item.overrideId, item.onceTaskId)
        await this.loadModules()
        if (!this.onceDrawerGroups.length) {
          this.closeOnceChangesDrawer()
        }
        this.$message.success('临时任务已删除')
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message
        this.$message.error(detail || '临时任务删除失败，请重试')
      }
    },
    async undoOncePanelGroup(group) {
      if (!group?.overrideId || !group?.canUndo) return
      const count = Array.isArray(group.items) ? group.items.length : 0
      const ok = await this.confirmDelete(`将撤销本批 ${count || 1} 条一次性任务，已下发的一次性任务会被删除。是否继续？`)
      if (!ok) return
      try {
        const result = await undoOnceOverride(group.overrideId)
        await this.loadModules()
        if (!this.onceDrawerGroups.length) {
          this.closeOnceChangesDrawer()
        }
        const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : []
        if (warnings.length) {
          this.$message.warning(warnings[0])
        } else {
          this.$message.success('已撤销本批一次性任务')
        }
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message
        if (detail && typeof detail === 'object' && detail.status === 'partial_failed') {
          await this.loadModules()
          if (!this.onceDrawerGroups.length) {
            this.closeOnceChangesDrawer()
          }
          this.$message.warning(detail.message || '部分撤销失败，已刷新剩余临时任务')
          return
        }
        this.$message.error(detail || '临时变更撤销失败，请重试')
      }
    },
    planDisplayTaskCount(plan) {
      if (!plan || typeof plan !== 'object') return 0
      if (plan.taskCount !== undefined && plan.taskCount !== null) {
        return Number(plan.taskCount) || 0
      }
      return this.stripOnceEphemeralPlanTasks(plan.tasks).length
    },
    planOnceTaskCount(plan) {
      return countOnceSpecs(this.activeOnceOverridesForPlan(plan?.name || ''))
    },
    planTaskCountHint(plan) {
      const count = this.planOnceTaskCount(plan)
      return count > 0 ? ` + ${count} 个一次性任务` : ''
    },
    onceActionLabel(task) {
      const action = String(task?.once_action || '').trim()
      if (action === 'migrate') return '迁移后'
      if (action === 'swap') return '互换后'
      return '一次性'
    },
    buildPlanTaskFromSchedule(task, idx) {
      const defaults = this.newPlanTask()
      const realTaskId = this.normalizeRealTaskId(
        task?.taskid ?? task?.task_id ?? task?.taskId ?? task?.sechetaskid ?? task?.id
      )
      const time = this.toTime(task?.starttime) || defaults.time
      const durationMode = String(task?.timelengthtype) === '2' ? 'loop' : 'duration'
      const duration = durationMode === 'loop'
        ? defaults.duration
        : this.toDurationSecondsFromApi(task?.timelength, task?.timelengthtype, defaults.duration)
      const loop = durationMode === 'loop' ? (task?.timelength || defaults.loop) : defaults.loop
      const dateRange = this.normalizeDateRange(task?.startdate, task?.enddate)
      const customName = task?.customName || task?.taskname || defaults.customName
      const audio = task?.audio || task?.medianame || task?.taskname || defaults.audio
      const weekdays = this.normalizeWeekdays(Array.isArray(task?.weekdays) ? task.weekdays : defaults.weekdays)
      const location = Array.isArray(task?.location) ? task.location : []
      const terminalids = this.uniqueStringList(
        Array.isArray(task?.terminalids)
          ? task.terminalids
          : Array.isArray(task?.terminal_ids)
            ? task.terminal_ids
            : Array.isArray(task?.liveterminalids)
              ? task.liveterminalids
              : []
      )
      const terminalnames = this.uniqueStringList(
        Array.isArray(task?.terminalnames)
          ? task.terminalnames
          : Array.isArray(task?.terminal_names)
            ? task.terminal_names
            : Array.isArray(task?.liveterminalnames)
              ? task.liveterminalnames
              : []
      )
      const directTerminal = task?.liveterminalid ?? task?.terminalid ?? task?.terminal_id
      const liveterminalid = directTerminal !== undefined && directTerminal !== null && String(directTerminal).trim()
        ? String(directTerminal).trim()
        : (terminalids[0] || '')
      const liveterminalname = task?.liveterminalname || task?.terminalname || task?.terminal_name || terminalnames[0] || ''
      const powerOn = typeof task?.powerOn === 'boolean'
        ? task.powerOn
        : task?.enablestate === 0
          ? false
          : defaults.powerOn
      const taskLevel = task?.taskLevel || defaults.taskLevel
      const sendMode = task?.sendMode || defaults.sendMode
      const playMode = task?.playMode || defaults.playMode
      const ledSetting = task?.ledSetting || defaults.ledSetting
      return {
        ...defaults,
        id: this.normalizeTempTaskId(task?.id ?? task?.taskid, idx),
        taskid: realTaskId || '0',
        customName,
        audio,
        time,
        duration,
        durationMode,
        loop,
        weekdays,
        dateRange,
        volume: typeof task?.volume === 'number' ? task.volume : defaults.volume,
        location,
        terminalids,
        terminalnames,
        liveterminalid,
        liveterminalname,
        powerOn,
        taskLevel,
        sendMode,
        playMode,
        ledSetting
      }
    },
    buildSchedulePayload(scope, options = {}) {
      const base = {}
      const { planRows = null, strict = false } = options
      const version = this.schedulePayload && typeof this.schedulePayload === 'object'
        ? this.schedulePayload.version
        : null
      base.version = version || '1.0'
      const target = scope || this.activeTab || 'all'
      if (target === 'all' || target === 'plans') {
        const sourcePlans = Array.isArray(planRows) ? planRows : (this.modules.plans || [])
        base.schedules = strict
          ? this.serializePlanListForApi(sourcePlans)
          : sourcePlans.map((plan, index) => this.buildScheduleFromPlan(plan, index)).filter((plan) => plan)
      }
      return base
    },
    _buildPendingOverwritePlansLegacy(planIds = null) {
      const dirtyIds = Array.isArray(planIds) && planIds.length
        ? this.normalizePlanDraftIds(planIds)
        : this.normalizePlanDraftIds(this.draftState?.planDirtyIds)
      const currentPlans = this.preparePlanRows(this.modules?.plans)
      const currentPlanMap = new Map(currentPlans.map((plan) => [String(plan?.id ?? ''), plan]))
      const baseSource = Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
        ? this.draftState.planBaseSnapshot
        : this.lastSyncedPlans
      const nextPlans = this.buildPlanBaseSnapshot(baseSource)
      const basePlans = this.buildPlanBaseSnapshot(baseSource)

      dirtyIds.forEach((planId) => {
        const nextPlan = currentPlanMap.get(String(planId))
        const baseIndex = this.findPlanIndexById(nextPlans, planId)
        if (!nextPlan) {
          if (baseIndex >= 0) {
            nextPlans.splice(baseIndex, 1)
          }
          return
        }
        const preparedPlan = this.preparePlanRows([nextPlan])[0]
        if (baseIndex >= 0) {
          nextPlans.splice(baseIndex, 1, preparedPlan)
          return
        }
        nextPlans.push(preparedPlan)
      })

      const unresolvedDirtyIds = dirtyIds.filter((planId) => {
        const existsInCurrent = currentPlanMap.has(String(planId))
        const existsInBase = this.findPlanIndexById(basePlans, planId) >= 0
        return !existsInCurrent && !existsInBase
      })
      if (unresolvedDirtyIds.length) {
        throw new Error(`存在无法解析的作息草稿标识：${unresolvedDirtyIds.join('、')}`)
      }
      const serialized = this.serializePlanListForApi(nextPlans)
      if (serialized.length !== nextPlans.length) {
        throw new Error('作息方案序列化失败，已阻止静默丢失方案')
      }
      return nextPlans
    },
    buildPendingOverwritePlans(options = {}) {
      const targetIds = Array.isArray(options?.planIds) && options.planIds.length
        ? new Set(this.normalizePlanDraftIds(options.planIds))
        : null
      const dirtyIds = targetIds
        ? this.normalizePlanDraftIds(this.draftState?.planDirtyIds).filter((id) => targetIds.has(String(id)))
        : this.normalizePlanDraftIds(this.draftState?.planDirtyIds)
      const deletedIds = targetIds
        ? this.normalizePlanDraftIds(this.draftState?.planDeletedIds).filter((id) => targetIds.has(String(id)))
        : this.normalizePlanDraftIds(this.draftState?.planDeletedIds)
      const currentPlans = this.preparePlanRows(this.modules?.plans)
      const baseSource = Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
        ? this.draftState.planBaseSnapshot
        : this.lastSyncedPlans
      const basePlans = this.buildPlanBaseSnapshot(baseSource)
      const diff = diffPlanDraft(basePlans, currentPlans, dirtyIds, deletedIds)
      const removedSet = new Set(diff.removed.map((plan) => String(plan?.id ?? '')).filter((item) => item))
      const updatedMap = new Map(diff.updated.map((plan) => [String(plan?.id ?? ''), plan]))
      const nextPlans = basePlans
        .filter((plan) => !removedSet.has(String(plan?.id ?? '')))
        .map((plan) => {
          const replacement = updatedMap.get(String(plan?.id ?? ''))
          return replacement ? this.preparePlanRows([replacement])[0] : plan
        })
      diff.added.forEach((plan) => {
        nextPlans.push(this.preparePlanRows([plan])[0])
      })
      const serialized = this.serializePlanListForApi(nextPlans)
      if (serialized.length !== nextPlans.length) {
        throw new Error('作息方案序列化失败，已阻止静默丢失方案。')
      }
      return nextPlans
    },
    buildPendingOverwritePayload(options = {}) {
      const nextPlans = this.buildPendingOverwritePlans(options)
      const payload = this.buildSchedulePayload('plans', { planRows: nextPlans, strict: true })
      const directories = Array.isArray(this.schedulePayload?.directories) ? this.schedulePayload.directories : []
      if (directories.length) {
        payload.directories = this.cloneRows(directories)
      }
      return payload
    },
    buildAllTaskPayload(scope) {
      const target = scope || this.activeTab || 'all'
      const today = new Date().toISOString().slice(0, 10)
      const data = []
      if (target === 'all' || target === 'broadcasts') {
        data.push(...(this.modules.broadcasts || [])
          .map((row) => this.buildAllTaskRow(row, 2, today))
          .filter((row) => row))
      }
      if (target === 'all' || target === 'livecasts') {
        data.push(...(this.modules.livecasts || [])
          .map((row) => this.buildAllTaskRow(row, 3, today))
          .filter((row) => row))
      }
      return { data }
    },
    buildAllTaskRow(row, tasktype, today) {
      if (!row || typeof row !== 'object') return null
      const durationMode = row.durationMode === 'loop' ? 'loop' : 'duration'
      const useHmsDuration = row.durationFormat === 'hms'
      const timelength = durationMode === 'loop'
        ? (row.loop || 1)
        : this.formatTaskinfoDurationForApi(row.duration, useHmsDuration ? 'seconds' : 'minutes')
      const timelengthtype = durationMode === 'loop' ? '2' : '1'
      const starttime = this.toTime(row.time || row.starttime || '')
      const realTaskId = this.normalizeRealTaskId(row.taskid ?? row.task_id ?? row.id)
      const livecastLabel = row.name || row.audio || ''
      const taskName = tasktype === 3 ? livecastLabel : (row.name || row.audio || '')
      const mediaName = tasktype === 3 ? livecastLabel : (row.audio || row.name || '')
      const resolvePlanTaskTerminalFields = typeof this.resolvePlanTaskTerminalFields === 'function'
        ? this.resolvePlanTaskTerminalFields.bind(this)
        : (value) => ({
          location: Array.isArray(value?.location) ? value.location : [],
          terminalids: Array.isArray(value?.terminalids) ? value.terminalids : [],
          terminalnames: Array.isArray(value?.terminalnames) ? value.terminalnames : [],
          liveterminalid: value?.liveterminalid || '',
          liveterminalname: value?.liveterminalname || ''
        })
      const terminalFields = resolvePlanTaskTerminalFields(row)
      return {
        taskid: realTaskId || '0',
        prepower: typeof row.prepower === 'number' ? row.prepower : (Number(row.prepower) || 0),
        level: typeof row.level === 'number' ? row.level : (Number(row.level) || 0),
        volume: typeof row.volume === 'number' ? row.volume : 50,
        priority: 0,
        datasendmodel: 0,
        startdate: row.startdate || today,
        enddate: row.enddate || today,
        execmode: 0,
        // T15: carry the selected weekdays so the backend
        // build_remote_taskinfo_payload T61 bridge derives execmode from them
        // (execmode stays 0 here; the bridge encodes weekdays → bitmask when
        // execmode is 0). Without this the add POST sent execmode=0 + no
        // weekdays → the schedule's周期 never persisted, and the optimistic row
        // (with weekdays) forked from the canonical backfill (weekdays=[] from
        // execmode=0) → phantom draft. Empty array when none selected (manual
        // play), which the bridge leaves as execmode=0.
        weekdays: Array.isArray(row.weekdays) ? row.weekdays : [],
        tasktype,
        taskname: taskName,
        starttime,
        timelength: String(timelength),
        timelengthtype: String(timelengthtype),
        israndomplay: 0,
        medianame: mediaName,
        sechename: '',
        cmd: 0,
        cmdargs: 0,
        bandrate: 0,
        liveterminalid: terminalFields.liveterminalid || row.liveterminalid || 0,
        liveterminalname: terminalFields.liveterminalname || row.liveterminalname || '',
        terminalids: terminalFields.terminalids,
        terminalnames: terminalFields.terminalnames,
        samplerate: 0,
        caiboprepower: 0,
        taskstate: row.taskstate ?? null,
        state: row.state ?? null,
        enablestate: row.enablestate ?? 1,
        status: row.status || '',
        location: Array.isArray(terminalFields.location) ? terminalFields.location : []
      }
    },
    buildScheduleFromPlan(plan, index) {
      const scheduleName = typeof plan?.name === 'string' ? plan.name.trim() : ''
      if (!scheduleName) return null
      const tasks = this.stripOnceEphemeralPlanTasks(plan?.tasks)
      const payload = {
        schedule_name: scheduleName,
        status: plan?.status || '启用',
        tasks: tasks.map((task, idx) => this.buildScheduleTaskFromPlan(task, idx, tasks.length))
      }
      const originName = typeof plan?.originName === 'string' ? plan.originName.trim() : ''
      if (originName && originName !== payload.schedule_name) {
        payload.origin_name = originName
      }
      return payload
    },
    collectPlanSaveValidationErrors(planIds = null) {
      const targetIds = Array.isArray(planIds) && planIds.length
        ? new Set(this.normalizePlanDraftIds(planIds))
        : null
      const plans = Array.isArray(this.modules?.plans) ? this.modules.plans : []
      const errors = []
      plans.forEach((plan, index) => {
        const planId = String(plan?.id ?? '')
        if (targetIds && !targetIds.has(planId)) return
        const planName = String(plan?.name || '').trim()
        if (!planName) {
          errors.push(`第 ${index + 1} 个作息方案名称不能为空`)
          return
        }
        const tasks = this.stripOnceEphemeralPlanTasks(plan?.tasks)
        tasks.forEach((task, taskIndex) => {
          const terminalFields = this.resolvePlanTaskTerminalFields(task)
          const hasTerminalBinding = terminalFields.terminalids.length > 0 ||
            Boolean(terminalFields.liveterminalid && terminalFields.liveterminalid !== '0')
          if (hasTerminalBinding) return
          const taskName = String(task?.customName || task?.taskname || task?.audio || '').trim() || `任务${taskIndex + 1}`
          const taskTime = String(task?.time || task?.starttime || '').trim() || '00:00'
          errors.push(`${planName}/${taskName}@${taskTime}`)
        })
      })
      return errors
    },
    ensurePlanPayloadReady(planIds = null) {
      const errors = this.collectPlanSaveValidationErrors(planIds)
      if (!errors.length) return
      throw new Error(`作息方案保存前校验失败：${errors.join('；')}`)
    },
    buildScheduleTaskFromPlan(task, idx, total) {
      const durationMode = task?.durationMode === 'loop' ? 2 : 1
      const time = task?.time || '00:00'
      const starttime = time.length === 5 ? `${time}:00` : time
      const dateRange = Array.isArray(task?.dateRange) ? task.dateRange : []
      const timelength = durationMode === 2
        ? String(task?.loop || 1)
        : this.formatScheduleDurationForApi(task?.duration)
      const terminalFields = this.resolvePlanTaskTerminalFields(task)
      const realTaskId = this.normalizeRealTaskId(task?.taskid ?? task?.task_id ?? task?.taskId ?? task?.id)
      return {
        all: total || 1,
        count: 1,
        start: idx + 1,
        state: 0,
        id: String(task?.id || realTaskId || this.createDraftTaskId(idx)),
        taskid: realTaskId || '0',
        enablestate: task?.powerOn === false ? 0 : 1,
        taskstate: 0,
        timelength: timelength || '1',
        timelengthtype: String(durationMode),
        execmode: 0,
        playmode: 0,
        volume: typeof task?.volume === 'number' ? task.volume : 50,
        priority: 10,
        isinstancy: 2,
        starttime,
        startdate: dateRange[0] || '0-00-00',
        enddate: dateRange[1] || '0-00-00',
        taskname: task?.customName || task?.audio || '',
        customName: task?.customName || '',
        audio: task?.audio || '',
        weekdays: Array.isArray(task?.weekdays) ? task.weekdays : [],
        location: terminalFields.location,
        terminalids: terminalFields.terminalids,
        terminalnames: terminalFields.terminalnames,
        liveterminalid: terminalFields.liveterminalid || 0,
        liveterminalname: terminalFields.liveterminalname || '',
        powerOn: typeof task?.powerOn === 'boolean' ? task.powerOn : true,
        taskLevel: task?.taskLevel || '',
        sendMode: task?.sendMode || '',
        playMode: task?.playMode || '',
        ledSetting: task?.ledSetting || ''
      }
    },
    normalizeDateRange(start, end) {
      const today = new Date().toISOString().slice(0, 10)
      const startDate = this.normalizeDate(start) || today
      const endDate = this.normalizeDate(end) || startDate
      return [startDate, endDate]
    },
    nextPlanTaskId() {
      const base = 70600
      let maxId = base - 1
      const plans = this.modules?.plans || []
      plans.forEach((plan) => {
        const tasks = Array.isArray(plan?.tasks) ? plan.tasks : []
        tasks.forEach((task) => {
          const raw = task?.id ?? task?.taskid
          const digits = String(raw ?? '').replace(/\D+/g, '')
          if (!digits) return
          const value = Number(digits)
          if (!Number.isNaN(value) && value > maxId) {
            maxId = value
          }
        })
      })
      return maxId + 1
    },
    createDraftTaskId(seed = '') {
      const suffix = seed !== undefined && seed !== null && String(seed).trim()
        ? `-${String(seed).trim()}`
        : ''
      return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`
    },
    createBroadcastDraftId(seed = '') {
      const suffix = seed !== undefined && seed !== null && String(seed).trim()
        ? `-${String(seed).trim()}`
        : ''
      return `draft-broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`
    },
    normalizeRealTaskId(value) {
      if (value === undefined || value === null) return ''
      const text = String(value).trim()
      if (!/^\d+$/.test(text) || text === '0') return ''
      return text
    },
    normalizeBroadcastTempId(value, fallbackTaskId = '', seed = '') {
      const candidates = [value, fallbackTaskId]
      for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) continue
        const text = String(candidate).trim()
        if (/^\d+$/.test(text) && text !== '0') return text
        if (text) return text
      }
      return this.createBroadcastDraftId(seed)
    },
    normalizeTempTaskId(value, idx) {
      if (value === undefined || value === null) {
        return this.createDraftTaskId(idx)
      }
      const text = String(value).trim()
      if (/^\d+$/.test(text) && text !== '0') return text
      if (text) return text
      return this.createDraftTaskId(idx)
    },
    normalizeDate(value) {
      if (!value || value === '0-00-00') return ''
      const text = String(value)
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
    },
    toTime(value) {
      if (!value) return ''
      const text = String(value)
      if (text.length >= 8) return text.slice(0, 8)
      if (text.length >= 5) return `${text.slice(0, 5)}:00`
      return text
    },
    timeToMinutes(value) {
      if (!value) return Number.POSITIVE_INFINITY
      const text = String(value)
      const parts = text.split(':')
      const hours = Number.parseInt(parts[0], 10)
      const minutes = Number.parseInt(parts[1] || '0', 10)
      const seconds = Number.parseInt(parts[2] || '0', 10)
      if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
        return Number.POSITIVE_INFINITY
      }
      return hours * 3600 + minutes * 60 + seconds
    },
    parseClockDurationSeconds(text) {
      if (!text || !String(text).includes(':')) return 0
      const parts = String(text).split(':')
      const hours = Number.parseInt(parts[0] || '0', 10)
      const minutes = Number.parseInt(parts[1] || '0', 10)
      const seconds = Number.parseInt(parts[2] || '0', 10)
      if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) return 0
      return hours * 3600 + minutes * 60 + seconds
    },
    parseScheduleDurationSeconds(value) {
      if (value === null || value === undefined || value === '') return 0
      const text = String(value).trim()
      if (text.includes(' ') && text.includes('-')) {
        const parts = text.split(/\s+/, 2)
        const datePart = parts[0] || ''
        const timePart = parts[1] || ''
        const dateBits = datePart.split('-').map((item) => Number.parseInt(item || '0', 10))
        if (dateBits.length === 3 && dateBits.every((item) => Number.isFinite(item) && item >= 0)) {
          const clockSeconds = this.parseClockDurationSeconds(timePart)
          if (clockSeconds > 0 || timePart === '00:00:00') {
            if (dateBits[0] === 0 && dateBits[1] === 0) {
              return dateBits[2] * 24 * 3600 + clockSeconds
            }
            if (dateBits[0] >= 1 && dateBits[1] >= 1 && dateBits[2] >= 1) {
              const anchorMs = Date.UTC(2000, 0, 1, 0, 0, 0)
              const targetMs = Date.UTC(dateBits[0], dateBits[1] - 1, dateBits[2], 0, 0, 0) + (clockSeconds * 1000)
              const diff = Math.round((targetMs - anchorMs) / 1000)
              if (diff >= 0) return diff
            }
          }
        }
      }
      if (text.includes(':')) return this.parseClockDurationSeconds(text)
      const numeric = Number(text)
      return Number.isFinite(numeric) ? Math.max(1, Math.round(numeric)) : 0
    },
    durationToSeconds(value) {
      return this.parseScheduleDurationSeconds(value)
    },
    formatDurationHms(value) {
      if (!value) return '00:00:00'
      const text = String(value)
      if (text.includes(':')) {
        const parts = text.split(':')
        const hours = String(Number.parseInt(parts[0] || '0', 10)).padStart(2, '0')
        const minutes = String(Number.parseInt(parts[1] || '0', 10)).padStart(2, '0')
        const seconds = String(Number.parseInt(parts[2] || '0', 10)).padStart(2, '0')
        return `${hours}:${minutes}:${seconds}`
      }
      const totalSeconds = this.durationToSeconds(text)
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
      const seconds = String(totalSeconds % 60).padStart(2, '0')
      return `${hours}:${minutes}:${seconds}`
    },
    toDurationSecondsFromApi(length, type, fallback) {
      if (!length) return fallback
      const val = this.parseScheduleDurationSeconds(length)
      if (!val) return fallback
      return String(type) === '2' ? val : Math.max(1, Math.round(val))
    },
    toDurationSeconds(duration) {
      return this.parseScheduleDurationSeconds(duration)
    },
    formatScheduleDurationForApi(duration) {
      const totalSeconds = Math.max(1, this.toDurationSeconds(duration))
      return String(totalSeconds)
    },
    formatTaskinfoDurationForApi(duration, unit = 'minutes') {
      if (unit === 'seconds') {
        return this.formatScheduleDurationForApi(duration)
      }
      const text = duration === null || duration === undefined ? '' : String(duration).trim()
      if (text.includes(':') || (text.includes(' ') && text.includes('-'))) {
        return this.formatScheduleDurationForApi(text)
      }
      const numeric = Number(text)
      const minutes = Number.isFinite(numeric) ? Math.max(1, Math.round(numeric)) : 1
      return this.formatScheduleDurationForApi(minutes * 60)
    },
    sortTasksByTime(tasks) {
      if (!Array.isArray(tasks)) return
      tasks.sort((a, b) => {
        const aTime = this.timeToMinutes(a?.time)
        const bTime = this.timeToMinutes(b?.time)
        if (aTime !== bTime) return aTime - bTime
        const aKey = String(a?.customName || a?.name || a?.audio || '')
        const bKey = String(b?.customName || b?.name || b?.audio || '')
        return aKey.localeCompare(bKey)
      })
    },
    sortAllModules() {
      (this.modules.plans || []).forEach((plan) => {
        this.sortTasksByTime(plan.tasks)
      })
      this.sortTasksByTime(this.modules.livecasts)
    },
    findPlanByTask(task) {
      return (this.modules.plans || []).find((plan) => Array.isArray(plan.tasks) && plan.tasks.includes(task))
    },
    onPlanTimeChange(task) {
      const plan = this.findPlanByTask(task)
      if (!plan) return
      this.sortTasksByTime(plan.tasks)
    },
    onLiveTimeChange() {
      this.sortTasksByTime(this.modules.livecasts)
    },
    firstLocationPath() {
      const root = Array.isArray(this.locationOptions) ? this.locationOptions[0] : null
      if (!root || !Array.isArray(root.children) || !root.children.length) return []
      let node = root
      const path = [String(node.value)]
      while (Array.isArray(node.children) && node.children.length) {
        node = node.children[0]
        path.push(String(node.value))
      }
      return path.length >= 2 ? path : []
    },
    defaultLocation() {
      if (!this.hasReliableLocationOptions) return []
      const path = this.firstLocationPath()
      return path.length ? [path] : []
    },
    clonePlanList(value) {
      const source = Array.isArray(value) ? value : []
      try {
        return JSON.parse(JSON.stringify(source))
      } catch {
        return source.map((item) => ({ ...item }))
      }
    },
    findPlanIndexById(plans, planId) {
      return (Array.isArray(plans) ? plans : []).findIndex((plan) => String(plan?.id ?? '') === String(planId ?? ''))
    },
    findTaskIndexById(tasks, taskId) {
      return (Array.isArray(tasks) ? tasks : []).findIndex((task) => String(task?.id ?? '') === String(taskId ?? ''))
    },
    createPlanTaskIdAllocator(plans) {
      let counter = 0
      const draftSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      return () => {
        counter += 1
        return `draft-${draftSeed}-${counter}`
      }
    },
    assignFreshPlanTaskIds(tasks, nextTaskId) {
      return (Array.isArray(tasks) ? tasks : []).map((task) => ({
        ...this.cloneTask(task),
        id: nextTaskId(),
        taskid: '0'
      }))
    },
    buildNewPlanRecord(name, nextPlans, nextTaskId) {
      const tasks = this.assignFreshPlanTaskIds(this.buildFixedPlanTasks(), nextTaskId)
      return {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        originName: '',
        isNew: true,
        status: '停用',
        tasks,
        tasksLoaded: true,
        tasksLoading: false,
        taskCount: tasks.length
      }
    },
    buildCopiedPlanRecord(plan, nextTaskId) {
      const copy = this.cloneTask(plan)
      const tasks = this.assignFreshPlanTaskIds(copy.tasks, nextTaskId)
      return {
        ...copy,
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `${plan?.name || '副本'}-副本`,
        originName: '',
        isNew: true,
        tasks,
        tasksLoaded: true,
        tasksLoading: false,
        taskCount: tasks.length
      }
    },
    serializePlanForApi(plan, plans) {
      const list = Array.isArray(plans) ? plans : this.modules.plans
      const index = Math.max(0, this.findPlanIndexById(list, plan?.id))
      const payload = this.buildScheduleFromPlan(plan, index)
      if (!payload) {
        throw new Error('作息方案名称不能为空')
      }
      return payload
    },
    refreshPlanPayload() {
      const nextSchedules = (this.modules.plans || []).map((plan, index) => this.buildScheduleFromPlan(plan, index)).filter((plan) => plan)
      this.schedulePayload = {
        ...(this.schedulePayload || {}),
        version: this.schedulePayload?.version || '1.0',
        schedules: nextSchedules
      }
    },
    applyPlanState(nextPlans) {
      this.setPlanRows(nextPlans, { rememberRemote: true })
    },
    selectedPlanDirtyIds(rows) {
      const selectedIds = new Set((Array.isArray(rows) ? rows : []).map((item) => String(item?.id ?? '')))
      const dirtyIds = Array.isArray(this.draftState?.planDirtyIds) ? this.draftState.planDirtyIds : []
      return this.normalizePlanDraftIds(dirtyIds.filter((id) => selectedIds.has(String(id || ''))))
    },
    syncPersistedPlanStatuses(planIds, status) {
      const selectedIds = new Set((Array.isArray(planIds) ? planIds : []).map((id) => String(id || '')).filter((id) => id))
      if (!selectedIds.size) return
      const officialSource = this.hasPlanDraft && Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
        ? this.draftState.planBaseSnapshot
        : (this.lastSyncedPlans.length ? this.lastSyncedPlans : this.modules.plans)
      const nextOfficialPlans = this.buildPlanBaseSnapshot(officialSource)
      nextOfficialPlans.forEach((plan) => {
        if (!selectedIds.has(String(plan?.id ?? ''))) return
        plan.status = status
      })
      this.lastSyncedPlans = this.buildPlanBaseSnapshot(nextOfficialPlans)
      if (this.hasPlanDraft && Array.isArray(this.draftState?.plans)) {
        const nextDraftPlans = this.preparePlanRows(this.draftState.plans).map((plan) => {
          if (!selectedIds.has(String(plan?.id ?? ''))) return plan
          return {
            ...plan,
            status
          }
        })
        const nextDirtyIds = this.normalizePlanDraftIds(this.draftState?.planDirtyIds)
        if (nextDirtyIds.length) {
          this.setPlanRows(nextDraftPlans)
          this.savePlanDraftState(nextDraftPlans, nextDirtyIds, nextOfficialPlans)
          return
        }
      }
      this.clearPlanDraftState()
      this.setPlanRows(nextOfficialPlans, { rememberRemote: true })
    },
    async confirmSaveBeforePlanStatus(rows, status) {
      const dirtyIds = this.selectedPlanDirtyIds(rows)
      if (!dirtyIds.length) return true
      try {
        await this.$confirm(
          `选中的 ${dirtyIds.length} 个方案存在未保存修改，需先保存后才能${status}。`,
          `保存后${status}`,
          {
            confirmButtonText: '保存并继续',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch (err) {
        return false
      }
      const result = await this.uploadPlanDrafts(dirtyIds)
      if (result?.errors?.length || result?.failedIds?.length) {
        const first = result?.errors?.[0]
        this.planSaveError(first || new Error('保存失败'))
        return false
      }
      return true
    },
    planSaveError(err) {
      const detail = err?.response?.data?.detail
      const message = detail
        ? `保存失败：${String(detail).slice(0, 200)}`
        : `保存失败：${String(err).slice(0, 200)}`
      this.$message.error(message)
    },
    async ensurePlansLoaded(plans) {
      const seen = new Set()
      const targets = (Array.isArray(plans) ? plans : [plans]).filter((plan) => {
        if (!plan || typeof plan !== 'object') return false
        const key = String(plan.id ?? plan.name ?? '')
        if (seen.has(key)) return false
        seen.add(key)
        return !plan.tasksLoaded
      })
      if (!targets.length) return
      await Promise.all(targets.map((plan) => this.loadPlanTasks(plan)))
    },
    async executePlanOperations(nextPlans, operations) {
      // NB: there is intentionally no 'create' branch here. Schedule creation
      // (new plan / copy) goes through createScheduleEntry → POST /schedules
      // (add_schedule), which clones a real source on the remote. This helper
      // only handles 'update' and 'delete' per-schedule writes.
      const nextPlanMap = new Map((Array.isArray(nextPlans) ? nextPlans : []).map((plan) => [String(plan?.id ?? ''), plan]))
      for (const operation of operations) {
        if (!operation || !operation.type) continue
        if (operation.type === 'update') {
          const plan = nextPlanMap.get(String(operation.planId ?? ''))
          if (!plan) continue
          const originalName = operation.originalName || plan.originName || plan.name
          await updateScheduleEntry(originalName, this.serializePlanForApi(plan, nextPlans))
          continue
        }
        if (operation.type === 'delete') {
          await deleteScheduleEntry(operation.scheduleName)
        }
      }
    },
    async commitPlanOperations(nextPlans, operations, message) {
      if (this.persisting) {
        this.$message.warning('正在保存中，请稍候…')
        return false
      }
      this.persisting = true
      try {
        await this.executePlanOperations(nextPlans, operations)
        this.applyPlanState(nextPlans)
        if (message) {
          this.$message.success(message)
        }
        return true
      } catch (err) {
        this.planSaveError(err)
        await this.loadModules()
        return false
      } finally {
        this.persisting = false
      }
    },
    syncPlanDraftWithOfficialState(nextOfficialPlans, options = {}) {
      const { removedIds = [] } = options
      const officialPlans = this.buildPlanBaseSnapshot(nextOfficialPlans)
      this.lastSyncedPlans = this.buildPlanBaseSnapshot(officialPlans)
      if (!this.hasPlanDraft) {
        this.setPlanRows(officialPlans, { rememberRemote: true })
        return
      }
      const removedSet = new Set(this.normalizePlanDraftIds(removedIds))
      const officialMap = new Map(officialPlans.map((plan) => [String(plan?.id ?? ''), plan]))
      const nextDraftPlans = this.preparePlanRows(this.draftState?.plans)
        .filter((plan) => !removedSet.has(String(plan?.id ?? '')))
        .map((plan) => {
          const official = officialMap.get(String(plan?.id ?? ''))
          if (!official) return plan
          return {
            ...plan,
            status: official.status
          }
        })
      const nextDirtyIds = this.normalizePlanDraftIds(
        (this.draftState?.planDirtyIds || []).filter((id) => !removedSet.has(String(id || '')))
      )
      const nextDeletedIds = this.normalizePlanDraftIds(
        (this.draftState?.planDeletedIds || []).filter((id) => !removedSet.has(String(id || '')))
      )
      if (!nextDirtyIds.length && !nextDeletedIds.length) {
        this.clearPlanDraftState()
        this.setPlanRows(officialPlans, { rememberRemote: true })
        return
      }
      this.setPlanRows(nextDraftPlans)
      this.savePlanDraftState(nextDraftPlans, nextDirtyIds, officialPlans, {
        planDeletedIds: nextDeletedIds
      })
    },
    async uploadPlanDrafts(planIds = null) {
      const currentPlans = this.preparePlanRows(this.draftState?.plans)
      const currentDirtyIds = this.normalizePlanDraftIds(this.draftState?.planDirtyIds)
      const targetPlanIds = Array.isArray(planIds) && planIds.length
        ? new Set(this.normalizePlanDraftIds(planIds))
        : null
      const targetDirtyIds = targetPlanIds
        ? currentDirtyIds.filter((id) => targetPlanIds.has(String(id)))
        : currentDirtyIds
      const currentDeletedIds = this.normalizePlanDraftIds(this.draftState?.planDeletedIds)
      const targetDeletedIds = targetPlanIds
        ? currentDeletedIds.filter((id) => targetPlanIds.has(String(id)))
        : currentDeletedIds
      const errors = []
      const savedIds = []
      if (!targetDirtyIds.length && !targetDeletedIds.length) {
        return { savedIds, failedIds: [], errors }
      }
      const nextBaseSnapshot = this.buildPlanBaseSnapshot(
        Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
          ? this.draftState.planBaseSnapshot
          : this.lastSyncedPlans
      )
      const basePlanMap = new Map(nextBaseSnapshot.map((plan) => [String(plan?.id ?? ''), plan]))
      for (const planId of this.normalizePlanDraftIds([...targetDirtyIds, ...targetDeletedIds])) {
        const plan = currentPlans.find((item) => String(item?.id ?? '') === String(planId))
        const basePlan = basePlanMap.get(String(planId))
        try {
          if (targetDeletedIds.includes(String(planId))) {
            if (basePlan) {
              await deleteScheduleEntry(basePlan.originName || basePlan.name)
              const baseIndex = this.findPlanIndexById(nextBaseSnapshot, planId)
              if (baseIndex >= 0) {
                nextBaseSnapshot.splice(baseIndex, 1)
              }
            }
            savedIds.push(String(planId))
            continue
          }
          if (!plan && basePlan) {
            throw new Error(`作息方案 ${planId} 缺少显式删除标记，已阻止隐式删除。`)
          }
          if (!plan && !basePlan) {
            throw new Error(`存在无法解析的作息草稿标识：${planId}`)
          }
          if (plan.isNew || !basePlan) {
            // Creating a schedule from a draft used to call createScheduleEntry
            // (POST /schedules), which hits the non-forwarding add_schedule stub
            // and fake-succeeds without ever creating on 223. All real creates
            // now go through the full PUT (createPlanImmediate / copy), so no
            // live path should stage a new plan into the draft. Fail loudly
            // instead of silently faking a create if one ever does.
            throw new Error(`作息方案“${plan.name || planId}”无法通过草稿创建，请使用“新建/复制方案”即时创建。`)
          } else {
            await updateScheduleEntry(
              basePlan.originName || basePlan.name || plan.originName || plan.name,
              this.serializePlanForApi(plan, currentPlans)
            )
          }
          savedIds.push(String(planId))
          const persistedPlan = this.preparePlanRows([{
            ...this.cloneTask(plan),
            originName: plan.name,
            isNew: false
          }], { persisted: true })[0]
          const baseIndex = this.findPlanIndexById(nextBaseSnapshot, plan.id)
          if (baseIndex >= 0) {
            nextBaseSnapshot.splice(baseIndex, 1, persistedPlan)
          } else {
            nextBaseSnapshot.push(persistedPlan)
          }
        } catch (err) {
          errors.push(err)
        }
      }
      const remainingDirtyIds = currentDirtyIds.filter((id) => !savedIds.includes(String(id)))
      const remainingDeletedIds = currentDeletedIds.filter((id) => !savedIds.includes(String(id)))
      const nextDraftPlans = currentPlans.map((plan) => {
        if (!savedIds.includes(String(plan?.id ?? ''))) return plan
        return {
          ...plan,
          originName: plan.name,
          isNew: false
        }
      })
      this.lastSyncedPlans = this.buildPlanBaseSnapshot(nextBaseSnapshot)
      if (remainingDirtyIds.length || remainingDeletedIds.length) {
        this.setPlanRows(nextDraftPlans)
        this.savePlanDraftState(nextDraftPlans, remainingDirtyIds, nextBaseSnapshot, {
          planDeletedIds: remainingDeletedIds
        })
      } else if (savedIds.length) {
        this.clearPlanDraftState()
        this.setPlanRows(nextBaseSnapshot, { rememberRemote: true })
      }
      return {
        savedIds,
        failedIds: this.normalizePlanDraftIds([...targetDirtyIds, ...targetDeletedIds]).filter((id) => !savedIds.includes(String(id))),
        errors
      }
    },
    async uploadBroadcastDraft() {
      if (!this.hasBroadcastDraft) {
        return { saved: false }
      }
      this.setBroadcastRows(this.draftState.broadcasts || [])
      const taskPayload = this.buildAllTaskPayload('broadcasts')
      await updateAllTask(taskPayload, 'broadcasts')
      this.clearBroadcastDraftState()
      this.broadcastsLoaded = false
      await this.loadBroadcasts()
      return { saved: true }
    },
    async persist(message, scope, options = {}) {
      if (this.persisting) {
        this.$message.warning('正在保存中，请稍候…')
        return
      }
      const pendingOnly = Boolean(options?.pendingOnly)
      this.persisting = true
      const target = scope || this.activeTab || 'all'
      if (pendingOnly) {
        try {
          if (!this.hasPlanDraft && !this.hasBroadcastDraft) {
            this.$message.info('当前没有待上传改动')
            return
          }
          this.setSaveFeedbackStep('准备保存', '正在校验待上传内容…')
          let savedPlan = false
          if (this.hasPlanDraft) {
            this.setSaveFeedbackStep('上传作息方案', '正在上传作息方案…')
            await this.ensurePlanTasksLoaded()
            this.sortAllModules()
            const pendingPlanIds = this.normalizePlanDraftIds(this.draftState?.planDirtyIds)
            const pendingDeletedIds = this.normalizePlanDraftIds(this.draftState?.planDeletedIds)
            this.ensurePlanPayloadReady(pendingPlanIds)
            const overwritePayload = this.buildPendingOverwritePayload({
              planIds: this.normalizePlanDraftIds([...(pendingPlanIds || []), ...(pendingDeletedIds || [])])
            })
            await updateBroadcastSchedules(overwritePayload)
            this.clearPlanDraftState()
            this.schedulePayload = {
              ...(this.schedulePayload || {}),
              ...overwritePayload
            }
            savedPlan = true
          }
          if (this.hasBroadcastDraft) {
            this.setSaveFeedbackStep('上传文件广播', '正在上传文件广播…')
            await this.uploadBroadcastDraft()
          }
          if (savedPlan) {
            this.setSaveFeedbackStep('刷新方案数据', '正在刷新方案数据…')
            await this.loadModules()
          }
          this.finishSaveFeedback(message || '已保存上传')
          if (message) this.$message.success(message)
          return
        } catch (err) {
          const detail = err?.response?.data?.detail
          const messageText = detail
            ? `保存失败：${String(detail).slice(0, 200)}`
            : `保存失败：${String(err).slice(0, 200)}`
          try {
            await this.loadModules({ applyDraftOverlay: false })
          } catch (refreshErr) {
            if (refreshErr) console.warn('reload after pending save failed:', refreshErr)
          }
          this.failSaveFeedback(messageText)
          this.$message.error(messageText)
          return
        } finally {
          this.persisting = false
        }
      }
      const errors = []
      try {
        await this.ensureAllModulesLoaded(target)
        this.sortAllModules()
        if (target === 'all' || target === 'plans') {
          this.ensurePlanPayloadReady()
          const schedulePayload = this.buildSchedulePayload('plans', { strict: true })
          await updateBroadcastSchedules(schedulePayload)
          this.schedulePayload = {
            ...(this.schedulePayload || {}),
            ...schedulePayload
          }
        }
      } catch (err) {
        const detail = err?.response?.data?.detail
        errors.push(detail || err)
        if (detail) console.warn('save schedules failed:', detail)
      }
      try {
        if (target === 'all' || target === 'broadcasts' || target === 'livecasts') {
          const taskPayload = this.buildAllTaskPayload(target)
          await updateAllTask(taskPayload, target)
        }
      } catch (err) {
        const detail = err?.response?.data?.detail
        errors.push(detail || err)
        if (detail) console.warn('save all_task failed:', detail)
      }
      if (!errors.length) {
        if (message) {
          this.$message.success(message)
        }
      } else {
        const first = errors[0]
        const messageText = first
          ? `保存失败：${String(first).slice(0, 200)}`
          : '保存失败，请检查后端接口'
        this.$message.error(messageText)
      }
      this.persisting = false
    },
    resetData() {
      this.modules = getDefaultSchedulerData()
      this.selected = { plans: [], broadcasts: [], livecasts: [], runtimePlays: [] }
      this.normalizeModules()
      this.persist('已恢复默认示例', 'all')
    },
    normalizeModules() {
      if (!this.modules) {
        this.modules = getDefaultSchedulerData()
      }
      if (!Array.isArray(this.modules.plans)) this.modules.plans = []
      if (!Array.isArray(this.modules.broadcasts)) this.modules.broadcasts = []
      if (!Array.isArray(this.modules.livecasts)) this.modules.livecasts = []
      if (!Array.isArray(this.modules.runtimePlays)) this.modules.runtimePlays = []
      const defaults = this.newPlanTask()
      this.modules.plans.forEach((plan) => {
        if (!Array.isArray(plan.tasks)) plan.tasks = []
        plan.tasks.forEach((task) => {
          if (!task.durationMode) task.durationMode = 'loop'
          if (!task.customName) task.customName = ''
          if (task.time && String(task.time).length === 5) {
            task.time = `${task.time}:00`
          }
          if (!Array.isArray(task.dateRange) || task.dateRange.length < 2) {
            const today = new Date().toISOString().slice(0, 10)
            task.dateRange = [today, today]
          }
          if (!Array.isArray(task.weekdays)) task.weekdays = defaults.weekdays
          task.weekdays = this.normalizeWeekdays(task.weekdays)
          if (!Array.isArray(task.location)) task.location = defaults.location
          this.repairStoredLocationBinding(task, task.location)
          if (typeof task.powerOn !== 'boolean') task.powerOn = defaults.powerOn
          if (!task.taskLevel) task.taskLevel = defaults.taskLevel
          if (!task.sendMode) task.sendMode = defaults.sendMode
          if (!task.playMode) task.playMode = defaults.playMode
          if (task.ledSetting === undefined) task.ledSetting = defaults.ledSetting
        })
      })
      this.modules.broadcasts.forEach((row) => {
        if (!row.durationMode) row.durationMode = 'loop'
        row.durationFormat = 'hms'
        if (row.durationMode !== 'loop' && row.duration) {
          row.duration = this.formatDurationHms(row.duration)
        }
        const resolved = this.resolveLocationFromRow(row)
        this.repairStoredLocationBinding(row, resolved.length ? resolved : row.location)
      })
      this.modules.livecasts.forEach((row) => {
        if (!row.durationMode) row.durationMode = 'loop'
        const resolved = this.resolveLocationFromRow(row)
        this.repairStoredLocationBinding(row, resolved.length ? resolved : row.location)
      })
      this.modules.runtimePlays = this.modules.runtimePlays.map((row) => ({
        ...row,
        terminal_ids: Array.isArray(row?.terminal_ids) ? row.terminal_ids : [],
        terminal_names: Array.isArray(row?.terminal_names) ? row.terminal_names : [],
        media_ids: Array.isArray(row?.media_ids) ? row.media_ids : [],
        media_names: Array.isArray(row?.media_names) ? row.media_names : []
      }))
    },
    isAllWeekdays(task) {
      const selected = Array.isArray(task?.weekdays) ? task.weekdays : []
      return this.weekdaysOptions.every((day) => selected.includes(day))
    },
    normalizeWeekdays(list) {
      if (!Array.isArray(list)) return []
      const normalized = list
        .map((day) => (day !== undefined && day !== null ? String(day) : ''))
        .filter((day) => day)
      if (!normalized.length) return []
      const order = Array.isArray(this.weekdaysOptions) && this.weekdaysOptions.length
        ? this.weekdaysOptions
        : ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const inOrder = []
      order.forEach((day) => {
        if (normalized.includes(day)) inOrder.push(day)
      })
      normalized.forEach((day) => {
        if (!inOrder.includes(day)) inOrder.push(day)
      })
      return inOrder
    },
    toggleWeekdays(task) {
      if (!task) return
      if (this.isAllWeekdays(task)) {
        task.weekdays = []
      } else {
        task.weekdays = [...this.weekdaysOptions]
      }
      if (task === this.taskDrawer?.draft) {
        this.onTaskDrawerFieldChange('weekdays')
      }
    },
    preview(audio) {
      this.$message.info(audio ? `预览：${audio}` : '请选择音频')
    },
    tableRef(type) {
      if (type === 'plan') return this.$refs.planTable
      if (type === 'broadcast') return this.$refs.broadcastTable
      if (type === 'live') return this.$refs.liveTable
      return null
    },
    selectAll(type) {
      const ref = this.tableRef(type)
      if (ref) ref.toggleAllSelection()
    },
    clearSelection(type) {
      const ref = this.tableRef(type)
      if (ref) ref.clearSelection()
    },
    handlePlanMoreCommand(command) {
      if (command === 'edit') {
        this.openDialog('plan', 'edit')
        return
      }
      if (command === 'copy') {
        this.copySelected('plan')
        return
      }
      if (command === 'batch') {
        this.openBatchDialog()
      }
    },
    statusTag(status) {
      if (status === '执行中' || status === '启用') return 'success'
      if (status === '排队中' || status === '待执行') return 'warning'
      if (status === '异常') return 'danger'
      return 'info'
    },
    getList(type) {
      if (type === 'plan') return this.modules.plans
      if (type === 'broadcast') return this.modules.broadcasts
      if (type === 'live') return this.modules.livecasts
      if (type === 'runtimePlay') return this.modules.runtimePlays
      return []
    },
    getSelected(type) {
      if (type === 'plan') return this.selected.plans || []
      if (type === 'broadcast') return this.selected.broadcasts || []
      if (type === 'live') return this.selected.livecasts || []
      if (type === 'runtimePlay') return this.selected.runtimePlays || []
      return []
    },
    async applyImmediatePlanStatus(rows, status, options = {}) {
      const { silent = false } = options
      if (!Array.isArray(rows) || !rows.length) {
        this.$message.warning('请选择要处理的行')
        return false
      }
      const selectedIds = this.normalizePlanDraftIds(rows.map((item) => item?.id))
      if (!(await this.confirmSaveBeforePlanStatus(rows, status))) {
        return false
      }
      const selectedNames = this.preparePlanRows(this.modules.plans)
        .filter((plan) => selectedIds.includes(String(plan?.id ?? '')))
        .map((plan) => String(plan?.originName || plan?.name || '').trim())
        .filter((name) => name)
      if (!selectedNames.length) {
        this.$message.warning('未找到可更新的方案')
        return false
      }
      const actionKey = status === '启用' ? 'plan-enable' : 'plan-disable'
      return this.runBusyAction(actionKey, async() => {
        try {
          await setScheduleStatus({ schedule_names: selectedNames, status })
          this.syncPersistedPlanStatuses(selectedIds, status)
          // T70: enabling/disabling a plan flips the task-level state the rows
          // show, but updating plan.status alone does not re-fetch the task
          // rows; an already-expanded plan keeps showing the pre-toggle state
          // until a manual refresh (loadPlanTasks no-ops on tasksLoaded). Force
          // a silent reload of each expanded plan so the rows reflect the new
          // state (reloadPlanTasksFromRemote bypasses the tasksLoaded guard).
          selectedNames.forEach((name) => {
            const plan = this.resolvePlanByName(name)
            if (plan && plan.tasksLoaded) {
              this.reloadPlanTasksFromRemote(plan, { silent: true })
            }
          })
          if (!silent) {
            this.$message.success('状态已更新')
          }
          return true
        } catch (err) {
          this.planSaveError(err)
          return false
        }
      })
    },
    async toggleStatus(type, status) {
      const rows = this.getSelected(type)
      if (!rows.length) return this.$message.warning('请选择要处理的行')
      if (type === 'plan') {
        await this.applyImmediatePlanStatus(rows, status)
        return
      }
      // Broadcast / livecast 启停 routes to remote /data/task_state immediately
      // instead of being staged into the local draft.
      const remoteKind = type === 'broadcast' ? 'broadcast' : type === 'live' ? 'livecast' : ''
      if (remoteKind && (this.isRuntimeStatus(status) || status === '启用' || status === '停用')) {
        await this.applyRemoteStatus(remoteKind, rows, status)
        return
      }
      rows.forEach((item) => {
        item.status = status
      })
      this.persist('状态已更新')
    },
    openDialog(type, mode) {
      if (mode === 'edit' && !this.getSelected(type).length) {
        return this.$message.warning('请先选择要修改的行')
      }
      this.dialog = {
        visible: true,
        type,
        mode,
        form: {
          name: mode === 'edit' && this.getSelected(type)[0] ? this.getSelected(type)[0].name : ''
        }
      }
    },
    // New-plan create now clones a real, populated template on the remote via
    // POST /data/broadcast_schedules/schedules (createScheduleEntry → backend
    // add_schedule, which reuses the AI assistant's clone-real-template path).
    // The previous full-PUT cloned the empty "请添加作息" placeholder; this gives
    // the new schedule real tasks with real numeric taskids. Pessimistic: only
    // on ACK do we reload to pull the canonical created plan; a failure surfaces
    // an error without mutating local state.
    async createPlanImmediate(name) {
      if (this.persisting) {
        this.$message.warning('正在保存中，请稍候…')
        return false
      }
      this.persisting = true
      try {
        await createScheduleEntry({ schedule_name: name })
        await this.loadModules()
        // T47: a stale plan draft from a prior session would otherwise survive
        // the create refresh + keep the badge lit. Clear it, guarded so we
        // never swallow another plan's pending staging (KP #22 r2). The created
        // plan keys on its schedule name (see buildPlanFromSchedule id).
        this.clearStalePlanDraftAfterCreate(name)
        this.$message.success('作息方案已创建')
        return true
      } catch (err) {
        this.planSaveError(err)
        return false
      } finally {
        this.persisting = false
      }
    },
    async submitDialog() {
      const { type, mode, form } = this.dialog
      const name = form.name || '新建'
      if (mode === 'add') {
        if (type === 'plan') {
          const ok = await this.createPlanImmediate(name)
          if (ok) this.dialog.visible = false
          return
        }
        this.addByType(type, name)
      } else {
        const target = this.getSelected(type)[0]
        if (type === 'plan') {
          // T40 (2026-06-06) defense: :183 vendor has no schedule rename API.
          // 58d5cf4 routed rename through updateScheduleEntry -> backend
          // update_schedule handler at api_public.py:21205, which at L21216
          // forcibly sets schedule["schedule_name"] = <URL old name>. The
          // resulting schedule_sync_delta sees renamed=[] and reconciles by
          // deleting the entire scheme + all tasks (G4.1 海星作息 incident).
          // The dropdown entry that reached here was removed; this guard
          // covers any future programmatic caller. See KNOWN_PITFALLS #21.
          this.$message.warning('暂不支持改方案名,如需更名请删除后重建')
          return
        }
        if (type === 'plan' && target) {
          const sourcePlans = await this.getPlanDraftSourcePlans()
          const nextPlans = this.clonePlanList(sourcePlans)
          const targetIndex = this.findPlanIndexById(nextPlans, target.id)
          if (targetIndex < 0) {
            this.$message.warning('未找到要修改的方案')
            return
          }
          const targetPlan = nextPlans[targetIndex]
          const originalName = String(targetPlan.originName || targetPlan.name || '').trim()
          if (!originalName || targetPlan.isNew) {
            this.$message.warning('请先保存新建方案后再重命名')
            return
          }
          targetPlan.name = name
          const ok = await this.commitPlanOperations(
            nextPlans,
            [{ type: 'update', planId: targetPlan.id, originalName }],
            '方案名称已更新'
          )
          if (ok) this.dialog.visible = false
          return
        }
        if (target) target.name = name
      }
      this.dialog.visible = false
      if (type === 'broadcast') {
        this.persistBroadcastDraftLocally('文件广播已暂存到本地')
        return
      }
      this.persist('已保存')
    },
    addByType(type, name) {
      if (type === 'plan') {
        const tasks = this.buildFixedPlanTasks()
        this.modules.plans.push({
          id: Date.now(),
          name,
          status: '停用',
          tasks,
          tasksLoaded: true,
          tasksLoading: false,
          taskCount: tasks.length
        })
      } else if (type === 'broadcast') {
        this.modules.broadcasts.unshift(this.newBroadcastRow(name))
        this.persistBroadcastDraftLocally('已暂存到本地草稿')
      } else if (type === 'live') {
        this.modules.livecasts.push(this.newLiveRow(name))
      }
    },
    async copySelectedPlans(rows) {
      // Copy clones each selected source schedule on the remote via
      // createScheduleEntry({schedule_name, source}) → backend add_schedule,
      // which clones the named source (POST /task/sechinfo fromtaskname=source).
      // The copy therefore gets the source schedule's real tasks/taskids — not
      // the empty 请添加作息 placeholder and not the 中学夏季 default template.
      // Pessimistic: a row is only considered done after its remote ACK; we
      // reload once at the end if anything succeeded. Partial failures are
      // reported by source name.
      const targets = (Array.isArray(rows) ? rows : [])
        .map((item) => ({
          source: String(item?.originName || item?.name || '').trim(),
          copyName: `${item?.name || '副本'}-副本`
        }))
        .filter((t) => t.source)
      if (!targets.length) {
        this.$message.warning('未找到要复制的方案')
        return false
      }
      if (this.persisting) {
        this.$message.warning('正在保存中，请稍候…')
        return false
      }
      this.persisting = true
      const failed = []
      let succeeded = 0
      try {
        for (const target of targets) {
          try {
            await createScheduleEntry({ schedule_name: target.copyName, source: target.source })
            succeeded += 1
          } catch (err) {
            failed.push({ name: target.source, err })
          }
        }
      } finally {
        if (succeeded) {
          await this.loadModules()
        }
        this.persisting = false
      }
      if (failed.length) {
        const names = failed.map((f) => f.name).join('、')
        const detail = failed[0].err?.response?.data?.detail || failed[0].err?.message || ''
        this.$message.error(`以下方案复制失败:${names}${detail ? `(${String(detail).slice(0, 120)})` : ''}`)
        return false
      }
      this.$message.success('作息方案已复制')
      return true
    },
    copySelected(type) {
      const rows = this.getSelected(type)
      if (!rows.length) return this.$message.warning('请选择要复制的行')
      if (type === 'plan') {
        return this.copySelectedPlans(rows)
      }
      const list = this.getList(type)
      rows.forEach((item) => {
        const copy = JSON.parse(JSON.stringify(item))
        copy.id = Date.now() + Math.random()
        copy.name = `${item.name || '副本'}-副本`
        list.push(copy)
      })
      if (type === 'broadcast') {
        this.persistBroadcastDraftLocally('已复制到本地草稿')
        return
      }
      this.persist('已复制')
    },
    async confirmDelete(message) {
      try {
        await this.$confirm(message, '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        })
        return true
      } catch (err) {
        return false
      }
    },
    // Immediate (pessimistic) deletion of selected plans: each existing remote
    // schedule is deleted via DELETE /data/broadcast_schedules/schedules/{name}
    // straight away, instead of being staged into the local draft. A plan row
    // is removed from the view only after its remote delete ACKs; on failure
    // the row is kept and an error is surfaced. Reconciliation goes through
    // syncPlanDraftWithOfficialState with removedIds, which drops the deleted
    // ids from planDirtyIds/planDeletedIds — it never *adds* to planDeletedIds.
    async deletePlansImmediate(rows) {
      if (!Array.isArray(rows) || !rows.length) {
        this.$message.warning('请选择要删除的行')
        return false
      }
      if (this.busyActionKey) return false
      const preparedPlans = this.preparePlanRows(this.modules.plans)
      const planById = new Map(preparedPlans.map((plan) => [String(plan?.id ?? ''), plan]))
      // Resolve each selection to its current view row + the remote schedule
      // name to delete. A brand-new local-only plan (isNew / no originName and
      // not yet on remote) has nothing to delete remotely.
      const targets = rows
        .map((row) => {
          const plan = planById.get(String(row?.id ?? '')) || row
          const remoteName = String(plan?.originName || plan?.name || '').trim()
          return { id: String(plan?.id ?? ''), plan, remoteName, isNew: plan?.isNew === true }
        })
        .filter((target) => target.id)
      if (!targets.length) {
        this.$message.warning('未找到可删除的方案')
        return false
      }
      return this.runBusyAction('plan-delete', async() => {
        const removedIds = []
        let firstError = null
        for (const target of targets) {
          // Local-only plan never reached remote: drop it without an API call.
          if (target.isNew || !target.remoteName) {
            removedIds.push(target.id)
            continue
          }
          try {
            await deleteScheduleEntry(target.remoteName)
            removedIds.push(target.id)
          } catch (err) {
            if (!firstError) firstError = err
          }
        }
        if (removedIds.length) {
          const officialSource = this.hasPlanDraft && Array.isArray(this.draftState?.planBaseSnapshot) && this.draftState.planBaseSnapshot.length
            ? this.draftState.planBaseSnapshot
            : (this.lastSyncedPlans.length ? this.lastSyncedPlans : this.modules.plans)
          const removedSet = new Set(removedIds.map((id) => String(id)))
          const nextOfficialPlans = this.buildPlanBaseSnapshot(officialSource)
            .filter((plan) => !removedSet.has(String(plan?.id ?? '')))
          this.syncPlanDraftWithOfficialState(nextOfficialPlans, { removedIds })
        }
        if (firstError) {
          this.planSaveError(firstError)
          return false
        }
        this.$message.success('作息方案已删除')
        return true
      })
    },
    async removeSelected(type) {
      const rows = this.getSelected(type)
      if (!rows.length) return this.$message.warning('请选择要删除的行')
      const labelMap = { plan: '作息方案', broadcast: '广播任务', live: '采播任务' }
      const label = labelMap[type] || '任务'
      let ok = false
      if (type === 'plan') {
        try {
          await this.$confirm(
            `确定删除选中的 ${rows.length} 个作息方案吗？确认后将立即从远端删除，此操作不可撤销。`,
            '确认删除作息方案',
            {
              confirmButtonText: '立即删除',
              cancelButtonText: '取消',
              type: 'warning'
            }
          )
          ok = true
        } catch (err) {
          ok = false
        }
      } else {
        ok = await this.confirmDelete(`确定删除选中的 ${rows.length} 个${label}吗？`)
      }
      if (!ok) return
      if (type === 'plan' && this.busyActionKey) return
      const list = this.getList(type)
      const ids = rows.map((r) => r.id)
      if (type === 'plan') {
        await this.deletePlansImmediate(rows)
        return
      } else if (type === 'broadcast') {
        // T36 Phase 2 batch A.1: bulk-delete fires DELETE /task/taskinfo
        // per row (Promise.allSettled so a single 404/502 does not block
        // the rest). Only rows the remote actually confirmed are spliced
        // from modules.broadcasts; failures stay visible with an aggregate
        // error toast so the user can retry without losing context.
        const draftRows = rows.filter((r) => !/^\d+$/.test(String(r?.taskid || r?.id || '').trim()))
        const remoteRows = rows.filter((r) => /^\d+$/.test(String(r?.taskid || r?.id || '').trim()))
        const remoteResults = await Promise.allSettled(
          remoteRows.map((r) => deleteBroadcastImmediate(String(r.taskid || r.id).trim()))
        )
        const deletedRows = []
        const failedDetails = []
        remoteResults.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            deletedRows.push(remoteRows[idx])
          } else {
            const err = result.reason
            const detail = err?.response?.data?.detail || err?.message || '远端返回失败'
            failedDetails.push(`${remoteRows[idx]?.name || remoteRows[idx]?.id}: ${detail}`)
          }
        })
        // Draft rows (no real taskid) just splice locally — same as the
        // pre-immediate path for those rows.
        const allDeleted = [...deletedRows, ...draftRows]
        if (allDeleted.length) {
          const deletedIds = new Set(allDeleted.map((r) => r.id))
          const applyDelete = () => {
            this.modules.broadcasts = list.filter((item) => !deletedIds.has(item.id))
          }
          if (typeof this.withBroadcastDraftSyncSuspended === 'function') {
            this.withBroadcastDraftSyncSuspended(applyDelete)
          } else {
            applyDelete()
          }
        }
        if (failedDetails.length) {
          this.$message.error(`部分删除失败：${failedDetails.join('；')}`)
        } else if (allDeleted.length) {
          this.$message.success(`已删除 ${allDeleted.length} 个广播任务`)
        }
        return
      } else if (type === 'live') {
        this.modules.livecasts = list.filter((item) => !ids.includes(item.id))
      }
      this.persist('已删除')
    },
    openBatchDialog() {
      if (!this.getSelected('plan').length) return this.$message.warning('请选择要批量修改的方案')
      this.batchDialog = { visible: true, volume: null, status: '' }
    },
    async submitBatch() {
      const rows = this.getSelected('plan')
      if (!rows.length) return this.$message.warning('请选择要批量修改的方案')
      const hasStatus = Boolean(this.batchDialog.status)
      const hasVolume = this.batchDialog.volume !== null && this.batchDialog.volume !== undefined
      if (!hasStatus && !hasVolume) {
        this.$message.warning('请至少选择一个批量修改项')
        return
      }
      this.batchDialog.visible = false
      if (hasStatus) {
        const statusSaved = await this.applyImmediatePlanStatus(rows, this.batchDialog.status, { silent: hasVolume })
        if (!statusSaved) return
      }
      if (hasVolume) {
        const sourcePlans = await this.getPlanDraftSourcePlans()
        const nextPlans = this.clonePlanList(sourcePlans)
        const selectedIds = new Set(rows.map((plan) => String(plan?.id ?? '')))
        const targetPlans = []
        nextPlans.forEach((plan) => {
          if (!selectedIds.has(String(plan?.id ?? ''))) return
          if (Array.isArray(plan.tasks)) {
            plan.tasks.forEach((task) => {
              task.volume = this.batchDialog.volume
            })
          }
          targetPlans.push(plan)
        })
        const remoteTargets = targetPlans.filter((plan) => {
          const originalName = String(plan?.originName || plan?.name || '').trim()
          return originalName && !plan?.isNew
        })
        if (!remoteTargets.length) {
          this.$message.warning('选中的方案还未上传到远端，无法批量修改音量')
          return
        }
        if (this.persisting) {
          this.$message.warning('正在保存中，请稍候…')
          return
        }
        this.persisting = true
        const total = remoteTargets.length
        const progress = this.openBatchVolumeProgress(total)
        try {
          // probe-2 (2026-06-05) implementation decision: parallel is ~13.5s
          // faster than serial for N=3 (9.1s vs 22.6s), so the batch fans out
          // via Promise.allSettled. Any per-plan failure is collected and
          // surfaced via planSaveError + loadModules so the UI re-syncs to
          // whatever subset of plans actually wrote.
          //
          // T48 P1: wrap each PUT so its settlement bumps a completion counter
          // and updates the "已调 X/N" progress notice live. The wrappers never
          // swallow a rejection — they re-throw so Promise.allSettled still
          // records it and the failure handling below is unchanged.
          let done = 0
          const settled = await Promise.allSettled(
            remoteTargets.map((plan) => {
              const originalName = String(plan.originName || plan.name).trim()
              return Promise.resolve(updateScheduleEntry(originalName, this.serializePlanForApi(plan, nextPlans)))
                .then(
                  (value) => { done += 1; progress.update(done); return value },
                  (err) => { done += 1; progress.update(done); throw err }
                )
            })
          )
          const rejections = settled.filter((entry) => entry.status === 'rejected')
          if (rejections.length) {
            this.planSaveError(rejections[0].reason || new Error('批量修改音量失败'))
            await this.loadModules()
            return
          }
          this.applyPlanState(nextPlans)
          const successMessage = hasStatus
            ? '方案状态已同步，任务音量已更新'
            : '任务音量已更新'
          this.$message.success(successMessage)
        } catch (err) {
          this.planSaveError(err)
          await this.loadModules()
        } finally {
          progress.close()
          this.persisting = false
        }
        return
      }
      this.$message.success('批量修改已应用')
    },
    openBatchVolumeProgress(total) {
      // T48 P1: a persistent (duration: 0) progress notice for the batch volume
      // fan-out, updated in place as each plan settles. Element UI 2.x Message
      // instances expose a reactive `message` field, so we mutate it directly
      // rather than flicker through close/reopen. Returns a tiny controller so
      // submitBatch stays readable. The notice is informational only — it never
      // changes the batch's staging/draft semantics (KP #22).
      const label = (done) => `正在批量调整音量，已调 ${done}/${total}…`
      let instance = null
      try {
        instance = this.$message({ message: label(0), duration: 0, type: 'info' })
      } catch (err) {
        instance = null
      }
      return {
        update(done) {
          if (instance && typeof instance === 'object') {
            instance.message = label(done)
          }
        },
        close() {
          if (instance && typeof instance.close === 'function') {
            instance.close()
          }
        }
      }
    },
    openVolumeDialog(target) {
      const rows = this.getSelected(target)
      if (!rows.length) return this.$message.warning('请选择需要调整音量的行')
      this.volumeDialog = {
        visible: true,
        target,
        value: rows[0].volume || 50
      }
    },
    applyVolume() {
      const rows = this.getSelected(this.volumeDialog.target)
      if (!rows.length) return this.$message.warning('请选择需要调整音量的行')
      rows.forEach((item) => {
        item.volume = this.volumeDialog.value
      })
      this.volumeDialog.visible = false
      if (this.volumeDialog.target === 'broadcast') {
        this.persistBroadcastDraftLocally('音量已暂存到本地')
        return
      }
      this.persist('音量已调整')
    },
    onDurationModeChange(row) {
      if (!row) return
      const useHms = row.durationFormat === 'hms'
      if (row.durationMode === 'loop') {
        if (!row.loop) row.loop = 1
      } else if (!row.duration) {
        row.duration = useHms ? '00:05:00' : '05'
      } else if (useHms) {
        row.duration = this.formatDurationHms(row.duration)
      }
    },
    planTimelineSlots(plan) {
      const slots = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: 0,
        tasks: []
      }))
      const tasks = this.planVisibleTasks(plan)
      tasks.forEach((task) => {
        const seconds = this.timeToMinutes(task?.time)
        if (!Number.isFinite(seconds)) return
        const hour = Math.max(0, Math.min(23, Math.floor(seconds / 3600)))
        slots[hour].count += 1
        slots[hour].tasks.push(task)
      })
      return slots
    },
    timelineTooltip(slot) {
      if (!slot?.count) return `${String(slot?.hour || 0).padStart(2, '0')}:00 - ${String(slot?.hour || 0).padStart(2, '0')}:59 暂无任务`
      const hour = String(slot.hour).padStart(2, '0')
      const preview = slot.tasks
        .slice(0, 8)
        .map((task) => {
          const name = task?.customName || task?.audio || '未命名任务'
          const time = task?.time || '--:--:--'
          return `${time} ${name}`
        })
        .join('，')
      const more = slot.tasks.length > 8 ? ` 等 ${slot.tasks.length} 项` : ''
      return `${hour}:00 - ${hour}:59（${slot.tasks.length}项）${preview}${more}`
    },
    timelineSlotStyle(slot, plan) {
      const total = this.planVisibleTasks(plan).length
      if (!slot?.count || !total) {
        return { backgroundColor: '#edf2f8' }
      }
      const density = Math.min(1, slot.count / Math.max(1, total / 3))
      const opacity = 0.25 + (density * 0.65)
      return { backgroundColor: `rgba(45, 124, 246, ${opacity.toFixed(2)})` }
    },
    isInlineTaskEditing(plan, task, field) {
      const editor = this.inlineTaskEditor
      return Boolean(editor.active && editor.plan === plan && editor.task === task && editor.field === field)
    },
    inlineEditCellKey(task, field) {
      const taskId = task ? String(task.id ?? task.taskid ?? '') : ''
      return `${taskId}__${field || ''}`
    },
    inlineEditCellError(task, field) {
      return this.inlineEditErrors[this.inlineEditCellKey(task, field)] || ''
    },
    inlineEditCellSaving(task, field) {
      const editor = this.inlineTaskEditor
      return Boolean(
        editor.active &&
        editor.status === 'saving' &&
        editor.task === task &&
        editor.field === field
      )
    },
    // True while a cell holds its post-save 'saved' state. Unlike 'saving',
    // this does NOT require active editing — the cell has already exited edit
    // mode but keeps the saved marker (with savedAt) until the next edit of
    // this cell. The view layer reads savedAt off inlineTaskEditor to drive a
    // visible saved transition.
    inlineEditCellSaved(task, field) {
      const editor = this.inlineTaskEditor
      return Boolean(
        editor.status === 'saved' &&
        editor.savedAt &&
        editor.task === task &&
        editor.field === field
      )
    },
    clearInlineEditCellError(task, field) {
      const key = this.inlineEditCellKey(task, field)
      if (this.inlineEditErrors[key]) {
        this.$delete(this.inlineEditErrors, key)
      }
    },
    // Map an inline cell field to the remote single-task patch shape. The
    // backend update_single_task merges this patch on top of the task's remote
    // snapshot, so we only send the one field that changed.
    // Contract: `value` for `time` MUST already be normalized to HH:MM:SS by
    // the caller (commitInlineTaskEdit runs it through toTime first); this
    // function does not re-normalize.
    buildSingleTaskPatch(field, value) {
      if (field === 'audio') return { medianame: value }
      if (field === 'time') return { starttime: value }
      return {}
    },
    startInlineTaskEdit(plan, task, field) {
      if (!plan || !task || !field) return
      if (this.isOnceEphemeralTask(task)) {
        this.$message.info('一次性任务为只读临时对象，不能直接编辑')
        return
      }
      if (this.isInlineTaskEditing(plan, task, field)) return
      // Re-entering a cell clears its prior error so the red dot disappears
      // while the user is actively fixing the value.
      this.clearInlineEditCellError(task, field)
      this.inlineTaskEditor = {
        active: true,
        plan,
        task,
        field,
        value: task?.[field] || '',
        status: 'idle',
        savedAt: 0
      }
      this.$nextTick(() => {
        const editorEl = this.$el.querySelector('.inline-task-editor .el-input__inner')
        if (editorEl && typeof editorEl.focus === 'function') {
          editorEl.focus()
        }
      })
    },
    onInlineAudioVisibleChange(visible) {
      if (visible) return
      if (this.inlineTaskEditor?.active && this.inlineTaskEditor.field === 'audio') {
        this.commitInlineTaskEdit()
      }
    },
    async commitInlineTaskEdit() {
      if (!this.inlineTaskEditor?.active) return
      // Idempotency gate: a single cell edit can fire @change + @blur (and
      // @keyup.enter) back to back. Once a write is in flight, ignore repeats
      // so we never send the same patch twice.
      if (this.inlineTaskEditor.status === 'saving') return
      const { plan, task, field } = this.inlineTaskEditor
      if (!plan || !task || !field) {
        this.resetInlineTaskEdit()
        return
      }
      let value = this.inlineTaskEditor.value
      if (field === 'audio') {
        value = value ? String(value).trim() : ''
        if (!value) {
          this.$message.warning('请选择音频资源')
          return
        }
      }
      if (field === 'time') {
        value = this.toTime(value)
        if (!value) {
          this.$message.warning('请选择播放时间')
          return
        }
        if (this.isMidnightTime(value)) {
          try {
            await this.$confirm(
              '播放时间 00:00:00 → 手动播放模式，确认？',
              '零点执行确认',
              {
                confirmButtonText: '坚持保存',
                cancelButtonText: '返回修改',
                type: 'warning'
              }
            )
          } catch (err) {
            return
          }
        }
      }
      // If the task already exists on remote (numeric, non-zero taskid),
      // legacy direct-write path applies for fields that already have a
      // single-task patch shape (audio/time): write the single changed field
      // straight through update_single_task — same immediate-write semantics
      // as the drawer's existing-task save.
      //
      // T42: a local-draft task (taskid '0') no longer fails loud here. We
      // record the change as a dirty patch on the row; the user then clicks
      // the row's blue "完成" button which calls commitInlineTaskFinish to
      // push the whole-plan PUT (so the draft becomes a real remote task).
      // _originalSnapshot is captured BEFORE we mirror the new value onto
      // the row, so cancelInlineTaskDraft can fully restore the pre-edit
      // state for already-converted tasks.
      const scheduleName = String(plan?.name || '').trim()
      const remoteTaskId = String(task?.taskid || '').trim()
      const looksRemote = scheduleName && remoteTaskId && remoteTaskId !== '0' && /^\d+$/.test(remoteTaskId)
      if (looksRemote && !task._draftDirty) {
        await this.commitInlineTaskEditRemote(plan, task, field, value, scheduleName, remoteTaskId)
        return
      }
      // Draft task OR already-converted task with pending dirty patch:
      // record the change as a dirty patch, mirror to the row so the cell UI
      // shows the new value immediately, and leave it to the user to commit
      // via the "完成" button.
      if (!task._originalSnapshot) {
        // Snapshot the row BEFORE mirroring the new value so cancel can
        // restore pre-edit field values verbatim.
        this.$set(task, '_originalSnapshot', JSON.parse(JSON.stringify(task)))
      }
      if (!task._draftPatch || typeof task._draftPatch !== 'object') {
        this.$set(task, '_draftPatch', {})
      }
      this.$set(task._draftPatch, field, value)
      this.$set(task, field, value)
      if (field === 'time' && typeof this.sortTasksByTime === 'function' && Array.isArray(plan.tasks)) {
        this.sortTasksByTime(plan.tasks)
      }
      this.$set(task, '_draftDirty', true)
      this.resetInlineTaskEdit()
    },
    // Pessimistic immediate write for an inline cell on an existing remote
    // task: stay in 'saving' until the remote ACKs, only then mutate the local
    // row. On failure the row is never touched (so state stays consistent) and
    // a field-level error is recorded for the cell.
    async commitInlineTaskEditRemote(plan, task, field, value, scheduleName, remoteTaskId) {
      const cellKey = this.inlineEditCellKey(task, field)
      this.$set(this.inlineTaskEditor, 'status', 'saving')
      this.clearInlineEditCellError(task, field)
      try {
        await updateSingleTask(scheduleName, remoteTaskId, this.buildSingleTaskPatch(field, value))
        // ACK ok — update the row in place (no follow-up GET; backend already
        // merged + scheduled the async engine refresh).
        if (Array.isArray(plan.tasks)) {
          const idx = this.findTaskIndexById(plan.tasks, task.id)
          if (idx >= 0) {
            this.$set(plan.tasks[idx], field, value)
            if (field === 'time') {
              this.sortTasksByTime(plan.tasks)
            }
          }
        }
        // Exit the editing UI (collapse the input) but HOLD the 'saved' state
        // on this cell with a timestamp — it is NOT cleared here. The saved
        // state persists until the next edit of this cell (startInlineTaskEdit
        // resets it), so the view layer can render a visible saved transition
        // off savedAt. No timer is involved.
        this.inlineTaskEditor = {
          active: false,
          plan: null,
          task,
          field,
          value: '',
          status: 'saved',
          savedAt: Date.now()
        }
        this.$message.success('任务已保存')
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || '保存失败，请重试'
        this.$set(this.inlineEditErrors, cellKey, detail)
        this.inlineTaskEditor.status = 'error'
        this.$message.error(detail)
      }
    },
    // T42 inline commit-button flow:
    // ─────────────────────────────────────────────────────────────────────
    // The row stays in 'dirty' mode (blue "完成" + gray "取消" in the op
    // column) once commitInlineTaskEdit records a _draftPatch. Clicking
    // "完成" runs commitInlineTaskFinish below; clicking "取消" runs
    // cancelInlineTaskDraft.
    //
    // _draftPatch / _draftDirty / _originalSnapshot do NOT leak to the
    // remote: serializePlanForApi → buildScheduleTaskFromPlan is a
    // hard-coded whitelist builder that only emits the documented payload
    // fields. The dirty flags stay in-memory only.
    async commitInlineTaskFinish(plan, task) {
      if (!plan || !task) return
      if (this.persisting) {
        this.$message.warning('正在保存中，请稍候…')
        return
      }
      const scheduleName = String(plan?.name || '').trim()
      const remoteTaskId = String(task?.taskid || '').trim()
      const taskIsRemote = scheduleName && remoteTaskId && remoteTaskId !== '0' && /^\d+$/.test(remoteTaskId)
      const planIsRemote = !plan.isNew && Boolean(String(plan.originName || plan.name || '').trim())
      // Case A: already-converted task (taskid is a real remote id). Merge
      // every patched field into a single update_single_task PUT — same
      // semantics as commitInlineTaskEditRemote but for an N-field batch
      // instead of one cell at a time.
      if (taskIsRemote) {
        const patch = task._draftPatch && typeof task._draftPatch === 'object' ? task._draftPatch : {}
        const merged = {}
        Object.keys(patch).forEach((field) => {
          Object.assign(merged, this.buildSingleTaskPatch(field, patch[field]))
        })
        if (!Object.keys(merged).length) {
          // Nothing to send — just clear the dirty flag so the row recovers
          // its default action buttons. (Defensive: shouldn't happen because
          // the dirty flag only flips when a field changes, but keep this
          // branch so a stale flag never strands the UI.)
          this.$set(task, '_draftDirty', false)
          this.$set(task, '_draftPatch', {})
          this.$set(task, '_originalSnapshot', null)
          return
        }
        try {
          await updateSingleTask(scheduleName, remoteTaskId, merged)
          this.$set(task, '_draftDirty', false)
          this.$set(task, '_draftPatch', {})
          this.$set(task, '_originalSnapshot', null)
          this.$message.success('任务已更新')
        } catch (err) {
          const detail = err?.response?.data?.detail || err?.message
          this.$message.error(detail || '保存失败,请重试')
        }
        return
      }
      // Case B: draft task (taskid='0') on an already-remote plan. Promote
      // the whole plan via commitPlanOperations → updateScheduleEntry PUT;
      // the backend assigns a real taskid which we'll see on the next GET.
      if (planIsRemote) {
        const currentPlans = Array.isArray(this.modules?.plans) ? this.modules.plans : []
        const ok = await this.commitPlanOperations(
          currentPlans,
          [{ type: 'update', planId: plan.id, originalName: plan.originName || plan.name }],
          '任务已创建'
        )
        if (ok) {
          this.$set(task, '_draftDirty', false)
          this.$set(task, '_draftPatch', {})
          this.$set(task, '_originalSnapshot', null)
        }
        return
      }
      // Case C: brand-new plan whose 新建方案 flow has not yet been committed
      // (plan.isNew=true). The plan itself doesn't exist on the remote, so a
      // per-task inline commit can't go anywhere — defer to the plan-level
      // save (新建方案 confirmation) and just clear the dirty flag locally so
      // the row stops nagging the user.
      this.$set(task, '_draftDirty', false)
      this.$set(task, '_draftPatch', {})
      this.$set(task, '_originalSnapshot', null)
      this.$message.info('新方案尚未提交，请先完成"新建方案"步骤')
    },
    cancelInlineTaskDraft(plan, task) {
      if (!plan || !task) return
      const remoteTaskId = String(task?.taskid || '').trim()
      const isDraftRow = !remoteTaskId || remoteTaskId === '0' || !/^\d+$/.test(remoteTaskId)
      if (isDraftRow) {
        // Pure draft row → drop it entirely (PO D: 草稿取消 = 删行).
        if (Array.isArray(plan.tasks)) {
          const idx = this.findTaskIndexById(plan.tasks, task.id)
          if (idx >= 0) plan.tasks.splice(idx, 1)
          if (typeof plan.taskCount === 'number') {
            plan.taskCount = plan.tasks.length
          }
        }
        return
      }
      // Already-converted row → restore _originalSnapshot field by field so
      // the row reverts to its pre-edit state. Then clear all dirty markers.
      const snapshot = task._originalSnapshot && typeof task._originalSnapshot === 'object'
        ? task._originalSnapshot
        : null
      if (snapshot) {
        Object.keys(snapshot).forEach((key) => {
          if (key === '_draftDirty' || key === '_draftPatch' || key === '_originalSnapshot') return
          this.$set(task, key, snapshot[key])
        })
        if (typeof this.sortTasksByTime === 'function' && Array.isArray(plan.tasks)) {
          this.sortTasksByTime(plan.tasks)
        }
      }
      this.$set(task, '_draftDirty', false)
      this.$set(task, '_draftPatch', {})
      this.$set(task, '_originalSnapshot', null)
    },
    resetInlineTaskEdit() {
      this.inlineTaskEditor = {
        active: false,
        plan: null,
        task: null,
        field: '',
        value: '',
        status: 'idle',
        savedAt: 0
      }
    },
    taskDisplayName(task) {
      if (!task) return '未命名任务'
      return task.customName || task.audio || task.taskname || '未命名任务'
    },
    taskDurationLabel(task) {
      if (!task) return '—'
      if (task.durationMode === 'loop') {
        const loop = task.loop || 1
        return `循环 ${loop} 次`
      }
      const seconds = this.toDurationSeconds(task.duration)
      return seconds ? `${seconds} 秒` : '—'
    },
    planTaskStatus(task) {
      const enabled = task?.powerOn !== false
      return enabled
        ? { label: '启用', type: 'success' }
        : { label: '停用', type: 'info' }
    },
    openTaskDrawer(plan, task) {
      if (!plan) return
      if (task && this.isOnceEphemeralTask(task)) {
        this.$message.info('一次性任务为只读临时对象，不能直接编辑')
        return
      }
      const isNew = !task
      const draft = isNew ? this.newPlanTask() : this.cloneTask(task)
      if (isNew) draft.time = '00:00:00'
      this.repairStoredLocationBinding(draft)
      this.resetTaskDrawerValidation()
      this.taskDrawer = {
        visible: true,
        plan,
        task: task || null,
        draft,
        isNew,
        isOnceOverride: false,
        overrideId: '',
        onceTaskId: '',
        sourceSummary: '',
        kind: 'plan',
        broadcastRow: null
      }
    },
    openBroadcastTaskDrawer(row) {
      if (!row) return
      const draft = this.broadcastRowToDraft(row)
      this.repairStoredLocationBinding(draft)
      this.resetTaskDrawerValidation()
      this.taskDrawer = {
        visible: true,
        plan: null,
        task: null,
        draft,
        isNew: false,
        isOnceOverride: false,
        overrideId: '',
        onceTaskId: '',
        sourceSummary: '',
        kind: 'broadcast',
        broadcastRow: row
      }
    },
    openBroadcastTaskDrawerForAdd() {
      const stamp = typeof this.buildUniqueBroadcastName === 'function'
        ? this.buildUniqueBroadcastName()
        : '新广播任务'
      const seed = this.newBroadcastRow(stamp)
      const draft = this.broadcastRowToDraft(seed)
      this.repairStoredLocationBinding(draft)
      this.resetTaskDrawerValidation()
      this.taskDrawer = {
        visible: true,
        plan: null,
        task: null,
        draft,
        isNew: true,
        isOnceOverride: false,
        overrideId: '',
        onceTaskId: '',
        sourceSummary: '',
        kind: 'broadcast',
        broadcastRow: null
      }
    },
    broadcastRowToDraft(row) {
      const safeArray = (value) => (Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [])
      const numericVolume = Number(row && row.volume)
      const startDateRaw = this.normalizeDate(row && (row.startdate || row.start_date)) || ''
      const endDateRaw = this.normalizeDate(row && (row.enddate || row.end_date)) || startDateRaw
      const dateRange = startDateRaw || endDateRaw ? [startDateRaw, endDateRaw || startDateRaw] : []
      const durationMode = row && row.durationMode ? row.durationMode : 'loop'
      const loop = Number(row && row.loop)
      const audio = row && row.audio !== undefined && row.audio !== null ? String(row.audio) : ''
      const mediaid = row && row.mediaid !== undefined && row.mediaid !== null ? String(row.mediaid) : ''
      return {
        id: row && row.id ? row.id : this.createDraftTaskId(),
        taskid: row && row.taskid !== undefined && row.taskid !== null ? String(row.taskid) : '',
        customName: row && row.name ? String(row.name) : '',
        audio,
        mediaid,
        time: row && row.time ? String(row.time) : '',
        duration: row && row.duration ? row.duration : '00:05:00',
        loop: Number.isFinite(loop) && loop > 0 ? loop : 1,
        durationMode,
        weekdays: safeArray(row && row.weekdays),
        dateRange,
        volume: Number.isFinite(numericVolume) ? numericVolume : 50,
        prepower: Number.isFinite(Number(row && row.prepower)) ? Number(row.prepower) : 15,
        level: Number.isFinite(Number(row && row.level)) ? Number(row.level) : 10,
        location: safeArray(row && row.location),
        terminalids: safeArray(row && row.terminalids),
        terminalnames: safeArray(row && row.terminalnames),
        liveterminalid: row && row.liveterminalid ? String(row.liveterminalid) : '',
        liveterminalname: row && row.liveterminalname ? String(row.liveterminalname) : '',
        powerOn: true,
        taskLevel: '正常',
        sendMode: '单播',
        playMode: '串行',
        ledSetting: ''
      }
    },
    resetTaskDrawerValidation() {
      this.taskDrawerErrors = {}
      this.taskDrawerMidnightWarning = false
    },
    onTaskDrawerFieldChange(field) {
      if (!field) return
      if (this.taskDrawerErrors[field]) {
        this.$set(this.taskDrawerErrors, field, '')
      }
      if (field === 'time') {
        this.taskDrawerMidnightWarning = false
      }
    },
    onTaskDrawerLocationChange(value) {
      if (!this.taskDrawer?.draft) return
      this.syncTerminalFieldsFromLocation(this.taskDrawer.draft, value, { warn: true })
      this.onTaskDrawerFieldChange('location')
    },
    onTaskDrawerDurationModeChange() {
      if (!this.taskDrawer?.draft) return
      this.onDurationModeChange(this.taskDrawer.draft)
      this.onTaskDrawerFieldChange('duration')
    },
    onTaskDrawerAudioChange(selectedValue) {
      if (!this.taskDrawer?.draft) return
      const match = (this.audioOptions || []).find((item) => item && item.value === selectedValue)
      if (match && match.id !== undefined && match.id !== null) {
        this.$set(this.taskDrawer.draft, 'mediaid', String(match.id))
      }
      this.onTaskDrawerFieldChange('audio')
    },
    taskDrawerFieldError(field) {
      if (!field) return ''
      if (field === 'time' && this.taskDrawerMidnightWarning) {
        return '播放时间 00:00:00 → 手动播放模式，确认。'
      }
      return this.taskDrawerErrors[field] || ''
    },
    taskDrawerFieldAlert(field) {
      return Boolean(this.taskDrawerFieldError(field))
    },
    isMidnightTime(value) {
      return this.toTime(value) === '00:00:00'
    },
    validateTaskDrawerDraft(draft, options = {}) {
      const isOnceOverride = options.isOnceOverride === true
      const kind = options.kind === 'broadcast' ? 'broadcast' : 'plan'
      const errors = {}
      const name = draft?.customName ? String(draft.customName).trim() : ''
      const audio = draft?.audio ? String(draft.audio).trim() : ''
      const time = this.toTime(draft?.time || '')
      const weekdays = Array.isArray(draft?.weekdays) ? draft.weekdays : []
      const dateRange = Array.isArray(draft?.dateRange) ? draft.dateRange : []
      const { paths: location, emptyZones } = this.expandLocationSelection(draft?.location, {
        preserveUnresolvedZones: false
      })

      if (!name) errors.customName = '任务名不能为空'
      if (!audio) errors.audio = '请选择音频资源'
      if (!time) errors.time = '请选择播放时间'
      if (draft?.durationMode === 'loop') {
        const loop = Number(draft?.loop)
        if (!Number.isFinite(loop) || loop <= 0) {
          errors.duration = '循环次数必须大于 0'
        }
      } else {
        const seconds = this.toDurationSeconds(draft?.duration)
        if (!seconds) {
          errors.duration = '请设置有效时长'
        }
      }
      if (!isOnceOverride && !weekdays.length) errors.weekdays = '请至少选择一个执行周期'
      if (kind === 'broadcast') {
        if (dateRange.length && (!this.normalizeDate(dateRange[0]) || !this.normalizeDate(dateRange[1]))) {
          errors.dateRange = '请补全时效范围'
        }
      } else if (isOnceOverride) {
        const onceDate = this.normalizeDate(dateRange[0]) || this.normalizeDate(dateRange[1])
        if (!onceDate) errors.dateRange = '请选择执行日期'
      } else if (dateRange.length < 2 || !this.normalizeDate(dateRange[0]) || !this.normalizeDate(dateRange[1])) {
        errors.dateRange = '请选择时效范围'
      }
      if (!location.length) {
        errors.location = emptyZones.length
          ? this.emptyZoneLocationMessage(emptyZones)
          : '终端地点不能为空'
      }

      const fieldOrder = isOnceOverride
        ? ['customName', 'audio', 'time', 'duration', 'dateRange', 'location']
        : ['customName', 'audio', 'time', 'duration', 'weekdays', 'dateRange', 'location']
      const firstField = fieldOrder.find((key) => errors[key])
      return { errors, firstField }
    },
    focusTaskDrawerField(field) {
      if (!field) return
      this.$nextTick(() => {
        const root = this.$el && this.$el.querySelector
          ? this.$el.querySelector(`.task-drawer-body [data-drawer-field="${field}"]`)
          : null
        if (!root) return
        if (typeof root.scrollIntoView === 'function') {
          root.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        const target = root.querySelector('input, textarea, .el-checkbox__original')
        if (target && typeof target.focus === 'function') {
          target.focus()
        }
      })
    },
    closeTaskDrawer() {
      this.taskDrawer.visible = false
      this.taskDrawer.plan = null
      this.taskDrawer.task = null
      this.taskDrawer.draft = null
      this.taskDrawer.isNew = false
      this.taskDrawer.isOnceOverride = false
      this.taskDrawer.overrideId = ''
      this.taskDrawer.onceTaskId = ''
      this.taskDrawer.sourceSummary = ''
      this.taskDrawer.kind = 'plan'
      this.taskDrawer.broadcastRow = null
      this.resetTaskDrawerValidation()
      this.resetInlineTaskEdit()
    },
    async saveTaskDrawer() {
      // Double-click guard: drawer "完成编辑" can fire twice on slow networks.
      // isNew → second click 409s on duplicate name; isNew=false → duplicate
      // commit + BSJ mirror runs twice. Single re-entry latch + finally reset.
      if (this.taskDrawerSaving) return
      this.taskDrawerSaving = true
      try {
        await this._saveTaskDrawerImpl()
      } finally {
        this.taskDrawerSaving = false
      }
    },
    async _saveTaskDrawerImpl() {
      const { plan, task, draft, isNew, isOnceOverride, overrideId, onceTaskId, kind } = this.taskDrawer
      if (!draft) {
        this.closeTaskDrawer()
        return
      }
      if (kind !== 'broadcast' && !plan) {
        this.closeTaskDrawer()
        return
      }
      this.syncTerminalFieldsFromLocation(draft, draft.location, { warn: false })
      const { errors, firstField } = this.validateTaskDrawerDraft(draft, { isOnceOverride, kind })
      this.taskDrawerErrors = errors
      if (firstField) {
        this.focusTaskDrawerField(firstField)
        this.$message.warning('请先完成红色标记项后再保存')
        return
      }
      if (this.isMidnightTime(draft.time)) {
        this.taskDrawerMidnightWarning = true
        this.focusTaskDrawerField('time')
        try {
          await this.$confirm(
            '播放时间 00:00:00 → 手动播放模式，确认？',
            '零点执行确认',
            {
              confirmButtonText: '坚持保存',
              cancelButtonText: '返回修改',
              type: 'warning'
            }
          )
          this.taskDrawerMidnightWarning = false
        } catch (err) {
          return
        }
      }
      if (isOnceOverride) {
        const saveDate = this.normalizeDate(draft?.dateRange?.[0]) || this.normalizeDate(draft?.dateRange?.[1]) || ''
        const payload = {
          taskname: String(draft.customName || '').trim(),
          medianame: String(draft.audio || '').trim(),
          startdate: saveDate,
          starttime: this.toTime(draft.time || ''),
          timelength: draft.durationMode === 'loop'
            ? String(draft.loop || 1)
            : String(this.toDurationSeconds(draft.duration || '')),
          timelengthtype: draft.durationMode === 'loop' ? '2' : '1',
          volume: draft.volume,
          terminalids: Array.isArray(draft.terminalids) ? draft.terminalids : [],
          terminalnames: Array.isArray(draft.terminalnames) ? draft.terminalnames : [],
          liveterminalid: draft.liveterminalid || '',
          liveterminalname: draft.liveterminalname || '',
          location: Array.isArray(draft.location) ? draft.location : []
        }
        try {
          await updateOnceOverrideTask(overrideId, onceTaskId, payload)
          await this.loadModules()
          this.closeTaskDrawer()
          this.$message.success('临时任务已更新')
        } catch (err) {
          const detail = err?.response?.data?.detail || err?.message
          this.$message.error(detail || '临时任务更新失败，请重试')
        }
        return
      }
      if (kind === 'broadcast') {
        await this.saveBroadcastTaskDrawer({ draft, isNew })
        return
      }
      // Existing task edit → immediate per-task sync (skip batched draft path).
      // Backend update_single_task fetches the task's remote snapshot, merges
      // this payload on top, and writes through task_writer.remote_update_task.
      const scheduleName = String(plan?.name || '').trim()
      const targetTaskId = task ? String(task.id || task.taskid || '').trim() : ''
      if (task && !isNew && scheduleName && targetTaskId) {
        const startDate = this.normalizeDate(draft?.dateRange?.[0]) || ''
        const endDate = this.normalizeDate(draft?.dateRange?.[1]) || startDate
        const payload = {
          taskname: String(draft.customName || '').trim(),
          medianame: String(draft.audio || '').trim(),
          startdate: startDate,
          enddate: endDate,
          starttime: this.toTime(draft.time || ''),
          timelength: draft.durationMode === 'loop'
            ? String(draft.loop || 1)
            : String(this.toDurationSeconds(draft.duration || '')),
          timelengthtype: draft.durationMode === 'loop' ? '2' : '1',
          volume: draft.volume,
          terminalids: Array.isArray(draft.terminalids) ? draft.terminalids : [],
          terminalnames: Array.isArray(draft.terminalnames) ? draft.terminalnames : [],
          liveterminalid: draft.liveterminalid || '',
          liveterminalname: draft.liveterminalname || '',
          location: Array.isArray(draft.location) ? draft.location : []
        }
        // 允许空数组进 payload:用户把周几全去掉时后端要收到 weekdays=[] 才能派生
        // execmode=0(不再按周循环);Array.isArray 守卫保证 undefined 时仍不发(修 T104)。
        if (Array.isArray(draft.weekdays)) {
          payload.weekdays = draft.weekdays
        }
        try {
          await updateSingleTask(scheduleName, targetTaskId, payload)
          // Update the row in place from the draft instead of re-fetching the
          // entire schedule's tasks (which would trigger a deep terminal-binding
          // fan-out on the backend — adds ~1s for no benefit when we already
          // know the new shape locally). Background engine refresh on the
          // backend keeps NLU in sync within a couple seconds.
          if (Array.isArray(plan.tasks)) {
            const idx = this.findTaskIndexById(plan.tasks, task.id)
            if (idx >= 0) {
              Object.assign(plan.tasks[idx], this.cloneTask(draft))
              this.sortTasksByTime(plan.tasks)
            }
          }
          this.closeTaskDrawer()
          this.$message.success('任务已保存')
        } catch (err) {
          const detail = err?.response?.data?.detail || err?.message
          this.$message.error(detail || '保存失败,请重试')
        }
        return
      }
      const sourcePlans = await this.getPlanDraftSourcePlans()
      const nextPlans = this.clonePlanList(sourcePlans)
      const planIndex = this.findPlanIndexById(nextPlans, plan.id)
      if (planIndex < 0) {
        this.$message.warning('未找到要修改的方案')
        return
      }
      const nextPlan = nextPlans[planIndex]
      if (!Array.isArray(nextPlan.tasks)) nextPlan.tasks = []
      if (isNew) {
        nextPlan.tasks.unshift(this.cloneTask(draft))
        nextPlan.tasksLoaded = true
        nextPlan.taskCount = nextPlan.tasks.length
      } else if (task) {
        const taskIndex = this.findTaskIndexById(nextPlan.tasks, task.id)
        if (taskIndex < 0) {
          this.$message.warning('未找到要修改的任务')
          return
        }
        Object.assign(nextPlan.tasks[taskIndex], this.cloneTask(draft))
      }
      this.sortTasksByTime(nextPlan.tasks)
      // New task on an existing remote schedule → immediate (pessimistic) write:
      // PUT the whole schedule via commitPlanOperations (updateScheduleEntry).
      // ACK makes the task appear and leaves planDirtyIds/badge untouched; a
      // failure rolls back through loadModules with an error toast. Other paths
      // (editing a not-yet-uploaded local task) keep the draft flow.
      const planIsRemote = !nextPlan.isNew && Boolean(String(nextPlan.originName || nextPlan.name || '').trim())
      if (isNew && planIsRemote) {
        const ok = await this.commitPlanOperations(
          nextPlans,
          [{ type: 'update', planId: nextPlan.id, originalName: nextPlan.originName || nextPlan.name }],
          '任务已创建'
        )
        if (ok) this.closeTaskDrawer()
        return
      }
      // After T39 Step 1 A every plan reaches the row via createPlanImmediate /
      // copy / a fresh GET, so isNew local-only plans no longer materialise here.
      // Fail loud instead of silently staging a draft the remote can't accept.
      this.$message.warning('该方案尚未上传到远端，请先使用"新建方案"上传后再添加任务')
      this.closeTaskDrawer()
    },
    draftToBroadcastRow(draft) {
      if (!draft) return null
      const durationMode = draft.durationMode === 'loop' ? 'loop' : 'duration'
      const loopValue = Number(draft.loop)
      const safeLoop = Number.isFinite(loopValue) && loopValue > 0 ? loopValue : 1
      const startDate = this.normalizeDate(draft.dateRange && draft.dateRange[0]) || ''
      const endDate = this.normalizeDate(draft.dateRange && draft.dateRange[1]) || startDate
      const row = {
        id: draft.id || this.createBroadcastDraftId(),
        taskid: draft.taskid ? String(draft.taskid) : '',
        name: String(draft.customName || '').trim(),
        status: '待执行',
        volume: Number.isFinite(Number(draft.volume)) ? Number(draft.volume) : 50,
        prepower: Number.isFinite(Number(draft.prepower)) ? Number(draft.prepower) : 15,
        level: Number.isFinite(Number(draft.level)) ? Number(draft.level) : 10,
        emergency: false,
        audio: String(draft.audio || '').trim(),
        duration: draft.duration,
        loop: safeLoop,
        durationMode,
        time: this.toTime(draft.time || ''),
        weekdays: Array.isArray(draft.weekdays) ? [...draft.weekdays] : [],
        location: Array.isArray(draft.location) ? JSON.parse(JSON.stringify(draft.location)) : [],
        terminalids: Array.isArray(draft.terminalids) ? [...draft.terminalids] : [],
        terminalnames: Array.isArray(draft.terminalnames) ? [...draft.terminalnames] : [],
        liveterminalid: draft.liveterminalid || '',
        liveterminalname: draft.liveterminalname || ''
      }
      if (startDate) row.startdate = startDate
      if (endDate) row.enddate = endDate
      return row
    },
    async saveBroadcastTaskDrawer({ draft, isNew }) {
      const today = new Date().toISOString().slice(0, 10)
      const rowFromDraft = this.draftToBroadcastRow(draft)
      if (!rowFromDraft) {
        this.$message.error('保存失败：表单数据无效')
        return
      }
      if (isNew) {
        const payload = this.buildAllTaskRow(rowFromDraft, 2, today)
        if (!payload) {
          this.$message.error('保存失败：行数据无效')
          return
        }
        if (rowFromDraft.startdate) payload.startdate = rowFromDraft.startdate
        if (rowFromDraft.enddate) payload.enddate = rowFromDraft.enddate
        let resp
        try {
          resp = await addBroadcastImmediate(payload)
        } catch (err) {
          const status = err && err.response && err.response.status
          const detail = (err && err.response && err.response.data && err.response.data.detail) ||
            err?.message || '远端返回失败'
          if (status === 409) {
            this.$message.warning(detail || '名称已存在，请改名后重试')
          } else {
            this.$message.error(`保存失败：${detail}`)
          }
          return
        }
        const newTaskId = String(resp?.task_id || '').trim()
        if (!newTaskId) {
          this.$message.error('保存失败：远端未返回任务编号')
          return
        }
        const persistedRow = { ...rowFromDraft, taskid: newTaskId, id: newTaskId }
        const applyPersistedRow = () => {
          this.modules.broadcasts.unshift(persistedRow)
          this.patchBroadcastSyncedSnapshotForRow(persistedRow, 'add')
        }
        await this.applyBroadcastImmediateThenClear(applyPersistedRow, newTaskId)
        // T51 ①: replace the locally-built shape-A row with the server canonical
        // form so it cannot fork from the base and self-perpetuate a draft.
        await this.backfillBroadcastsFromRemote()
        this.closeTaskDrawer()
        this.$message.success('广播任务已保存')
        return
      }
      const remoteTaskId = String(rowFromDraft.taskid || '').trim()
      if (!remoteTaskId || !/^\d+$/.test(remoteTaskId)) {
        this.$message.error('保存失败：任务编号无效，请重新加载')
        return
      }
      // mediaid silent-stale guardrail (R1): backend resolve_media_id
      // short-circuits when row.mediaid is present, which can bind a stale
      // id across f2/f3 collisions. Stripping it forces the leaf to walk
      // the name → media_map branch.
      const rowPayload = { ...rowFromDraft }
      delete rowPayload.mediaid
      // Terminal fail-loud guardrail: clear id columns so backend
      // resolve_terminal_ids re-derives from location (422 when ambiguous).
      delete rowPayload.terminalids
      delete rowPayload.liveterminalid
      delete rowPayload.taskterminal
      delete rowPayload.terminalnames
      delete rowPayload.liveterminalname
      const dirtyFields = ['taskname', 'medianame', 'starttime', 'weekdays', 'timelength', 'location', 'volume', 'prepower', 'level', 'startdate', 'enddate']
      // Backend reads taskname from row.taskname (T37 P1 commit_broadcast_fields
      // spreads the row; aliasing keeps the BSJ mirror keys aligned).
      rowPayload.taskname = rowPayload.name
      rowPayload.medianame = rowPayload.audio
      rowPayload.starttime = rowPayload.time
      rowPayload.timelength = rowPayload.durationMode === 'loop'
        ? String(rowPayload.loop || 1)
        : String(this.toDurationSeconds(rowPayload.duration || ''))
      rowPayload.timelengthtype = rowPayload.durationMode === 'loop' ? '2' : '1'
      try {
        await commitBroadcastFields(remoteTaskId, {
          row: rowPayload,
          dirty_fields: dirtyFields
        })
      } catch (err) {
        const status = err && err.response && err.response.status
        const detail = (err && err.response && err.response.data && err.response.data.detail) ||
          err?.message || '远端返回失败'
        if (status === 422) {
          this.$message.warning(detail)
        } else {
          this.$message.error(`保存失败：${detail}`)
        }
        return
      }
      const origRow = this.taskDrawer.broadcastRow
      const patchedRow = { ...(origRow || {}), ...rowFromDraft, taskid: remoteTaskId, id: remoteTaskId }
      const applyPatched = () => {
        if (origRow) {
          const idx = this.modules.broadcasts.indexOf(origRow)
          if (idx >= 0) {
            this.$set(this.modules.broadcasts, idx, patchedRow)
          }
        }
        this.patchBroadcastSyncedSnapshotForRow(patchedRow, 'update')
      }
      await this.applyBroadcastImmediateThenClear(applyPatched, remoteTaskId)
      this.closeTaskDrawer()
      this.$message.success('广播任务已保存')
    },
    cloneTask(task) {
      return JSON.parse(JSON.stringify(task || {}))
    },
    planTaskNames(plan) {
      if (!plan || !Array.isArray(plan.tasks) || !plan.tasks.length) return '—'
      const names = this.stripOnceEphemeralPlanTasks(plan.tasks)
        .map((task) => task.customName || task.audio || '')
        .filter((name) => name)
      const summary = names.length ? names.join('，') : '—'
      const onceHint = this.planTaskCountHint(plan)
      return onceHint ? `${summary}${onceHint}` : summary
    },
    planConflictSummary(plan, task) {
      const conflicts = this.planTaskConflicts(plan, task)
      if (!conflicts.length) return ''
      const preview = conflicts
        .slice(0, 5)
        .map((item) => {
          const name = item.customName || item.audio || '未命名任务'
          const time = item.time || '--:--'
          return `${time} ${name}`
        })
        .join('、')
      const more = conflicts.length > 5 ? ` 等${conflicts.length}个任务` : ''
      return `可能冲突：${preview}${more}`
    },
    planTaskConflicts(plan, task) {
      if (!plan || !Array.isArray(plan.tasks)) return []
      return plan.tasks.filter((item) => item !== task && this.planTasksConflict(task, item))
    },
    planTasksConflict(a, b) {
      if (!this.timeRangesOverlap(a, b)) return false
      if (!this.weekdaysOverlap(a?.weekdays, b?.weekdays)) return false
      if (!this.dateRangesOverlap(a?.dateRange, b?.dateRange)) return false
      if (!this.locationsOverlap(a?.location, b?.location)) return false
      return true
    },
    timeRangesOverlap(a, b) {
      const startA = this.timeToMinutes(a?.time)
      const startB = this.timeToMinutes(b?.time)
      if (!Number.isFinite(startA) || !Number.isFinite(startB)) return false
      const durationA = this.taskDurationSeconds(a)
      const durationB = this.taskDurationSeconds(b)
      const endA = startA + durationA
      const endB = startB + durationB
      return startA < endB && startB < endA
    },
    taskDurationSeconds(task) {
      const mode = task?.durationMode || 'loop'
      if (mode === 'loop') {
        const loop = Number(task?.loop)
        return Number.isFinite(loop) && loop > 0 ? loop : 1
      }
      const duration = Number(task?.duration)
      return Number.isFinite(duration) && duration > 0 ? duration : 1
    },
    weekdaysOverlap(a, b) {
      const listA = Array.isArray(a) ? a : []
      const listB = Array.isArray(b) ? b : []
      if (!listA.length || !listB.length) return true
      return listA.some((day) => listB.includes(day))
    },
    dateRangesOverlap(aRange, bRange) {
      const aStart = this.normalizeDate(aRange?.[0]) || ''
      const aEnd = this.normalizeDate(aRange?.[1]) || aStart
      const bStart = this.normalizeDate(bRange?.[0]) || ''
      const bEnd = this.normalizeDate(bRange?.[1]) || bStart
      const aStartVal = aStart || '0000-00-00'
      const aEndVal = aEnd || '9999-12-31'
      const bStartVal = bStart || '0000-00-00'
      const bEndVal = bEnd || '9999-12-31'
      return aStartVal <= bEndVal && bStartVal <= aEndVal
    },
    locationsOverlap(aLoc, bLoc) {
      const aPaths = this.normalizeLocationPaths(aLoc)
      const bPaths = this.normalizeLocationPaths(bLoc)
      if (!aPaths.length || !bPaths.length) return false
      return aPaths.some((pathA) => bPaths.some((pathB) => this.pathsOverlap(pathA, pathB)))
    },
    normalizeLocationPaths(location) {
      if (!Array.isArray(location)) return []
      const zoneMap = this.zoneValueMap || {}
      return location
        .map((entry) => {
          if (Array.isArray(entry)) {
            if (!entry.length) return []
            const [zone, ...rest] = entry
            const zoneKey = String(zone ?? '')
            const zoneLabel = zoneKey === '区域零' || zoneKey === '0'
              ? UNASSIGNED_ZONE_LABEL
              : (zoneMap[zoneKey] || zoneKey)
            return [zoneLabel, ...rest.map((value) => String(value))]
          }
          if (!entry) return []
          const key = String(entry)
          if (key === '区域零' || key === '0') return [UNASSIGNED_ZONE_LABEL]
          return [zoneMap[key] || key]
        })
        .filter((entry) => entry.length)
    },
    pathsOverlap(aPath, bPath) {
      if (!aPath.length || !bPath.length) return false
      const minLen = Math.min(aPath.length, bPath.length)
      for (let i = 0; i < minLen; i += 1) {
        if (aPath[i] !== bPath[i]) return false
      }
      return true
    },
    finishEdit(type) {
      const labelMap = { plan: '作息方案', broadcast: '文件广播', live: '采播管理' }
      if (type === 'broadcast') {
        this.persistBroadcastDraftLocally('文件广播已暂存到本地')
        return
      }
      this.persist(`${labelMap[type] || '任务'}已完成编辑`)
    },
    async addPlanTask(plan) {
      if (!plan) return
      if (!plan.tasksLoaded) {
        await this.loadPlanTasks(plan)
      }
      this.openTaskDrawer(plan)
    },
    async removePlanTask(plan, task) {
      if (this.isOnceEphemeralTask(task)) {
        this.$message.info('一次性任务为只读临时对象，不能直接删除')
        return
      }
      const ok = await this.confirmDelete('确定删除该任务吗？')
      if (!ok) return
      // If the task already exists on remote (numeric taskid, non-zero),
      // delete it immediately instead of staging in the local draft.
      const scheduleName = String(plan?.name || '').trim()
      const remoteTaskId = String(task?.taskid || '').trim()
      const looksRemote = scheduleName && remoteTaskId && remoteTaskId !== '0' && /^\d+$/.test(remoteTaskId)
      if (looksRemote) {
        try {
          await deleteSingleTask(scheduleName, remoteTaskId)
          // Splice locally — same reasoning as the per-edit save: we know
          // the resulting state, no need to fan-out a fresh GET /tasks for
          // the whole schedule. taskCount is intentionally left alone here;
          // the count display reads plan.tasks.length downstream.
          if (Array.isArray(plan.tasks)) {
            const idx = this.findTaskIndexById(plan.tasks, task.id)
            if (idx >= 0) plan.tasks.splice(idx, 1)
          }
          this.$message.success('任务已删除')
        } catch (err) {
          const detail = err?.response?.data?.detail || err?.message
          this.$message.error(detail || '删除失败,请重试')
        }
        return
      }
      // T39: a local-draft task (taskid '0' or non-numeric) has no remote row
      // to delete and the plan-tab draft path is gone. Fail loud instead of
      // silently staging a delete.
      this.$message.warning('该任务尚未上传到远端，请直接在抽屉里取消新建或刷新页面')
    },
    newPlanTask() {
      const today = new Date().toISOString().slice(0, 10)
      return {
        id: this.createDraftTaskId(),
        taskid: '0',
        customName: '',
        audio: this.audioOptions[0]?.value || '',
        time: '08:00:00',
        duration: '05',
        loop: 1,
        durationMode: 'loop',
        weekdays: ['周一', '周二', '周三', '周四', '周五'],
        dateRange: [today, today],
        volume: 50,
        prepower: 15,
        level: 0,
        location: this.defaultLocation(),
        terminalids: [],
        terminalnames: [],
        liveterminalid: '',
        liveterminalname: '',
        powerOn: true,
        taskLevel: '正常',
        sendMode: '单播',
        playMode: '串行',
        ledSetting: '',
        is_once_ephemeral: false,
        once_action: '',
        once_date: '',
        once_task_id: '',
        // T42 inline commit-button flow (replaces T39 Step 2 D fail-loud):
        // inline cell edit on a draft task (taskid='0') flips _draftDirty=true
        // and records the field change in _draftPatch. The user then clicks
        // the row's blue "完成" button which calls commitInlineTaskFinish to
        // push the whole-plan PUT (draft → remote) or merged single-task PUT
        // (already-converted). The gray "取消" button calls
        // cancelInlineTaskDraft which either removes the row (draft) or
        // restores _originalSnapshot (already-converted). These three fields
        // are intentionally NOT in buildScheduleTaskFromPlan's whitelist, so
        // they are stripped by the normal serialize path before any PUT.
        _draftDirty: false,
        _draftPatch: {},
        _originalSnapshot: null
      }
    },
    buildFixedPlanTasks() {
      const templateTasks = Array.isArray(DEFAULT_SCHEDULE_TEMPLATE.tasks)
        ? DEFAULT_SCHEDULE_TEMPLATE.tasks
        : []
      const defaultTask = this.newPlanTask()
      const defaultTerminalFields = this.resolvePlanTaskTerminalFields(defaultTask)
      const defaultLocation = this.normalizeLocationPaths(defaultTerminalFields.location)
      const defaultTerminalIds = this.uniqueStringList(defaultTerminalFields.terminalids)
      const defaultTerminalNames = this.uniqueStringList(defaultTerminalFields.terminalnames)
      const defaultLiveTerminalId = defaultTerminalFields.liveterminalid || ''
      const defaultLiveTerminalName = defaultTerminalFields.liveterminalname || ''
      const tasks = templateTasks.map((task, idx) => {
        const source = task && typeof task === 'object' ? task : {}
        const sourceLocation = Array.isArray(source.location) && source.location.length
          ? source.location
          : defaultLocation.map((entry) => (Array.isArray(entry) ? [...entry] : entry))
        const sourceTerminalIds = Array.isArray(source.terminalids)
          ? source.terminalids
          : Array.isArray(source.terminal_ids)
            ? source.terminal_ids
            : Array.isArray(source.liveterminalids)
              ? source.liveterminalids
              : defaultTerminalIds
        const sourceTerminalNames = Array.isArray(source.terminalnames)
          ? source.terminalnames
          : Array.isArray(source.terminal_names)
            ? source.terminal_names
            : Array.isArray(source.liveterminalnames)
              ? source.liveterminalnames
              : defaultTerminalNames
        const sourceLiveTerminalId = source.liveterminalid ?? source.terminalid ?? source.terminal_id
        const sourceLiveTerminalName = source.liveterminalname || source.terminalname || source.terminal_name || ''
        return this.buildPlanTaskFromSchedule({
          ...source,
          location: sourceLocation,
          terminalids: sourceTerminalIds,
          terminalnames: sourceTerminalNames,
          liveterminalid: sourceLiveTerminalId || defaultLiveTerminalId,
          liveterminalname: sourceLiveTerminalName || defaultLiveTerminalName
        }, idx)
      })
      return tasks.length ? tasks : [this.newPlanTask()]
    },
    pickClassicAudio() {
      const classic = this.audioOptions.find((item) => {
        const label = item?.label ? String(item.label) : ''
        const value = item?.value ? String(item.value) : ''
        return label.includes('经典') || value.includes('经典')
      })
      if (classic && classic.value) return classic.value
      return this.audioOptions[0]?.value || ''
    },
    formatTimeFromSeconds(totalSeconds) {
      const daySeconds = 24 * 3600
      const safeSeconds = ((totalSeconds % daySeconds) + daySeconds) % daySeconds
      const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, '0')
      const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, '0')
      const seconds = String(Math.floor(safeSeconds % 60)).padStart(2, '0')
      return `${hours}:${minutes}:${seconds}`
    },
    // T36 Phase 2 M1: clicking "添加" now fires the full remote create saga
    // immediately. The new row only enters modules.broadcasts AFTER the
    // remote returns a real numeric taskid, killing the taskid:0 empty-shell
    // window that was the root of the no-draft create bugs (KNOWN_PITFALLS
    // #18 / T34 closure). Defaults: audio = first option, location = default
    // — if either is missing the backend returns 400 and the row never lands.
    // Frontend pre-validation could disable the button when audioOptions is
    // empty, but the backend 400 is the authoritative gate; matching the
    // existing "保存上传" semantics keeps the surface minimal.
    async addBroadcastRow() {
      if (this.addingBroadcast) return
      this.addingBroadcast = true
      try {
        // T36 Phase 2 batch-A add patch: default to a timestamp-suffixed
        // name (新广播任务-YYYYMMDD-HHmm) so back-to-back "添加" clicks do
        // not collide on the remote's unique-taskname check (:183 returns
        // state=15 when the name is already taken — the previous default
        // "新广播任务" was a guaranteed collision after the first add).
        // Minute granularity is enough to differentiate user clicks; the
        // user can rename inline before the row leaves the table.
        const draft = this.newBroadcastRow(this.buildUniqueBroadcastName())
        const today = new Date().toISOString().slice(0, 10)
        const payload = this.buildAllTaskRow(draft, 2, today)
        if (!payload) {
          this.$message.error('添加失败：行数据无效')
          return
        }
        let resp
        try {
          resp = await addBroadcastImmediate(payload)
        } catch (err) {
          const status = err?.response?.status
          const detail = err?.response?.data?.detail || err?.message || '远端返回失败'
          // 409 = remote rejected because the taskname is already taken
          // (see api_public.add_broadcast — failure_code
          // "taskinfo_remote_rejected" with state=15). Surface as a
          // warning (not error) and do NOT insert the row — the user
          // needs to rename before retrying.
          if (status === 409) {
            this.$message.warning(detail || '名称已存在，请改名后重试')
          } else {
            this.$message.error(`添加失败：${detail}`)
          }
          return
        }
        const newTaskId = String(resp?.task_id || '').trim()
        if (!newTaskId) {
          this.$message.error('添加失败：远端未返回任务编号')
          return
        }
        // Build the final row with the real taskid before insertion so the
        // deep watcher only sees one transition (absent → present). Avoids
        // the require-atomic-updates lint trap of post-await field writes
        // on a shared object.
        const persistedRow = { ...draft, taskid: newTaskId, id: newTaskId }
        // Suspend the draft watcher so the optimistic unshift below does NOT
        // re-snapshot the (now-real) row back into the draft layer. The deep
        // watcher would otherwise mark broadcasts dirty for an already-saved
        // row. Mirror the pattern applyRemoteStatus uses for status writes.
        //
        // T36 critic r1 f2 + G4 fix Bug 2: patch lastSyncedBroadcasts /
        // lastSyncedBroadcastBaseSnapshot (and draftState.broadcastBaseSnapshot
        // when it is the active baseline) so the very next deep watcher fire
        // sees the new row as "already synced". Without this mirror,
        // calculateBroadcastDraftMeta diffs modules.broadcasts (contains new
        // row) against a base snapshot that does NOT contain it, the row's id
        // lands in broadcastDirtyIds, and the badge falsely claims "N 脏行"
        // even though the remote already accepted the create (state=183
        // returned 200). G4 upgrade: 3-shadow patch extracted into shared
        // helper patchBroadcastSyncedSnapshotForRow so volume + starttime
        // edit handlers reuse the same path; this caller uses mode='add' so
        // the new row unshifts onto the shadows (no prior match expected).
        const applyPersistedRow = () => {
          this.modules.broadcasts.unshift(persistedRow)
          this.patchBroadcastSyncedSnapshotForRow(persistedRow, 'add')
        }
        await this.applyBroadcastImmediateThenClear(applyPersistedRow, newTaskId)
        // T51 ①: replace the locally-built shape-A row with the server canonical
        // form so it cannot fork from the base and self-perpetuate a draft.
        await this.backfillBroadcastsFromRemote()
        this.$message.success('已添加')
      } finally {
        this.addingBroadcast = false
      }
    },
    // T36 Phase 2 batch A.1: row "删除" link fires DELETE /task/taskinfo
    // immediately and splices the row out only after the remote confirms.
    // Rows that have no real numeric taskid (pre-Phase-2 drafts) still go
    // through the local-only draft splice; production rows from this point
    // forward all have a real taskid by addBroadcastRow's contract.
    async removeBroadcastRow(row) {
      const ok = await this.confirmDelete('确定删除该广播任务吗？')
      if (!ok) return
      const remoteTaskId = String(row?.taskid || row?.id || '').trim()
      // Draft row hydrated from pre-Phase-2 snapshot: no real taskid yet,
      // remote nothing to delete. Local splice + draft persistence
      // matches the pre-immediate path.
      if (!remoteTaskId || !/^\d+$/.test(remoteTaskId)) {
        this.modules.broadcasts = this.modules.broadcasts.filter((item) => item !== row)
        this.persistBroadcastDraftLocally('已删除并暂存到本地')
        return
      }
      try {
        await deleteBroadcastImmediate(remoteTaskId)
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || '远端返回失败'
        this.$message.error(`删除失败：${detail}`)
        return
      }
      // Suspend the draft watcher so the splice does NOT re-snapshot the
      // remaining rows into the draft layer (same trick addBroadcastRow
      // uses for the optimistic unshift).
      const applyDelete = () => {
        this.modules.broadcasts = this.modules.broadcasts.filter((item) => item !== row)
      }
      if (typeof this.withBroadcastDraftSyncSuspended === 'function') {
        this.withBroadcastDraftSyncSuspended(applyDelete)
      } else {
        applyDelete()
      }
      this.$message.success('已删除')
    },
    newBroadcastRow(name = '新广播任务') {
      const fallback = (this.audioOptions || []).find((item) => Number(item && item.folderid) === 2) ||
        (this.audioOptions || [])[0] ||
        null
      return {
        id: this.createBroadcastDraftId(),
        name,
        status: '待执行',
        volume: 50,
        prepower: 15,
        level: 10,
        emergency: false,
        audio: fallback ? fallback.value : '',
        duration: '00:05:00',
        loop: 1,
        durationMode: 'loop',
        location: this.defaultLocation(),
        terminalids: [],
        terminalnames: [],
        liveterminalid: '',
        liveterminalname: ''
      }
    },
    // T36 Phase 2 tail (fix): the original minute-granularity stamp
    // (新广播任务-YYYYMMDD-HHmm) still collided when a user double-clicked
    // "添加" inside the same minute — remote returns state=15 → 409 and
    // the second row is dropped. Bump to second granularity and append a
    // dedup suffix (-2, -3, ...) when a local row already uses the
    // exact same stamp. We deliberately scan only the local broadcasts
    // list (the remote retains its own 409 protection as a backstop);
    // a full /task/sechinfoall round-trip per click would defeat the
    // immediate UX. Pure JS Date — no workflow sandbox issues here,
    // this runs in the browser.
    buildUniqueBroadcastName() {
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const stamp =
        now.getFullYear().toString() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        '-' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
      const base = `新广播任务-${stamp}`
      const existing = new Set(
        (Array.isArray(this.modules?.broadcasts) ? this.modules.broadcasts : [])
          .map((row) => String(row?.name || '').trim())
          .filter((name) => name)
      )
      if (!existing.has(base)) return base
      // Same-second double-click (or stale row with the same stamp):
      // walk suffixes until one is free. Bounded loop — practical
      // upper bound is the number of rows already in the table.
      let suffix = 2
      while (existing.has(`${base}-${suffix}`)) {
        suffix += 1
      }
      return `${base}-${suffix}`
    },
    isRuntimeStatus(status) {
      return ['执行中', '执行', '暂停', '停止', '恢复'].includes(status)
    },
    normalizeRuntimeStatus(status) {
      if (status === '恢复' || status === '执行' || status === '执行中') return '执行中'
      if (status === '暂停') return '暂停'
      if (status === '停止') return '停止'
      return status
    },
    async applyRemoteStatus(kind, rows, status) {
      const taskIds = rows
        .map((row) => String(row?.taskid || row?.id || ''))
        .filter((value) => value)
      if (!taskIds.length) {
        this.$message.warning('选中的任务还未同步到远端')
        return
      }
      try {
        const resp = await setTaskStatus({ kind, status, task_ids: taskIds })
        const updatedSet = new Set(resp?.updated_ids || [])
        const display = this.normalizeRuntimeStatus(status)
        const applyStatus = () => {
          rows.forEach((row) => {
            const rowId = String(row?.taskid || row?.id || '')
            if (!rowId) return
            if (updatedSet.size && !updatedSet.has(rowId)) return
            row.status = display
          })
          if (kind === 'broadcast' && Array.isArray(this.lastSyncedBroadcasts) && this.lastSyncedBroadcasts.length) {
            this.lastSyncedBroadcasts = this.lastSyncedBroadcasts.map((row) => {
              const rowId = String(row?.taskid || row?.id || '')
              if (!rowId) return row
              if (updatedSet.size && !updatedSet.has(rowId)) return row
              return {
                ...row,
                status: display
              }
            })
            if (Array.isArray(this.lastSyncedBroadcastBaseSnapshot) && this.lastSyncedBroadcastBaseSnapshot.length) {
              this.lastSyncedBroadcastBaseSnapshot = this.lastSyncedBroadcastBaseSnapshot.map((row) => {
                const rowId = String(row?.taskid || row?.id || '')
                if (!rowId) return row
                if (updatedSet.size && !updatedSet.has(rowId)) return row
                return {
                  ...row,
                  status: display
                }
              })
            }
          }
        }
        if (kind === 'broadcast') {
          this.withBroadcastDraftSyncSuspended(applyStatus)
        } else {
          applyStatus()
        }
        if (!resp?.updated) {
          this.$message.warning('未找到可执行的远端任务')
          return
        }
        this.$message.success('状态已更新')
      } catch (err) {
        const detail = err?.response?.data?.detail
        this.$message.error(detail || '状态更新失败')
      }
    },
    async setBroadcastStatus(status) {
      const rows = this.getSelected('broadcast')
      if (!rows.length) return this.$message.warning('请选择广播任务')
      // 启用 / 停用 and the runtime labels both map to remote /data/task_state,
      // so push them through directly instead of staging in the local draft.
      if (this.isRuntimeStatus(status) || status === '启用' || status === '停用') {
        await this.applyRemoteStatus('broadcast', rows, status)
        return
      }
      rows.forEach((row) => {
        row.status = status
      })
      this.persistBroadcastDraftLocally('广播状态已暂存到本地')
    },
    addLiveRow() {
      this.modules.livecasts.push(this.newLiveRow())
      this.persist('已添加采播任务')
    },
    async removeLiveRow(row) {
      const ok = await this.confirmDelete('确定删除该采播任务吗？')
      if (!ok) return
      this.modules.livecasts = this.modules.livecasts.filter((item) => item !== row)
      this.persist('已删除采播任务')
    },
    newLiveRow(name = '新采播任务') {
      return {
        id: Date.now(),
        name,
        status: '待执行',
        volume: 45,
        audio: '',
        time: '14:00',
        duration: '10',
        loop: 1,
        durationMode: 'loop',
        location: this.defaultLocation(),
        terminalids: [],
        terminalnames: [],
        liveterminalid: '',
        liveterminalname: ''
      }
    },
    async setLiveStatus(status) {
      const rows = this.getSelected('live')
      if (!rows.length) return this.$message.warning('请选择采播任务')
      if (this.isRuntimeStatus(status) || status === '启用' || status === '停用') {
        await this.applyRemoteStatus('livecast', rows, status)
        return
      }
      rows.forEach((row) => {
        row.status = status
      })
      this.persist('采播状态已更新')
    }
  }
}
</script>
<style scoped>
.scheduler-page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.page-header h2 {
  margin: 0;
}
.page-header p {
  margin: 4px 0 0;
  color: #606266;
  font-size: 13px;
}
.header-actions > * + * {
  margin-left: 8px;
}
.header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.save-cta {
  font-weight: 600;
  box-shadow: 0 6px 14px rgba(64, 158, 255, 0.25);
}
.save-feedback {
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #dbe7ff;
  border-radius: 16px;
  background: linear-gradient(135deg, #f7faff 0%, #ffffff 100%);
  box-shadow: 0 10px 24px rgba(31, 45, 61, 0.08);
}
.save-feedback.is-success {
  border-color: #cce8d1;
  background: linear-gradient(135deg, #f4fff7 0%, #ffffff 100%);
}
.save-feedback.is-error {
  border-color: #f6c8c8;
  background: linear-gradient(135deg, #fff6f6 0%, #ffffff 100%);
}
.save-feedback-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.save-feedback-copy {
  min-width: 0;
}
.save-feedback-title {
  font-size: 14px;
  font-weight: 700;
  color: #1f2d3d;
}
.save-feedback-step {
  margin-top: 4px;
  font-size: 13px;
  color: #4f6b95;
}
.save-feedback.is-success .save-feedback-step {
  color: #4d7c58;
}
.save-feedback.is-error .save-feedback-step {
  color: #b04b4b;
}
.save-feedback-meta {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.12);
  color: #3c6df0;
  font-size: 12px;
  font-weight: 600;
}
.save-feedback.is-success .save-feedback-meta {
  background: rgba(103, 194, 58, 0.14);
  color: #4a8f2a;
}
.save-feedback.is-error .save-feedback-meta {
  background: rgba(245, 108, 108, 0.14);
  color: #cb4d4d;
}
.save-feedback-message {
  margin: 10px 0 12px;
  font-size: 13px;
  color: #606266;
}
.primary-plan-action {
  font-weight: 600;
  box-shadow: 0 6px 14px rgba(64, 158, 255, 0.25);
}
.toolbar,
.task-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.table-shell {
  position: relative;
}
.table-shell.is-loading {
  min-height: 320px;
}
.mobile-card-list {
  display: grid;
  gap: 12px;
}
.mobile-card {
  background: #fff;
  border: 1px solid #e6ebf5;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 10px 24px rgba(31, 45, 61, 0.07);
}
.mobile-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.mobile-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}
.mobile-card-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #7a869a;
  line-height: 1.5;
}
.mobile-card-tag-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.mobile-card-meta {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.mobile-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.mobile-meta-item.is-full {
  grid-column: 1 / -1;
}
.mobile-meta-label {
  font-size: 12px;
  color: #909399;
}
.mobile-meta-value {
  color: #1f2d3d;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.mobile-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.mobile-plan-detail {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mobile-plan-timeline {
  margin-bottom: 0;
}
.table-skeleton {
  position: absolute;
  top: 41px;
  right: 1px;
  bottom: 1px;
  left: 1px;
  z-index: 3;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.96);
  display: flex;
  flex-direction: column;
  gap: 14px;
  pointer-events: none;
}
.table-skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.table-skeleton-bar {
  display: inline-flex;
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, #eef2f7 0%, #f7f9fc 48%, #eef2f7 100%);
  background-size: 220% 100%;
  animation: table-skeleton-shimmer 1.25s ease-in-out infinite;
}
@keyframes table-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
.task-count-skeleton-bar {
  display: inline-block;
  width: 36px;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, #eef2f7 0%, #f7f9fc 48%, #eef2f7 100%);
  background-size: 220% 100%;
  animation: table-skeleton-shimmer 1.25s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .task-count-skeleton-bar {
    animation: none;
  }
}
.task-toolbar-spread {
  justify-content: space-between;
}
.task-toolbar-left {
  display: flex;
  gap: 8px;
}
.plan-timeline {
  margin: 10px 0 12px;
  padding: 10px 12px;
  border: 1px solid #e6ebf5;
  border-radius: 8px;
  background: #fbfcff;
}
.plan-timeline-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.plan-timeline-title {
  font-size: 12px;
  color: #4e5969;
  font-weight: 600;
}
.plan-timeline-count {
  font-size: 12px;
  color: #909399;
}
.plan-timeline-track {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 4px;
  height: 26px;
}
.plan-timeline-block {
  border-radius: 4px;
  min-height: 26px;
  transition: transform 0.2s ease, filter 0.2s ease;
}
.plan-timeline-block:hover {
  transform: translateY(-2px);
  filter: brightness(1.02);
}
.plan-timeline-scale {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #a0a8b5;
}

::v-deep .conflict-cell .cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.conflict-icon {
  color: #f7ba2a;
  font-size: 16px;
}
.audio-cell,
.time-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.time-cell .el-date-editor--time,
.time-cell .el-date-editor--time .el-input__inner {
  width: 110px;
  min-width: 110px;
}
.time-cell .el-select,
.time-cell .el-input-number,
.time-cell .el-input {
  flex: 0 0 auto;
}
.duration-mode {
  flex-shrink: 0;
  width: 90px;
}
.time-cell .el-date-editor {
  width: 110px;
}
.date-range-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.volume-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── 文件广播行内编辑 cell 视觉(T57 stylist 收尾)──────────────
   收尾 builder 的 broadcast 全字段行内即时编辑。三套态:
   - 可编辑暗示:hover 微提亮 + pointer,告诉管理员这格能点改(区别于旧只读)
   - is-saving:终端那格 ~1.1s 真库往返,半透明禁用感 + el-icon-loading 角标
   - inline-cell-error:提交失败(尤其 422),细红边 + 浅红底,政企克制不刺眼
   颜色对齐已有 .save-feedback.is-error(#f6c8c8 / #fff6f6)与 #f56c6c danger。 */
.inline-cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 4px;
  padding: 1px 2px;
  margin: -1px -2px;
  transition: background-color 0.18s ease, box-shadow 0.18s ease;
}
/* 可编辑暗示:hover 时浅底 + 极淡内描边,提示"可点改"。克制,不整行变色。 */
.inline-cell:hover {
  background-color: #f4f7fb;
  box-shadow: inset 0 0 0 1px #e6ebf5;
  cursor: pointer;
}
.inline-cell:hover .el-input__inner,
.inline-cell:hover .el-input-number,
.inline-cell-select:hover .el-input__inner {
  border-color: #c0d0e6;
}

/* 保存中态:半透明禁用感 + 不再响应 hover 提亮,角落转圈(el-icon-loading 自带旋转)。 */
.inline-cell.is-saving,
.inline-cell-select.is-saving {
  cursor: progress;
}
.inline-cell.is-saving .el-input,
.inline-cell.is-saving .el-select,
.inline-cell.is-saving .el-input-number,
.inline-cell.is-saving .el-date-editor,
.inline-cell.is-saving .el-cascader,
.inline-cell-select.is-saving {
  opacity: 0.62;
  pointer-events: none;
  transition: opacity 0.18s ease;
}
.inline-cell.is-saving:hover {
  background-color: transparent;
  box-shadow: none;
}
.inline-cell-spinner {
  flex: 0 0 auto;
  color: #409eff;
  font-size: 13px;
}

/* 错误态:细红边 + 浅红底,一眼看出"这格没存上、要重弄"。
   政企稳重:不闪烁、不大红块,只在 cell 包裹层加描边 + 输入控件红边。 */
.inline-cell.inline-cell-error,
.inline-cell-select.inline-cell-error {
  background-color: #fff6f6;
  box-shadow: inset 0 0 0 1px #f6c8c8;
}
.inline-cell.inline-cell-error:hover {
  background-color: #fff1f1;
  box-shadow: inset 0 0 0 1px #f3b6b6;
}
.inline-cell.inline-cell-error .el-input__inner,
.inline-cell.inline-cell-error .el-textarea__inner,
.inline-cell-select.inline-cell-error .el-input__inner {
  border-color: #f56c6c;
}
.inline-cell.inline-cell-error .el-input__inner:focus,
.inline-cell-select.inline-cell-error .el-input__inner:focus {
  border-color: #f56c6c;
  box-shadow: 0 0 0 2px rgba(245, 108, 108, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .inline-cell {
    transition: none;
  }
  .inline-cell.is-saving .el-input,
  .inline-cell.is-saving .el-select,
  .inline-cell.is-saving .el-input-number,
  .inline-cell.is-saving .el-date-editor,
  .inline-cell.is-saving .el-cascader,
  .inline-cell-select.is-saving {
    transition: none;
  }
  /* el-icon-loading 的旋转由 Element 全局定义,reduced-motion 下也尊重静止 */
  .inline-cell-spinner {
    animation: none;
  }
}

/* ── 文件广播行内"周期"星期格子(Phase2 stylist;品位打磨版)──────────────
   收尾 builder 的可点星期格子(:weekday-grid / .weekday-cell / .active 绑定为 builder script)。
   PO 诉求:没选=暗、选了=蓝;第一版"太生硬",本版做品位打磨(政企稳重,不花哨):
   - 未选:不是死灰块,而是带细描边的素色 chip(浅灰底 + hairline 边),给"格子"质感不刺眼
   - 已选:有品位的品牌蓝——极轻竖向渐变 + 蓝调柔光阴影给层次,不是生硬纯色块,白字
   - 比例:格子略放大(24×24)+ gap 放宽(6px),给呼吸感;圆角 5px 更柔
   - 过渡:稍长(0.2s)+ ease-out 曲线,暗↔蓝/hover 平滑不硬切;hover 极轻上浮
   - focus-visible:键盘可达 focus ring(a11y)
   颜色对齐本文件 Element 调色板(primary #409eff 族);具体深浅留 G3 PO 指认微调。 */
.weekday-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.weekday-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  background-color: #f5f7fa;
  border: 1px solid #e4e7ed;
  color: #909399;
  font-size: 12px;
  line-height: 1;
  user-select: none;
  cursor: pointer;
  transition: background-color 0.2s ease-out, border-color 0.2s ease-out,
    color 0.2s ease-out, box-shadow 0.2s ease-out, transform 0.2s ease-out;
}
.weekday-cell:hover {
  background-color: #eef1f6;
  border-color: #c6d4e8;
  color: #606266;
  box-shadow: 0 1px 3px rgba(31, 45, 61, 0.08);
  transform: translateY(-1px);
}
.weekday-cell:focus-visible {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.25);
}
/* 已选:有品位的品牌蓝。极轻竖向渐变 + 蓝调柔光阴影,给层次而非生硬纯色块。PO 原话"选了就是蓝"。 */
.weekday-cell.active {
  background-image: linear-gradient(180deg, #4faaff 0%, #3d92e8 100%);
  background-color: #3d92e8;
  border-color: #3d8ee0;
  color: #fff;
  box-shadow: 0 1px 4px rgba(64, 158, 255, 0.32);
}
.weekday-cell.active:hover {
  background-image: linear-gradient(180deg, #5fb2ff 0%, #4699ee 100%);
  border-color: #3d8ee0;
  color: #fff;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.38);
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .weekday-cell,
  .weekday-cell:hover,
  .weekday-cell.active:hover {
    transition: none;
    transform: none;
  }
}

/* ── 文件广播行内编辑"完成/取消"操作组(Phase2 stylist;品位打磨版)────────
   进草稿态(isBroadcastRowDirty)时操作列出现"完成"(primary)+"取消"(text)。
   第一版偏生硬,本版做品位打磨(政企稳重):间距更有呼吸感、"完成"主按钮极轻
   渐变 + 柔光阴影给质感、圆角更柔、"取消"次级低调不抢眼。
   全部 override 限定在 .broadcast-row-actions 作用域内,不动按钮 type / @click / 全局 el-button。 */
.broadcast-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
/* "完成"主按钮:有品位的品牌蓝(极轻渐变 + 柔光阴影),不是生硬纯色块。 */
.broadcast-row-actions .el-button--primary {
  border-radius: 5px;
  background-image: linear-gradient(180deg, #4faaff 0%, #3d92e8 100%);
  background-color: #3d92e8;
  border-color: #3d8ee0;
  box-shadow: 0 1px 4px rgba(64, 158, 255, 0.3);
  transition: background-image 0.2s ease-out, box-shadow 0.2s ease-out,
    transform 0.2s ease-out;
}
.broadcast-row-actions .el-button--primary:hover,
.broadcast-row-actions .el-button--primary:focus {
  background-image: linear-gradient(180deg, #5fb2ff 0%, #4699ee 100%);
  border-color: #3d8ee0;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.36);
  transform: translateY(-1px);
}
/* "取消"次级:低调灰字,hover 才微微显色,不与主按钮抢视觉。 */
.broadcast-row-actions .el-button--text {
  color: #909399;
  transition: color 0.2s ease-out;
}
.broadcast-row-actions .el-button--text:hover,
.broadcast-row-actions .el-button--text:focus {
  color: #606266;
}

@media (prefers-reduced-motion: reduce) {
  .broadcast-row-actions .el-button--primary,
  .broadcast-row-actions .el-button--primary:hover,
  .broadcast-row-actions .el-button--primary:focus {
    transition: none;
    transform: none;
  }
}

.week-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.week-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.week-toggle {
  padding: 0;
  color: #409eff;
}
.unit-label {
  color: #909399;
  font-size: 12px;
}
.advanced-box {
  background: #f8f8f8;
  padding: 10px;
  border-radius: 4px;
}
.note {
  color: #909399;
  margin-left: 8px;
}
.plan-task-wrap {
  margin-top: 8px;
}
.plan-task-empty {
  padding: 12px;
  color: #909399;
  font-size: 12px;
  background: #fff;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  margin-bottom: 10px;
}
.task-summary-name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-weight: 600;
  color: #1f2d3d;
}
.task-summary-time {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
}
.inline-edit-cell {
  display: flex;
  align-items: center;
  min-height: 28px;
  gap: 6px;
  cursor: pointer;
}
.inline-edit-cell:hover .inline-edit-icon {
  opacity: 1;
}
.inline-edit-value {
  color: #1f2d3d;
}
.inline-edit-icon {
  color: #7a8aa1;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.inline-task-editor {
  width: 100%;
}
.summary-sep {
  color: #c0c4cc;
}
.plan-task-cards {
  display: none;
  gap: 12px;
}
.plan-task-cards.is-mobile-visible {
  display: grid;
  grid-template-columns: 1fr;
}
.task-card {
  background: #fff;
  border: 1px solid #e6ebf5;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.06);
}
.task-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.task-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #1f2d3d;
}
.task-card-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  font-size: 12px;
  color: #6b7a90;
  margin-bottom: 10px;
}
.meta-label {
  display: inline-block;
  margin-right: 6px;
  color: #909399;
}
.meta-value {
  color: #1f2d3d;
}
.task-card-actions {
  display: flex;
  gap: 8px;
}
.drawer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.drawer-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.duration-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.duration-row .el-input,
.duration-row .el-input-number {
  width: 120px;
}
.duration-row .el-select {
  width: 120px;
}
.drawer-week-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.drawer-week-hint {
  font-size: 12px;
  color: #909399;
}
.field-alert-icon {
  margin-left: 4px;
  color: #f56c6c;
  font-size: 12px;
}
.week-group-wrap {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 8px;
}
.week-group-wrap.is-error {
  border-color: #f56c6c;
  background: #fff7f7;
}
::v-deep .task-editor-drawer .el-drawer__body {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
::v-deep .once-changes-drawer .el-drawer__body {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.task-drawer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f7f9fc;
}
.task-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid #e6ebf5;
}
.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
}
.drawer-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.once-drawer-body {
  background: #f6f8fc;
}
.once-drawer-empty {
  padding: 20px;
  border: 1px dashed #d8e0ef;
  border-radius: 12px;
  background: #fff;
  color: #909399;
}
.once-drawer-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.once-group-card {
  padding: 14px;
  border: 1px solid #e6ebf5;
  border-radius: 14px;
  background: #fff;
}
.once-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.once-group-date {
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}
.once-group-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #7a869a;
}
.once-group-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.once-group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.once-item-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #f8fbff;
}
.once-item-main {
  min-width: 0;
  flex: 1;
}
.once-item-title-row,
.once-item-sub,
.once-item-terminal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.once-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}
.once-item-time {
  font-size: 13px;
  color: #2d7cf6;
  white-space: nowrap;
}
.once-item-sub,
.once-item-terminal {
  margin-top: 6px;
  font-size: 12px;
  color: #7a869a;
}
.once-item-summary {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #44546a;
}
.once-item-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.once-drawer-banner {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff7e8;
  color: #8c6d1f;
  font-size: 12px;
  line-height: 1.6;
}
.task-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
}
.task-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #e6ebf5;
}
@media (max-width: 768px) {
  .scheduler-page {
    padding: 14px;
    padding-bottom: calc(90px + var(--safe-bottom));
  }

  .page-header {
    position: sticky;
    top: 0;
    z-index: 5;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding-top: 6px;
    background: #f5f7fb;
  }

  .header-actions {
    justify-content: stretch;
  }

  .header-actions > * + * {
    margin-left: 0;
  }

  .save-feedback {
    padding: 12px 14px;
    border-radius: 14px;
  }

  .save-feedback-head {
    flex-direction: column;
    align-items: stretch;
  }

  .save-feedback-meta {
    align-self: flex-start;
  }

  .toolbar,
  .task-toolbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 6px;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-card-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mobile-card-actions .el-button {
    margin-left: 0;
  }

  .mobile-card-meta {
    grid-template-columns: 1fr 1fr;
  }

  .task-card-header,
  .task-card-actions,
  .drawer-week-header,
  .task-drawer-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .task-card-actions {
    gap: 6px;
  }

  .drawer-grid {
    grid-template-columns: 1fr;
  }

  .time-cell,
  .duration-row {
    flex-direction: column;
    align-items: stretch;
  }

  .time-cell .el-date-editor,
  .time-cell .el-date-editor--time,
  .time-cell .el-date-editor--time .el-input__inner,
  .time-cell .el-select,
  .time-cell .el-input-number,
  .time-cell .el-input,
  .duration-row .el-input,
  .duration-row .el-input-number,
  .duration-row .el-select {
    width: 100%;
    min-width: 0;
  }

  .task-drawer-body {
    padding: 12px 14px;
  }

  .task-drawer-footer {
    padding-bottom: calc(12px + var(--safe-bottom));
  }

  ::v-deep .task-editor-drawer-mobile .el-drawer__body {
    padding-top: var(--safe-top);
  }

  ::v-deep .once-changes-drawer-mobile .el-drawer__body {
    padding-top: var(--safe-top);
  }

  .once-item-card,
  .once-item-title-row,
  .once-item-sub,
  .once-item-terminal,
  .once-group-actions,
  .once-item-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
@media (max-width: 1200px) {
  .plan-task-table {
    display: none;
  }
  .plan-task-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}
::v-deep .el-table__expand-icon .el-icon {
  color: #ffffff;
  font-weight: 700;
  -webkit-text-stroke: 1px #2d7cf6;
  font-size: 16px;
}
::v-deep .el-table__fixed,
::v-deep .el-table__fixed-right {
  box-shadow: none;
}
</style>

