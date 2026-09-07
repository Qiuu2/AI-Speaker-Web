<template>
  <div class="ai-assistant-root">
    <button
      v-if="isMobileLayout && !mobilePanelVisible"
      type="button"
      class="ai-mobile-trigger"
      @click="openMobilePanel"
    >
      <i class="el-icon-microphone" />
      <span>AI助手</span>
    </button>
    <button
      v-if="!isMobileLayout && collapsed"
      type="button"
      class="ai-ball"
      title="打开 AI 助手"
      @click="toggleCollapse"
    >
      <i class="el-icon-microphone" />
    </button>
    <div
      v-show="isMobileLayout ? mobilePanelVisible : !collapsed"
      class="ai-float"
      :class="{
        'is-mobile': isMobileLayout,
        'is-mobile-open': isMobileLayout && mobilePanelVisible
      }"
      :style="panelStyle"
      @mousedown.stop
    >
      <div class="ai-header" @mousedown.prevent="startDrag">
        <div class="title">
          <i class="el-icon-microphone" />
          <span>AI助手</span>
        </div>
        <div class="actions" @mousedown.stop>
          <el-tooltip content="查看成功日志" placement="top">
            <el-button
              class="header-log-btn"
              size="mini"
              icon="el-icon-document"
              @click.stop="openHistoryDrawer"
            >
              成功日志
            </el-button>
          </el-tooltip>
          <el-button v-if="!isMobileLayout" type="text" size="mini" title="收起为悬浮球" @click.stop="toggleCollapse">
            <i class="el-icon-minus" />
          </el-button>
          <el-button v-else type="text" size="mini" @click.stop="closeMobilePanel">
            <i class="el-icon-close" />
          </el-button>
        </div>
      </div>

      <div v-show="isMobileLayout || !collapsed" class="ai-body">
        <p class="desc">在任意页面输入指令，调用后端 /assistant/chat 接口解析意图并返回回复。</p>
        <div
          v-if="hasScheduleTemplateSelection"
          class="assistant-template-summary"
          @mousedown.stop
          @click.stop
        >
          <span class="assistant-template-label">当前模板</span>
          <el-popover
            v-model="schoolKindPopoverVisible"
            placement="bottom-start"
            width="260"
            trigger="click"
            popper-class="school-kind-popper"
          >
            <div class="school-kind-popover">
              <div class="school-kind-popover-title">切换模板配置</div>
              <div class="school-kind-popover-row">
                <div class="school-kind-popover-label">学校类型</div>
                <el-select
                  :value="defaultScheduleKind"
                  class="school-kind-popover-select"
                  size="mini"
                  clearable
                  filterable
                  placeholder="请先设置"
                  :loading="assistantSettingsLoading || assistantSettingsSaving"
                  @change="handleScheduleKindChange"
                >
                  <el-option
                    v-for="kind in allowedScheduleKinds"
                    :key="`body-kind-${kind}`"
                    :label="kind"
                    :value="kind"
                  />
                </el-select>
              </div>
              <div class="school-kind-popover-row">
                <div class="school-kind-popover-label">作息季节</div>
                <el-select
                  :value="defaultScheduleSeason"
                  class="school-kind-popover-select"
                  size="mini"
                  clearable
                  filterable
                  placeholder="请先设置"
                  :loading="assistantSettingsLoading || assistantSettingsSaving"
                  @change="handleScheduleSeasonChange"
                >
                  <el-option
                    v-for="season in allowedScheduleSeasons"
                    :key="`body-season-${season}`"
                    :label="season"
                    :value="season"
                  />
                </el-select>
              </div>
            </div>
            <button slot="reference" type="button" class="school-kind-chip">
              <span>{{ scheduleTemplateSelectionLabel }}</span>
              <i class="el-icon-arrow-down" />
            </button>
          </el-popover>
        </div>
        <div v-if="!hasScheduleTemplateSelection" class="assistant-settings-card">
          <div class="assistant-settings-row">
            <span class="assistant-settings-label">学校类型</span>
            <el-select
              :value="defaultScheduleKind"
              class="assistant-settings-select"
              size="mini"
              clearable
              filterable
              placeholder="请先设置"
              :loading="assistantSettingsLoading || assistantSettingsSaving"
              @change="handleScheduleKindChange"
            >
              <el-option
                v-for="kind in allowedScheduleKinds"
                :key="kind"
                :label="kind"
                :value="kind"
              />
            </el-select>
          </div>
          <div class="assistant-settings-row">
            <span class="assistant-settings-label">作息季节</span>
            <el-select
              :value="defaultScheduleSeason"
              class="assistant-settings-select"
              size="mini"
              clearable
              filterable
              placeholder="请先设置"
              :loading="assistantSettingsLoading || assistantSettingsSaving"
              @change="handleScheduleSeasonChange"
            >
              <el-option
                v-for="season in allowedScheduleSeasons"
                :key="season"
                :label="season"
                :value="season"
              />
            </el-select>
          </div>
          <div class="assistant-settings-hint">新建作息只会使用这里设置的学校类型和季节，不再从聊天内容里提取。</div>
          <div v-if="!hasScheduleTemplateSelection" class="assistant-settings-warning">
            请先同时设置学校类型和作息季节，否则“新建一个暑假作息”不会执行。
          </div>
        </div>

        <div ref="chatBox" class="chat-box">
          <div v-for="msg in conversation" :key="msg.id" :class="['chat-line', msg.role]">
            <div :class="['bubble', { 'bubble-warning': msg.role === 'ai' && !msg.pending && isWarningMessage(msg.text), 'bubble-pending': msg.pending }]">
              <div v-if="msg.pending" class="thinking-text">
                <span>{{ msg.thinkingLabel || '深度思考中' }}</span>
                <span class="thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <div v-if="msg.thinkingDetail" class="thinking-detail">{{ msg.thinkingDetail }}</div>
              </div>
              <div v-else-if="msg.role === 'ai'" :class="['text', { 'is-streaming': msg.streaming }]" v-html="aiBubbleText(msg)" />
              <div v-else class="text">{{ msg.text }}</div>
              <div
                v-if="msg.role === 'ai' && !msg.pending && getDialogStateBadge(msg.meta)"
                :class="['dialog-state-badge', { 'is-confirm': normalizeDialogStateDetail(msg.meta) === 'confirm_interrupt_switch' }]"
              >
                {{ getDialogStateBadge(msg.meta) }}
              </div>
              <div v-if="msg.role === 'ai' && !msg.pending && hasPendingChoices(msg.meta)" class="pending-panel">
                <div class="pending-title">{{ getPendingTitle(msg.meta) }}</div>
                <div v-if="getPendingHint(msg.meta)" class="pending-hint">{{ getPendingHint(msg.meta) }}</div>
                <div class="pending-choices">
                  <el-button
                    v-for="choice in getPendingChoices(msg.meta)"
                    :key="choice.key"
                    class="pending-choice"
                    size="mini"
                    type="primary"
                    plain
                    :disabled="aiLoading"
                    @click="submitPendingChoice(choice)"
                  >
                    <span class="pending-choice-main">{{ choice.label }}</span>
                    <span v-if="choice.description" class="pending-choice-sub">{{ choice.description }}</span>
                  </el-button>
                </div>
              </div>
              <div v-if="msg.role === 'ai' && !msg.pending && shouldShowUndo(msg)" class="undo-panel">
                <el-button
                  class="undo-button"
                  size="mini"
                  type="warning"
                  plain
                  :disabled="isUndoDisabled(msg)"
                  @click="submitUndo(msg)"
                >
                  {{ undoButtonLabel(msg) }}
                </el-button>
              </div>
              <div v-if="msg.role === 'ai' && !msg.pending && shouldShowDiagnostics(msg.meta)" class="diagnostic-panel">
                <details class="diagnostic-details">
                  <summary>查看远端诊断</summary>
                  <div
                    v-for="(diag, idx) in msg.meta.diagnostics"
                    :key="`${msg.id}-diag-${idx}`"
                    :class="['diagnostic-item', { failed: !diag.ok }]"
                  >
                    <div class="diagnostic-grid">
                      <div class="diagnostic-row">
                        <span class="diagnostic-label">diagnostic_id</span>
                        <span>{{ diag.diagnostic_id || '-' }}</span>
                      </div>
                      <div class="diagnostic-row">
                        <span class="diagnostic-label">phase</span>
                        <span>{{ diag.phase || '-' }}</span>
                      </div>
                      <div class="diagnostic-row">
                        <span class="diagnostic-label">path</span>
                        <span>{{ diag.path || '-' }}</span>
                      </div>
                      <div class="diagnostic-row">
                        <span class="diagnostic-label">status</span>
                        <span>{{ formatDiagnosticStatus(diag) }}</span>
                      </div>
                      <div class="diagnostic-row">
                        <span class="diagnostic-label">elapsed_ms</span>
                        <span>{{ formatDiagnosticElapsed(diag) }}</span>
                      </div>
                    </div>
                    <div v-if="!diag.ok" class="diagnostic-failure">
                      <div class="diagnostic-block">
                        <div class="diagnostic-label">request_payload</div>
                        <pre>{{ formatDiagnosticValue(diag.request_payload) }}</pre>
                      </div>
                      <div class="diagnostic-block">
                        <div class="diagnostic-label">response_body</div>
                        <pre>{{ formatDiagnosticValue(diag.response_body) }}</pre>
                      </div>
                      <div class="diagnostic-block">
                        <div class="diagnostic-label">error_detail</div>
                        <pre>{{ formatDiagnosticValue(diag.error_detail) }}</pre>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
          <div v-if="!conversation.length" class="placeholder">
            试着说：“明早8点在教学楼一层播放校园铃声，音量40，循环2次”
          </div>
        </div>

        <div class="command-input-wrap">
          <div
            v-if="suggestionsOpen && currentSuggestions.length"
            class="command-suggestions"
            @mousedown.prevent
          >
            <span class="suggestion-row-label">建议</span>
            <button
              v-for="(item, idx) in currentSuggestions.slice(0, 3)"
              :key="`${item.source}-${idx}-${item.text}`"
              type="button"
              :class="['suggestion-chip', `source-${item.source}`]"
              :title="item.text"
              @click="applySuggestion(item)"
            >
              <span class="suggestion-icon">{{ item.source === 'history' ? '↻' : '✨' }}</span>
              <span class="suggestion-chip-text">{{ item.text }}</span>
            </button>
            <span class="suggestion-row-tab">Tab 采用首条</span>
          </div>
          <el-input
            ref="commandInput"
            v-model="command"
            type="textarea"
            :rows="3"
            placeholder="请输入指令文本"
            @keydown.native.enter.prevent="handleEnter"
            @keydown.native.tab.prevent="acceptTopSuggestion"
            @keydown.native.esc="suggestionsOpen = false"
            @focus="onCommandFocus"
            @blur="onCommandBlur"
          />
        </div>
        <div class="ai-actions">
          <el-tooltip content="指令大全" placement="top">
            <el-button size="mini" icon="el-icon-reading" @click="openManualDrawer">
              指令大全
            </el-button>
          </el-tooltip>
          <el-button
            type="primary"
            icon="el-icon-microphone"
            size="mini"
            :loading="aiLoading"
            :disabled="aiLoading"
            @click="sendToAssistant"
          >
            发送
          </el-button>
          <el-button size="mini" @click="command = ''">清空</el-button>
        </div>
      </div>
    </div>

    <el-drawer
      :visible.sync="manualDrawer"
      :direction="isMobileLayout ? 'btt' : 'rtl'"
      :size="isMobileLayout ? '100%' : '380px'"
      :with-header="false"
      :append-to-body="true"
      :custom-class="isMobileLayout ? 'manual-drawer manual-drawer-mobile' : 'manual-drawer'"
      @open="handleManualOpen"
      @close="handleManualClose"
    >
      <div class="manual-shell">
        <div class="manual-header">
          <div class="manual-title">
            <span class="manual-icon">📖</span>
            <div>
              <div class="manual-title-text">指令大全</div>
              <div class="manual-title-sub">点击例句即可填入输入框，随时可改。</div>
            </div>
          </div>
          <el-button type="text" icon="el-icon-close" @click="manualDrawer = false" />
        </div>

        <div class="manual-search">
          <el-input
            v-model="manualSearch"
            size="small"
            clearable
            placeholder="搜索功能，如：音量、新建作息..."
          >
            <i slot="prefix" class="el-icon-search" />
          </el-input>
        </div>

        <div class="manual-body">
          <el-tabs v-model="manualActiveTab" :tab-position="isMobileLayout ? 'top' : 'left'" class="manual-tabs">
            <el-tab-pane
              v-for="module in filteredModules"
              :key="module.id"
              :name="module.id"
              :label="module.tabLabel"
            >
              <div class="module-intro">
                <div class="module-title">{{ module.title }}</div>
                <div class="module-desc">{{ module.desc }}</div>
              </div>

              <el-collapse
                accordion
                class="manual-collapse"
                :value="getManualOpen(module.id)"
                @input="setManualOpen(module.id, $event)"
              >
                <el-collapse-item
                  v-for="item in module.items"
                  :key="item.id"
                  :name="item.id"
                >
                  <template slot="title">
                    <div class="collapse-title">
                      <span class="collapse-name">{{ item.title }}</span>
                      <el-tag size="mini" type="info" effect="plain">功能</el-tag>
                    </div>
                  </template>

                  <div class="manual-card">
                    <div class="card-row">
                      <div class="card-label">功能名称</div>
                      <div class="card-value">{{ item.title }}</div>
                    </div>

                    <div v-if="hasManualVariants(item)" class="card-row">
                      <div class="card-label">分类切换</div>
                      <div class="card-value">
                        <el-radio-group
                          :value="getManualVariant(item)"
                          size="mini"
                          class="variant-switch"
                          @input="setManualVariant(item, $event)"
                        >
                          <el-radio-button
                            v-for="option in getManualVariantOptions(item)"
                            :key="`${item.id}-variant-${option.value}`"
                            :label="option.value"
                          >
                            {{ option.label }}
                          </el-radio-button>
                        </el-radio-group>
                      </div>
                    </div>

                    <div v-if="showManualTemplateFill(item)" class="card-row">
                      <div class="card-label">核心指令</div>
                      <div class="card-value">
                        <div class="template-line">
                          <span
                            v-for="(seg, idx) in parseTemplate(item)"
                            :key="`${item.id}-${idx}`"
                          >
                            <span v-if="seg.type === 'text'">{{ seg.text }}</span>
                            <el-popover
                              v-else
                              placement="top"
                              trigger="click"
                              :value="getSlotPopoverVisible(item, seg)"
                              :width="isStructuredTimeSlot(seg) ? 320 : 240"
                              @input="setSlotPopoverVisible(item, seg, $event)"
                              @show="prepareSlotPicker(item, seg)"
                            >
                              <div class="slot-picker">
                                <div class="slot-picker-title">{{ seg.display }} 选项</div>
                                <template v-if="isStructuredTimeSlot(seg)">
                                  <div class="time-range-picker">
                                    <div class="time-range-presets">
                                      <button
                                        v-for="preset in getStructuredTimePresets(seg)"
                                        :key="`${item.id}-${seg.key}-${preset}`"
                                        type="button"
                                        :class="[
                                          'time-range-preset',
                                          { active: getStructuredTimeField(item, seg.key, 'anchor') === preset }
                                        ]"
                                        @click="updateStructuredTimeField(item, seg.key, 'anchor', preset)"
                                      >
                                        {{ preset }}
                                      </button>
                                    </div>
                                    <div class="time-range-selects">
                                      <el-time-select
                                        :value="getStructuredTimeField(item, seg.key, 'startTime')"
                                        size="small"
                                        placeholder="开始时间"
                                        :picker-options="{ start: '00:00', step: '00:15', end: '23:45' }"
                                        class="time-range-select"
                                        @input="updateStructuredTimeField(item, seg.key, 'startTime', $event)"
                                      />
                                      <span class="time-range-sep">到</span>
                                      <el-time-select
                                        :value="getStructuredTimeField(item, seg.key, 'endTime')"
                                        size="small"
                                        placeholder="结束时间"
                                        :picker-options="{
                                          start: '00:00',
                                          step: '00:15',
                                          end: '23:45',
                                          minTime: getStructuredTimeField(item, seg.key, 'startTime')
                                        }"
                                        class="time-range-select"
                                        @input="updateStructuredTimeField(item, seg.key, 'endTime', $event)"
                                      />
                                    </div>
                                    <div
                                      :class="[
                                        'time-range-hint',
                                        { invalid: Boolean(getStructuredTimeError(item, seg.key)) }
                                      ]"
                                    >
                                      {{ getStructuredTimeError(item, seg.key) || '先选今天/明天/后天，再选起止时间' }}
                                    </div>
                                    <div class="time-range-preview">
                                      {{ getStructuredTimePreview(item, seg.key) }}
                                    </div>
                                    <div class="time-range-actions">
                                      <el-button
                                        size="mini"
                                        @click="clearStructuredTimeField(item, seg.key)"
                                      >
                                        清空
                                      </el-button>
                                      <el-button
                                        type="primary"
                                        size="mini"
                                        :disabled="!canConfirmStructuredTime(item, seg.key)"
                                        @click="confirmStructuredTime(item, seg.key)"
                                      >
                                        确认填入
                                      </el-button>
                                    </div>
                                  </div>
                                </template>
                                <template v-else-if="isCalendarDateSlot(seg)">
                                  <div class="calendar-picker">
                                    <el-date-picker
                                      :value="getCalendarDateField(item, seg.key, 'date', seg.slotType)"
                                      type="date"
                                      value-format="yyyy-MM-dd"
                                      format="yyyy-MM-dd"
                                      placeholder="选择日期"
                                      class="calendar-picker-input"
                                      @input="updateCalendarDateField(item, seg.key, 'date', $event, seg.slotType)"
                                    />
                                    <div class="calendar-preview">
                                      {{ getCalendarPreview(item, seg.key, seg.slotType) }}
                                    </div>
                                    <div class="time-range-actions">
                                      <el-button
                                        size="mini"
                                        @click="clearCalendarField(item, seg.key, seg.slotType)"
                                      >
                                        清空
                                      </el-button>
                                      <el-button
                                        type="primary"
                                        size="mini"
                                        :disabled="!canConfirmCalendar(item, seg.key, seg.slotType)"
                                        @click="confirmCalendarValue(item, seg.key, seg.slotType)"
                                      >
                                        确认填入
                                      </el-button>
                                    </div>
                                  </div>
                                </template>
                                <template v-else-if="isCalendarDateRangeSlot(seg)">
                                  <div class="calendar-picker">
                                    <el-date-picker
                                      :value="getCalendarDateField(item, seg.key, 'range', seg.slotType)"
                                      type="daterange"
                                      value-format="yyyy-MM-dd"
                                      format="yyyy-MM-dd"
                                      range-separator="至"
                                      start-placeholder="开始日期"
                                      end-placeholder="结束日期"
                                      unlink-panels
                                      class="calendar-picker-input"
                                      @input="updateCalendarDateField(item, seg.key, 'range', $event, seg.slotType)"
                                    />
                                    <div class="calendar-preview">
                                      {{ getCalendarPreview(item, seg.key, seg.slotType) }}
                                    </div>
                                    <div class="time-range-actions">
                                      <el-button
                                        size="mini"
                                        @click="clearCalendarField(item, seg.key, seg.slotType)"
                                      >
                                        清空
                                      </el-button>
                                      <el-button
                                        type="primary"
                                        size="mini"
                                        :disabled="!canConfirmCalendar(item, seg.key, seg.slotType)"
                                        @click="confirmCalendarValue(item, seg.key, seg.slotType)"
                                      >
                                        确认填入
                                      </el-button>
                                    </div>
                                  </div>
                                </template>
                                <template v-else-if="isCalendarDateWithModeSlot(seg)">
                                  <div class="calendar-picker">
                                    <el-radio-group
                                      :value="getCalendarDateField(item, seg.key, 'mode', seg.slotType)"
                                      size="mini"
                                      class="calendar-mode-switch"
                                      @input="updateCalendarDateMode(item, seg.key, $event)"
                                    >
                                      <el-radio-button label="single">单日</el-radio-button>
                                      <el-radio-button label="range">多日</el-radio-button>
                                    </el-radio-group>
                                    <el-date-picker
                                      v-if="getCalendarDateField(item, seg.key, 'mode', seg.slotType) === 'single'"
                                      :value="getCalendarDateField(item, seg.key, 'date', seg.slotType)"
                                      type="date"
                                      value-format="yyyy-MM-dd"
                                      format="yyyy-MM-dd"
                                      placeholder="选择日期"
                                      class="calendar-picker-input"
                                      @input="updateCalendarDateField(item, seg.key, 'date', $event, seg.slotType)"
                                    />
                                    <el-date-picker
                                      v-else
                                      :value="getCalendarDateField(item, seg.key, 'range', seg.slotType)"
                                      type="daterange"
                                      value-format="yyyy-MM-dd"
                                      format="yyyy-MM-dd"
                                      range-separator="至"
                                      start-placeholder="开始日期"
                                      end-placeholder="结束日期"
                                      unlink-panels
                                      class="calendar-picker-input"
                                      @input="updateCalendarDateField(item, seg.key, 'range', $event, seg.slotType)"
                                    />
                                    <div class="calendar-preview">
                                      {{ getCalendarPreview(item, seg.key, seg.slotType) }}
                                    </div>
                                    <div class="time-range-actions">
                                      <el-button
                                        size="mini"
                                        @click="clearCalendarField(item, seg.key, seg.slotType)"
                                      >
                                        清空
                                      </el-button>
                                      <el-button
                                        type="primary"
                                        size="mini"
                                        :disabled="!canConfirmCalendar(item, seg.key, seg.slotType)"
                                        @click="confirmCalendarValue(item, seg.key, seg.slotType)"
                                      >
                                        确认填入
                                      </el-button>
                                    </div>
                                  </div>
                                </template>
                                <el-select
                                  v-else-if="usesSelectableOptions(seg)"
                                  :value="getSlotValue(item, seg.key)"
                                  filterable
                                  allow-create
                                  default-first-option
                                  size="small"
                                  :loading="isSlotLoading(item, seg)"
                                  :disabled="isSlotDisabled(item, seg)"
                                  :placeholder="getSlotPlaceholder(item, seg)"
                                  @input="setSlotValue(item, seg.key, $event)"
                                >
                                  <el-option
                                    v-for="opt in getSlotOptions(seg.slotType, item, seg)"
                                    :key="opt.value"
                                    :label="opt.displayLabel || opt.label"
                                    :value="opt.value"
                                  >
                                    <div v-if="seg.slotType === 'schedule'" class="schedule-option">
                                      <span>{{ opt.label }}</span>
                                      <span
                                        v-if="isScheduleOptionEnabled(opt)"
                                        class="schedule-option-status"
                                      >
                                        (启动)
                                      </span>
                                    </div>
                                    <span v-else>{{ opt.label }}</span>
                                  </el-option>
                                </el-select>
                                <el-input
                                  v-else
                                  :value="getSlotValue(item, seg.key)"
                                  size="small"
                                  clearable
                                  :placeholder="getSlotPlaceholder(item, seg)"
                                  @input="setSlotValue(item, seg.key, $event)"
                                />
                              </div>
                              <span
                                slot="reference"
                                :class="[
                                  'slot-chip',
                                  {
                                    active: !!getSlotValue(item, seg.key),
                                    'slot-chip-schedule': isScheduleSlot(seg) && isSelectedScheduleEnabled(item, seg)
                                  }
                                ]"
                              >
                                <span>{{ getSlotDisplay(item, seg) }}</span>
                                <span
                                  v-if="isScheduleSlot(seg) && isSelectedScheduleEnabled(item, seg)"
                                  class="slot-chip-status"
                                >
                                  (启动)
                                </span>
                              </span>
                            </el-popover>
                          </span>
                        </div>
                        <el-button type="text" size="mini" class="fill-link" @click="fillFromTemplate(item)">
                          点击填入
                        </el-button>
                      </div>
                    </div>

                    <div v-if="showManualExamples(item)" class="card-row">
                      <div class="card-label">🗣️ 推荐指令示例</div>
                      <div class="card-value">
                        <div
                          v-for="(example, idx) in getManualExamples(item)"
                          :key="`${item.id}-ex-${idx}`"
                          class="example-item"
                          @click="fillCommand(example)"
                        >
                          <i class="el-icon-chat-line-round" />
                          <span class="example-text">{{ example }}</span>
                        </div>
                      </div>
                    </div>

                    <div class="card-row">
                      <div class="card-label">💡 必填参数提示</div>
                      <div class="card-value">
                        <el-tag
                          v-for="(param, idx) in formatRequired(item)"
                          :key="`${item.id}-req-${idx}`"
                          size="mini"
                          type="warning"
                          effect="plain"
                        >
                          {{ param }}
                        </el-tag>
                      </div>
                    </div>

                    <div v-if="item.formType === 'cloneSchedule'" class="card-row form-row">
                      <div class="card-label">⚡ 只需填空</div>
                      <div class="card-value">
                        <div class="form-grid">
                          <div class="form-field">
                            <div class="form-label">源方案</div>
                            <el-select
                              :value="formState.cloneSchedule.source"
                              filterable
                              allow-create
                              size="small"
                              placeholder="选择或输入源方案"
                              @input="updateCloneForm('source', $event)"
                              @focus="ensureSlotOptions('schedule')"
                            >
                              <el-option
                                v-for="opt in getSlotOptions('schedule')"
                                :key="`clone-source-${opt.value}`"
                                :label="opt.displayLabel || opt.label"
                                :value="opt.value"
                              >
                                <div class="schedule-option">
                                  <span>{{ opt.label }}</span>
                                  <span
                                    v-if="isScheduleOptionEnabled(opt)"
                                    class="schedule-option-status"
                                  >
                                    (启动)
                                  </span>
                                </div>
                              </el-option>
                            </el-select>
                          </div>
                          <div class="form-field">
                            <div class="form-label">偏移时间(分钟)</div>
                            <el-input-number
                              :value="formState.cloneSchedule.offset"
                              size="small"
                              :min="-300"
                              :max="300"
                              @input="updateCloneForm('offset', $event)"
                            />
                          </div>
                          <div class="form-field">
                            <div class="form-label">新名称</div>
                            <el-input
                              :value="formState.cloneSchedule.name"
                              size="small"
                              placeholder="如：冬季作息"
                              @input="updateCloneForm('name', $event)"
                            />
                          </div>
                        </div>
                        <el-button type="primary" size="mini" @click="applyCloneSchedule">
                          生成指令
                        </el-button>
                      </div>
                    </div>
                  </div>
                </el-collapse-item>
              </el-collapse>

              <div v-if="!module.items.length" class="empty-state">
                未找到相关指令
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>

        <div class="manual-footer">
          <i class="el-icon-info" />
          <span>{{ currentTip }}</span>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      :visible.sync="historyDrawer"
      :direction="isMobileLayout ? 'btt' : 'rtl'"
      :size="isMobileLayout ? '100%' : '420px'"
      :with-header="false"
      :append-to-body="true"
      :custom-class="isMobileLayout ? 'log-drawer log-drawer-mobile' : 'log-drawer'"
      @open="fetchAssistantLogs"
    >
      <div class="log-shell">
        <div class="log-header">
          <div>
            <div class="log-title">成功指令日志</div>
            <div class="log-subtitle">保存成功执行后的用户输入与助手回复。</div>
          </div>
          <div class="log-header-actions">
            <el-button
              type="text"
              size="mini"
              icon="el-icon-refresh-right"
              :loading="historyLoading"
              @click="fetchAssistantLogs"
            >
              刷新
            </el-button>
            <el-button type="text" icon="el-icon-close" @click="historyDrawer = false" />
          </div>
        </div>

        <div class="log-body">
          <div v-if="historyLoading && !historyEntries.length" class="empty-state">
            正在加载成功日志...
          </div>
          <div v-else-if="!historyEntries.length" class="empty-state">
            暂无成功执行的指令记录
          </div>
          <div v-else class="log-list">
            <div v-for="entry in historyEntries" :key="entry.id" class="log-card">
              <div class="log-card-row">
                <div class="log-card-label">用户输入</div>
                <div class="log-card-value">{{ entry.text || '未记录指令文本' }}</div>
              </div>
              <div class="log-card-row">
                <div class="log-card-label">助手回复</div>
                <div class="log-card-value">{{ entry.reply || '-' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import axios from 'axios'
import { getToken } from '@/utils/auth'
import { emitAssistantRefresh, offAssistantRefresh, onAssistantRefresh } from '@/utils/assistantRefreshBus'
import { mapHttpErrorToUserMessage } from '@/utils/httpError'

const api = axios.create({
  timeout: 30000
})

const DEFAULT_ALLOWED_SCHEDULE_KINDS = ['小学', '中学', '高中', '大学']
const DEFAULT_ALLOWED_SCHEDULE_SEASONS = ['夏季', '冬季']

// T100 slot-locking: 指令大全里的作息命令映射到后端 intent。指令大全会把用户的
// 结构化选择拍平成纯文本发 /assistant/chat,后端重跑 NLU 时 OOV 方案名(数字 / 英文
// 如 "6.25cs")会误分类。发送时把已锁定的意图 / 方案身份作为独立结构化字段带给后端
// (走独立字段,绝不往 text 里塞暗号,那是 T87 死循环坑)。scope 只覆盖作息命令,
// 别的 manual item 不锁。每个 item id 直接对应一个 intent。
const MANUAL_SCHEDULE_INTENT_MAP = {
  'schedule-swap': 'swap_schedule',
  'schedule-task-migrate': 'move_schedule',
  'schedule-task-cancel': 'cancel_schedule'
}
// 启用 / 停用是同一个 item(schedule-enable)的 textChoice 二选一,由选中的动作词决定 intent。
const MANUAL_SCHEDULE_ENABLE_CHOICE_INTENT = {
  启用: 'enable_schedule',
  停用: 'disable_schedule'
}
// FE 方案槽(slotType='schedule')锁定时映射到后端槽位 key(见 T99 契约 / KP #21)。
const LOCKED_SCHEDULE_SLOT_KEY = 'schedule_name'
// T108: FE 任务槽(slotType='task')锁定时映射到后端槽位 key。后端 phase-1 anchor
// 过滤(_match_tasks_for_phase1_anchor)按 task_name 收窄到选中的那条,空则塌回全天。
const LOCKED_TASK_SLOT_KEY = 'task_name'
// T122: 取消"按天 / 按时段"= 跨所有启用方案 + 文件广播。后端 _resolve_phase1_schedule_targets
// (api_public.py:10482/:10489)读 schedule_scope=='enabled_all' 才枚举全部启用方案;缺它
// 时空 schedule_name + 2+ 启用方案会掉进 target_disambiguation(逼选方案),且当天有广播时
// 守卫会静默只取消广播、丢掉全部作息任务(critic probe D 实锤)。故必须锁 enabled_all。
const LOCKED_SCHEDULE_SCOPE_KEY = 'schedule_scope'
const LOCKED_SCHEDULE_SCOPE_ALL = 'enabled_all'

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers['X-Token'] = token
  }
  return config
})

export default {
  name: 'AiAssistantFloat',
  data() {
    return {
      command: '',
      aiLoading: false,
      // T100: 指令大全填出作息命令且方案从真列表选中时,在 .join('') 拍平前捕获的
      // 待发锁定 directive({ text, intent, slots });发送时若与待发文本逐字相同就
      // 并进 body、发完一次性清掉,不污染后续手打的普通命令。null = 不锁。
      pendingLockedDirective: null,
      pendingAssistantMessageId: null,
      // 每秒 tick 的时钟,驱动 undo 按钮倒计时。仅当 conversation 里
      // 还有未过期的 undo_token 时启动 interval,过期或为空就停掉。
      undoNowTick: Date.now(),
      undoTickHandle: null,
      // 输入建议:打开后展示 历史命令 + 模板,Tab 采纳第一条。
      suggestionsOpen: false,
      suggestionBlurHandle: null,
      // pending 气泡的 "深度思考中" 自适应文字:按耗时阶梯升级。
      thinkingTicker: null,
      collapsed: true,
      mobilePanelVisible: false,
      conversation: [],
      position: {
        top: 140,
        left: 0
      },
      dragState: null,
      panelWidth: 320,
      manualDrawer: false,
      historyDrawer: false,
      historyLoading: false,
      historyEntries: [],
      assistantSettingsLoading: false,
      assistantSettingsSaving: false,
      schoolKindPopoverVisible: false,
      defaultScheduleKind: '',
      defaultScheduleSeason: '',
      allowedScheduleKinds: DEFAULT_ALLOWED_SCHEDULE_KINDS.slice(),
      allowedScheduleSeasons: DEFAULT_ALLOWED_SCHEDULE_SEASONS.slice(),
      manualSearch: '',
      manualActiveTab: 'terminal',
      manualOpenMap: {},
      manualTipIndex: 0,
      manualTipTimer: null,
      manualTips: [
        '💡 提示：“取消”只是跳过一次，“删除”才是永久移除。',
        '💡 提示：不指定区域时，可能默认对全校播放。',
        '💡 提示：尽量说清时间与地点，命中率更高。'
      ],
      slotOptions: {
        terminal: [],
        zone: [],
        schedule: [],
        media: [],
        broadcastTask: [],
        playMedia: [],
        target: []
      },
      slotLoading: {
        terminal: false,
        zone: false,
        schedule: false,
        media: false,
        broadcastTask: false,
        playMedia: false
      },
      taskOptionsBySchedule: {},
      taskLoadingBySchedule: {},
      manualVariantState: {},
      slotPopoverVisible: {},
      structuredTimeSelections: {},
      calendarDateSelections: {},
      slotSelections: {},
      formState: {
        cloneSchedule: {
          source: '',
          offset: 30,
          name: ''
        }
      },
      manualModules: [
        {
          id: 'terminal',
          tabLabel: '终端',
          title: '模块 1：终端和设备',
          desc: '查终端状态，调音量，开关常用设备功能。',
          items: [
            {
              id: 'terminal-status',
              title: '查看终端状态',
              template: '帮我看看[终端]的状态',
              examples: ['帮我看看高三1班终端的状态'],
              required: ['终端名称'],
              slotMap: { 终端: { type: 'terminal', display: '终端' }}
            },
            {
              id: 'terminal-control',
              title: '调终端/区域音量',
              template: '把[终端/区域]音量设为[动作/数值]',
              examples: ['将初一3班的音量调为50', '把操场设为静音'],
              required: ['终端/区域', '音量值或动作'],
              slotMap: {
                '终端/区域': { type: 'target', display: '终端/区域' },
                '动作/数值': { type: 'text', display: '动作/数值' }
              }
            },
            {
              id: 'terminal-append-task',
              title: '给任务加终端',
              template: '将[终端]加入到[任务]里',
              examples: ['将终端01加入到升旗仪式任务里'],
              required: ['终端', '任务名'],
              slotMap: {
                终端: { type: 'terminal', display: '终端' },
                任务: { type: 'text', display: '任务名' }
              }
            },
            {
              id: 'terminal-enable',
              title: '开关终端',
              template: '[启用/停用][终端]',
              examples: ['停用故障的音箱'],
              required: ['终端名称'],
              slotMap: {
                '启用/停用': {
                  type: 'textChoice',
                  display: '启用/停用',
                  options: ['启用', '停用']
                },
                终端: { type: 'terminal', display: '终端' }
              }
            },
            {
              id: 'terminal-time-sync',
              title: '给终端校时',
              template: '对[终端/区域]进行校时',
              examples: ['对全校终端进行校时'],
              required: ['终端或区域'],
              slotMap: {
                '终端/区域': { type: 'target', display: '终端/区域' }
              }
            },
            {
              id: 'terminal-self-check',
              title: '检查终端网络',
              template: '进行一次终端网络自检',
              examples: ['进行一次终端网络自检'],
              required: [],
              slotMap: {}
            }
          ]
        },
        {
          id: 'zone',
          tabLabel: '分区',
          title: '模块 2：分区',
          desc: '新建分区，或把终端加进去、移出来。',
          items: [
            {
              id: 'zone-create',
              title: '新建分区',
              template: '新建一个名为[分区名称]的分区',
              examples: ['新建一个名为英语角的分区'],
              required: ['新分区名称'],
              slotMap: { 分区名称: { type: 'text', display: '分区名称' }}
            },
            {
              id: 'zone-delete',
              title: '删除分区',
              template: '删除[分区名称]这个分区',
              examples: ['删除旧操场这个分区'],
              required: ['分区名称'],
              slotMap: { 分区名称: { type: 'zone', display: '分区名称' }}
            },
            {
              id: 'zone-add-terminal',
              title: '把终端加入分区',
              template: '把[终端]添加到[分区]分区',
              examples: ['把三年级1班添加到三年级分区'],
              required: ['终端', '目标分区'],
              slotMap: {
                终端: { type: 'terminal', display: '终端' },
                分区: { type: 'zone', display: '分区' }
              }
            },
            {
              id: 'zone-remove-terminal',
              title: '把终端移出分区',
              template: '把[终端]从[分区]分区移除',
              examples: ['把三年级1班从三年级分区移除'],
              required: ['终端', '来源分区'],
              slotMap: {
                终端: { type: 'terminal', display: '终端' },
                分区: { type: 'zone', display: '分区' }
              }
            }
          ]
        },
        {
          id: 'media',
          tabLabel: '媒体',
          title: '模块 3：媒体',
          desc: '更换铃声、背景音乐等播放内容。',
          items: [
            {
              id: 'media-replace-global',
              title: '全局换媒体',
              template: '用[新媒体]替换掉[旧媒体]',
              examples: ['用运动员进行曲替换掉国歌'],
              required: ['旧媒体', '新媒体'],
              slotMap: {
                新媒体: { type: 'media', display: '新媒体' },
                旧媒体: { type: 'media', display: '旧媒体' }
              }
            },
            {
              id: 'media-replace-schedule',
              title: '换方案里的媒体',
              template: '把[方案]里的[旧媒体]换成[新媒体]',
              examples: ['把夏季作息里的上课铃换成铃声2'],
              required: ['方案', '旧媒体', '新媒体'],
              slotMap: {
                方案: { type: 'schedule', display: '方案' },
                新媒体: { type: 'media', display: '新媒体' },
                旧媒体: { type: 'media', display: '旧媒体' }
              }
            }
          ]
        },
        {
          id: 'schedule',
          tabLabel: '方案',
          title: '模块 4：作息方案',
          desc: '新建、复制、启停，或调整作息时间。',
          items: [
            {
              id: 'schedule-create',
              title: '新建方案',
              template: '新建一个[方案名称]',
              examples: ['新建一个暑假作息', '新建一个军训作息'],
              required: ['方案名称（可选）'],
              slotMap: { 方案名称: { type: 'text', display: '方案名称' }}
            },
            {
              id: 'schedule-clone',
              title: '复制方案并改时间',
              template: '复制[源方案]，整体向后推迟[分钟]分钟，创建为[新名称]',
              examples: ['复制春季作息，整体向后推迟30分钟，创建为冬季作息'],
              required: ['源方案', '改多少分钟', '新名称'],
              slotMap: {
                源方案: { type: 'schedule', display: '源方案' },
                分钟: { type: 'text', display: '分钟' },
                新名称: { type: 'text', display: '新名称' }
              },
              formType: 'cloneSchedule'
            },
            {
              id: 'schedule-delete',
              title: '删除方案',
              template: '删除[方案名称]方案',
              examples: ['删除2024测试版方案'],
              required: ['方案名称'],
              slotMap: { 方案名称: { type: 'schedule', display: '方案名称' }}
            },
            {
              id: 'schedule-swap',
              title: '任务对调',
              template: '把[方案]里[原日期]和[目标日期]的任务对调',
              examples: ['把春季作息里2026-03-24和2026-03-25的任务对调', '把夏季作息里2026-04-01和2026-04-03的任务对调'],
              required: ['方案', '原日期', '目标日期'],
              slotMap: {
                方案: { type: 'schedule', display: '方案' },
                '原日期': { type: 'calendarDate', display: '原日期' },
                '目标日期': { type: 'calendarDate', display: '目标日期' }
              }
            },
            {
              id: 'schedule-enable',
              title: '启用/停用方案',
              template: '[启用/停用][方案名称]',
              examples: ['启用2025春季作息方案'],
              required: ['方案名称'],
              slotMap: {
                '启用/停用': {
                  type: 'textChoice',
                  display: '启用/停用',
                  options: ['启用', '停用']
                },
                方案名称: { type: 'schedule', display: '方案名称' }
              }
            },
            {
              id: 'schedule-task-migrate',
              title: '任务迁移',
              defaultVariant: 'task',
              variantOptions: [
                { label: '任务', value: 'task' },
                { label: '日期', value: 'date' }
              ],
              variants: {
                task: {
                  template: '把[方案]里[原日期]的[任务]任务改到[目标日期]',
                  examples: ['把夏季作息里2026-03-28的眼保健操任务改到2026-03-30', '把春季作息里2026-04-02的升旗任务改到2026-04-05'],
                  required: ['方案', '原日期', '任务', '目标日期'],
                  slotMap: {
                    方案: { type: 'schedule', display: '方案' },
                    '原日期': { type: 'calendarDate', display: '原日期' },
                    任务: { type: 'task', display: '任务', dependsOn: '方案', filterByDate: '原日期' },
                    目标日期: { type: 'calendarDate', display: '目标日期' }
                  }
                },
                date: {
                  template: '把[方案]里[原日期]的任务改到[目标日期]',
                  examples: ['把夏季作息里2026-03-24的任务改到2026-03-25', '把春季作息里2026-04-01的任务改到2026-04-02'],
                  required: ['方案', '原日期', '目标日期'],
                  slotMap: {
                    方案: { type: 'schedule', display: '方案' },
                    '原日期': { type: 'calendarDate', display: '原日期' },
                    '目标日期': { type: 'calendarDate', display: '目标日期' }
                  }
                }
              }
            },
            {
              id: 'schedule-task-cancel',
              title: '任务取消',
              defaultVariant: 'date',
              variantOptions: [
                { label: '按天', value: 'date' },
                { label: '按时段', value: 'timerange' }
              ],
              variants: {
                // T122: "按天" = 取消某天(跨所有启用方案 + 当天定时的文件广播)会响的
                // 全部任务,不选方案。保留日期区间(如 3月24到28号)。锁 intent + 结构化
                // 整天时段(time_range_start/end),跳 NLU。
                date: {
                  template: '取消[日期]的任务',
                  examples: ['取消2026-03-24的任务', '取消2026-03-24到2026-03-28的任务'],
                  required: ['日期'],
                  slotMap: {
                    日期: { type: 'calendarDateWithMode', display: '日期' }
                  }
                },
                // T122: "按时段" = 取消某天某个时段(如今天 14:00-18:00)会响的任务,同样
                // 跨所有方案 + 文件广播。用结构化时间选择器(anchor 今天/明天/后天 + 起止
                // 时间下拉,非自由打字),锁成后端认的 time_range_start/end 具体日期时刻。
                timerange: {
                  template: '取消[时段]的任务',
                  examples: ['取消今天14:00到18:00的任务', '取消明天08:00到09:00的任务'],
                  required: ['时段'],
                  slotMap: {
                    时段: { type: 'structuredTimeRange', display: '时段', presets: ['今天', '明天', '后天'] }
                  }
                }
              }
            }
          ]
        },
        {
          id: 'playback',
          tabLabel: '播放',
          title: '模块 5：播放',
          desc: '马上播放、暂停、停播和调音量。',
          items: [
            {
              id: 'playback-media',
              title: '马上播放媒体',
              defaultVariant: 'duration',
              variantOptions: [
                { label: '按时长', value: 'duration' },
                { label: '按次数', value: 'loop' }
              ],
              variants: {
                duration: {
                  template: '给[终端/区域]播放[媒体]，播放[秒数]秒，音量[数值]',
                  examples: ['给操场播放眼保健操，播放30秒，音量40'],
                  required: ['终端/区域', '媒体', '秒数', '数值'],
                  slotMap: {
                    '终端/区域': { type: 'target', display: '终端/区域' },
                    媒体: { type: 'playMedia', display: '媒体' },
                    秒数: { type: 'text', display: '秒数' },
                    数值: { type: 'text', display: '数值' }
                  }
                },
                loop: {
                  template: '给[终端/区域]播放[媒体]，播放[次数]次，音量[数值]',
                  examples: ['给操场播放上课铃，播放3次，音量40'],
                  required: ['终端/区域', '媒体', '次数', '数值'],
                  slotMap: {
                    '终端/区域': { type: 'target', display: '终端/区域' },
                    媒体: { type: 'playMedia', display: '媒体' },
                    次数: { type: 'text', display: '次数' },
                    数值: { type: 'text', display: '数值' }
                  }
                }
              }
            },
            {
              id: 'playback-task',
              title: '马上播放任务',
              template: '播放[文件广播]任务',
              examples: ['播放大课间任务'],
              required: ['文件广播任务'],
              slotMap: { 文件广播: { type: 'broadcastTask', display: '文件广播' }}
            },
            {
              id: 'playback-control',
              title: '文件广播控制',
              defaultVariant: 'stop',
              variantOptions: [
                { label: '停止', value: 'stop' },
                { label: '暂停', value: 'pause' },
                { label: '恢复', value: 'resume' }
              ],
              variants: {
                stop: {
                  template: '停止[文件广播]任务',
                  examples: ['停止大课间任务', '停止午休音乐任务'],
                  required: ['文件广播任务'],
                  slotMap: {
                    文件广播: { type: 'broadcastTask', display: '文件广播' }
                  }
                },
                pause: {
                  template: '暂停[文件广播]任务',
                  examples: ['暂停大课间任务', '暂停午休音乐任务'],
                  required: ['文件广播任务'],
                  slotMap: {
                    文件广播: { type: 'broadcastTask', display: '文件广播' }
                  }
                },
                resume: {
                  template: '恢复[文件广播]任务',
                  examples: ['恢复升旗仪式任务', '恢复午休音乐任务'],
                  required: ['文件广播任务'],
                  slotMap: {
                    文件广播: { type: 'broadcastTask', display: '文件广播' }
                  }
                }
              }
            },
            {
              id: 'playback-volume',
              title: '音量控制',
              template: '[区域]分区音量调为[数值]',
              examples: ['全校音量调大一点'],
              required: ['区域（可选）'],
              slotMap: {
                区域: { type: 'zone', display: '区域' },
                数值: { type: 'text', display: '数值' }
              }
            },
            {
              id: 'playback-emergency',
              title: '全校紧急广播',
              template: '全校播放[紧急内容]',
              examples: ['全校播放消防警报'],
              required: ['紧急内容'],
              slotMap: { 紧急内容: { type: 'text', display: '紧急内容' }}
            }
          ]
        },
        {
          id: 'query',
          tabLabel: '查询',
          title: '模块 6：查询',
          desc: '查任务，或播放前先检查设备。',
          items: [
            {
              id: 'query-tasks',
              title: '查看任务',
              template: '看看[时间点/时间段]有什么任务',
              examples: ['看看今天下午2点有什么任务'],
              required: ['时间点/时间段'],
              slotMap: { '时间点/时间段': { type: 'text', display: '时间点/时间段' }}
            },
            {
              id: 'query-playcheck',
              title: '播放前先检查',
              template: '播放[任务名称]前检查一下设备',
              examples: ['播放升旗仪式前检查一下设备'],
              required: ['任务名称'],
              slotMap: { 任务名称: { type: 'text', display: '任务名称' }}
            },
            {
              id: 'query-task-terminal',
              title: '给任务加终端/删终端',
              template: '把[终端]从[任务]里[移除/加入]',
              examples: ['把小操场从大课间任务里去掉'],
              required: ['终端', '任务', '加入或移除'],
              slotMap: {
                终端: { type: 'terminal', display: '终端' },
                任务: { type: 'text', display: '任务' },
                '移除/加入': { type: 'text', display: '移除/加入' }
              }
            }
          ]
        }
      ]
    }
  },
  computed: {
    isMobileLayout() {
      return this.$store?.state?.app?.device === 'mobile'
    },
    panelStyle() {
      if (this.isMobileLayout) return null
      return {
        top: `${this.position.top}px`,
        left: `${this.position.left}px`
      }
    },
    filteredModules() {
      const keyword = String(this.manualSearch || '').trim().toLowerCase()
      if (!keyword) return this.manualModules
      const result = []
      this.manualModules.forEach((module) => {
        const moduleText = `${module.title} ${module.desc} ${module.tabLabel}`.toLowerCase()
        const moduleMatch = moduleText.includes(keyword)
        const items = module.items.filter((item) => {
          const itemText = this.buildManualSearchText(item).toLowerCase()
          return itemText.includes(keyword)
        })
        if (moduleMatch) {
          result.push({ ...module })
        } else if (items.length) {
          result.push({ ...module, items })
        }
      })
      return result
    },
    currentSuggestions() {
      // Combined history + templates, filtered by the current input
      // prefix. History entries take precedence (they're proven inputs
      // for this user), templates fill the rest up to ~6 items total.
      const TEMPLATES = [
        '取消今天的早间播放',
        '取消春季方案今天的早间任务',
        '把春季方案明天 8 点的任务挪到 9 点',
        '把方案1 和方案2 的早间对调',
        '播放儿歌到 1 号分区',
        '今天做了什么',
        '把所有作息里的国歌换成校歌',
        '调一下音量到 80'
      ]
      const cmd = String(this.command || '').trim()
      const lowered = cmd.toLowerCase()
      const seen = new Set()
      const out = []
      const tryPush = (text, source) => {
        if (!text) return
        const t = String(text).trim()
        if (!t || t === cmd) return
        // Filter: when user is typing, only show items containing what
        // they've typed so far (substring, case-insensitive). When the
        // input is empty, show everything.
        if (lowered && !t.toLowerCase().includes(lowered)) return
        const key = t
        if (seen.has(key)) return
        seen.add(key)
        out.push({ text: t, source })
      }
      const history = Array.isArray(this.historyEntries) ? this.historyEntries : []
      for (const entry of history) {
        if (out.length >= 6) break
        tryPush(entry && entry.text, 'history')
      }
      for (const tpl of TEMPLATES) {
        if (out.length >= 6) break
        tryPush(tpl, 'template')
      }
      return out
    },
    aiDiagnosticsEnabled() {
      const raw = String(process.env.VUE_APP_AI_DIAGNOSTICS || '').trim()
      if (raw === '1') return true
      if (raw === '0') return false
      return process.env.NODE_ENV !== 'production'
    },
    currentTip() {
      if (!this.manualTips.length) return ''
      return this.manualTips[this.manualTipIndex % this.manualTips.length]
    },
    hasScheduleTemplateSelection() {
      return Boolean(this.defaultScheduleKind && this.defaultScheduleSeason)
    },
    scheduleTemplateSelectionLabel() {
      return [this.defaultScheduleKind, this.defaultScheduleSeason].filter(Boolean).join(' / ')
    }
  },
  watch: {
    isMobileLayout: {
      immediate: true,
      handler(value) {
        if (!value) return
        this.mobilePanelVisible = false
        this.collapsed = false
      }
    },
    filteredModules: {
      handler(list) {
        if (!list.length) return
        const exists = list.some((mod) => mod.id === this.manualActiveTab)
        if (!exists) {
          this.manualActiveTab = list[0].id
        }
      },
      immediate: true
    }
  },
  created() {
    this.initManualOpenMap()
    this.initManualVariantState()
    this.fetchAssistantSettings({ silent: true })
    onAssistantRefresh(this.handleAssistantRefresh)
  },
  mounted() {
    this.position.left = window.innerWidth - this.panelWidth - 24
    window.addEventListener('resize', this.handleResize)
  },
  beforeDestroy() {
    offAssistantRefresh(this.handleAssistantRefresh)
    this.removeDragListeners()
    window.removeEventListener('resize', this.handleResize)
    this.stopTipTimer()
    this.stopUndoTicker()
    this.stopThinkingTicker()
    // Stop any in-flight bubble streamers so we don't leak intervals
    // after the panel is destroyed (e.g. user navigates away mid-reveal).
    for (const msg of this.conversation || []) {
      this.stopBubbleStream(msg)
    }
  },
  methods: {
    toggleCollapse() {
      if (this.isMobileLayout) return
      this.collapsed = !this.collapsed
    },
    handleResize() {
      if (this.isMobileLayout) return
      const maxLeft = window.innerWidth - this.panelWidth - 12
      if (this.position.left > maxLeft) this.position.left = maxLeft
    },
    openMobilePanel() {
      this.mobilePanelVisible = true
      this.$nextTick(() => {
        const box = this.$refs.chatBox
        if (box) box.scrollTop = box.scrollHeight
        const input = this.$refs.commandInput
        if (input && typeof input.focus === 'function') {
          input.focus()
        }
      })
    },
    closeMobilePanel() {
      this.mobilePanelVisible = false
    },
    openManualDrawer() {
      this.manualDrawer = true
    },
    openHistoryDrawer() {
      this.historyDrawer = true
    },
    handleManualOpen() {
      this.setManualTabFromContext()
      this.refreshManualSlotOptions({ force: true })
      this.startTipTimer()
    },
    handleManualClose() {
      this.stopTipTimer()
    },
    handleAssistantRefresh(payload = {}) {
      const authBackendSync = String(payload?.reason || '').trim() === 'auth_backend_sync'
      if (authBackendSync) {
        this.resetSlotOptions([
          'terminal',
          'zone',
          'target',
          'schedule',
          'media',
          'playMedia',
          'broadcastTask'
        ])
        if (this.manualDrawer) {
          this.refreshManualSlotOptions({ force: true })
        }
        return
      }
      const actions = this.collectRefreshActions(payload)
      const scheduleChanged = this.hasAnyAction(actions, [
        'create_schedule',
        'delete_schedule',
        'shift_schedule_later',
        'shift_schedule_earlier'
      ])
      const scheduleTaskChanged = this.hasAnyAction(actions, [
        'move_schedule',
        'swap_schedule',
        'cancel_schedule',
        'replace_media_in_task',
        'add_terminal_to_task',
        'remove_terminal_to_task',
        'remove_terminal_from_task'
      ])
      const zoneChanged = this.hasAnyAction(actions, [
        'create_zone',
        'delete_zone',
        'add_terminal_to_zone',
        'remove_terminal_from_zone'
      ])
      const playMediaChanged = this.hasAnyAction(actions, ['play_media'])
      const mediaLibraryChanged = this.hasAnyAction(actions, ['replace_media', 'replace_media_in_task'])
      if (!scheduleChanged && !scheduleTaskChanged && !zoneChanged && !playMediaChanged && !mediaLibraryChanged) return
      const staleTypes = []
      if (scheduleChanged) staleTypes.push('schedule')
      if (scheduleTaskChanged) staleTypes.push('schedule', 'broadcastTask')
      if (zoneChanged) staleTypes.push('zone', 'target')
      if (playMediaChanged) staleTypes.push('playMedia')
      if (mediaLibraryChanged) staleTypes.push('media', 'playMedia')
      this.resetSlotOptions(staleTypes)
      if (this.manualDrawer) {
        this.refreshManualSlotOptions({
          force: true,
          types: [
            ...(scheduleChanged ? ['schedule'] : []),
            ...(scheduleTaskChanged ? ['schedule', 'broadcastTask'] : []),
            ...(zoneChanged ? ['zone'] : []),
            ...(playMediaChanged ? ['playMedia'] : []),
            ...(mediaLibraryChanged ? ['media', 'playMedia'] : [])
          ]
        })
      }
    },
    initManualOpenMap() {
      this.manualModules.forEach((module) => {
        if (!this.manualOpenMap[module.id]) {
          this.$set(this.manualOpenMap, module.id, '')
        }
      })
    },
    initManualVariantState() {
      this.manualModules.forEach((module) => {
        module.items.forEach((item) => {
          if (!this.hasManualVariants(item)) return
          if (!this.manualVariantState[item.id]) {
            this.$set(this.manualVariantState, item.id, this.getDefaultManualVariant(item))
          }
        })
      })
    },
    buildManualSearchText(item) {
      const parts = [item.title]
      if (item.template) parts.push(item.template)
      parts.push(...(item.examples || []), ...(item.required || []))
      if (this.hasManualVariants(item)) {
        Object.values(item.variants || {}).forEach((variant) => {
          parts.push(variant.template || '')
          parts.push(...(variant.examples || []), ...(variant.required || []))
        })
      }
      return parts.filter(Boolean).join(' ')
    },
    hasManualVariants(item) {
      return Boolean(item && item.variants && Object.keys(item.variants).length)
    },
    getDefaultManualVariant(item) {
      if (!this.hasManualVariants(item)) return ''
      return item.defaultVariant || Object.keys(item.variants || {})[0] || ''
    },
    getManualVariant(item) {
      if (!this.hasManualVariants(item)) return ''
      return this.manualVariantState[item.id] || this.getDefaultManualVariant(item)
    },
    getManualVariantOptions(item) {
      if (!this.hasManualVariants(item)) return []
      if (Array.isArray(item.variantOptions) && item.variantOptions.length) {
        return item.variantOptions
      }
      return Object.keys(item.variants || {}).map((key) => ({ label: key, value: key }))
    },
    getManualExamples(item) {
      const manualItem = this.resolveManualItem(item)
      return Array.isArray(manualItem.examples) ? manualItem.examples : []
    },
    // XC-1 (T109): schedule-clone 是唯一带专属表单(formType)的卡片,表单"生成指令"
    // (applyCloneSchedule)是唯一接了 slot-lock 的 canonical 发送路径。同卡上的通用
    // "点击填入"(fillFromTemplate)+ 推荐示例点击(fillCommand)都不带 clone 锁 → 会
    // 发出"…创建为…"无锁 OOV 命令,后端 shift handler 抽不到 new_schedule_name → 退回
    // 追问、像没执行(见 KP #21 端点能力 vs 前端假设)。故对表单卡隐藏这两条通用无锁
    // 入口,只留表单锁定路。判据是"卡片有无专属表单",非硬编 clone;别的表单卡同理。
    isManualFormCard(item) {
      return !!(item && item.formType)
    },
    showManualTemplateFill(item) {
      return !!this.getManualTemplate(item) && !this.isManualFormCard(item)
    },
    showManualExamples(item) {
      return !this.isManualFormCard(item)
    },
    resolveManualItem(item, variantKey = '') {
      if (!this.hasManualVariants(item)) return item || {}
      const key = variantKey || this.getManualVariant(item)
      const variant = (item.variants && item.variants[key]) || {}
      return {
        ...item,
        ...variant,
        id: item.id,
        title: item.title
      }
    },
    setManualVariant(item, value) {
      if (!this.hasManualVariants(item)) return
      const nextVariant = String(value || '').trim()
      if (!nextVariant) return
      const currentVariant = this.getManualVariant(item)
      if (currentVariant === nextVariant) return
      const currentItem = this.resolveManualItem(item, currentVariant)
      const nextItem = this.resolveManualItem(item, nextVariant)
      const currentSelections = { ...(this.slotSelections[item.id] || {}) }
      const nextKeys = Object.keys(nextItem.slotMap || {})
      const nextSelections = {}
      nextKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(currentSelections, key)) {
          nextSelections[key] = currentSelections[key]
        }
      })
      Object.keys(nextItem.slotMap || {}).forEach((key) => {
        const slotMeta = nextItem.slotMap[key]
        if (['calendarDate', 'calendarDateRange', 'calendarDateWithMode'].includes(slotMeta?.type)) {
          delete nextSelections[key]
        }
      })
      this.$set(this.manualVariantState, item.id, nextVariant)
      this.$set(this.slotSelections, item.id, nextSelections)
      this.resetCalendarSlots(item, currentItem)
      this.resetCalendarSlots(item, nextItem)
      if (this.hasTaskSlot(nextItem) && this.getSelectedScheduleValue(item)) {
        this.ensureTaskOptionsForItem(item)
      }
      if (this.hasTaskSlot(currentItem) && !this.hasTaskSlot(nextItem)) {
        this.resetDependentTaskSlots(item, currentItem)
      }
    },
    resetCalendarSlots(item, manualItem = null) {
      const resolvedItem = manualItem || this.resolveManualItem(item)
      const itemId = this.normalizeManualItemId(item)
      const calendarKeys = Object.keys(resolvedItem.slotMap || {}).filter((key) => {
        const slotMeta = resolvedItem.slotMap[key]
        return ['calendarDate', 'calendarDateRange', 'calendarDateWithMode'].includes(slotMeta?.type)
      })
      if (!calendarKeys.length) return
      calendarKeys.forEach((calendarKey) => {
        this.resetCalendarDateState(itemId, calendarKey)
        if (this.slotSelections[itemId] && this.slotSelections[itemId][calendarKey]) {
          this.$delete(this.slotSelections[itemId], calendarKey)
        }
      })
    },
    hasTaskSlot(item) {
      return Object.values((item && item.slotMap) || {}).some((slot) => slot && slot.type === 'task')
    },
    getManualOpen(moduleId) {
      return this.manualOpenMap[moduleId] || ''
    },
    setManualOpen(moduleId, value) {
      this.$set(this.manualOpenMap, moduleId, value)
    },
    setManualTabFromContext() {
      const path = this.$route?.path || ''
      if (path.includes('device-status')) {
        this.manualActiveTab = 'terminal'
        return
      }
      if (path.includes('scheduler') || path.includes('plans')) {
        this.manualActiveTab = 'schedule'
        return
      }
      if (path.includes('file-broadcast') || path.includes('live-cast')) {
        this.manualActiveTab = 'playback'
        return
      }
      if (path.includes('tasks')) {
        this.manualActiveTab = 'query'
        return
      }
      this.manualActiveTab = 'terminal'
    },
    startTipTimer() {
      if (this.manualTipTimer) return
      this.manualTipTimer = window.setInterval(() => {
        this.manualTipIndex = (this.manualTipIndex + 1) % this.manualTips.length
      }, 4500)
    },
    stopTipTimer() {
      if (this.manualTipTimer) {
        clearInterval(this.manualTipTimer)
        this.manualTipTimer = null
      }
    },
    normalizeAssistantLogs(data) {
      const list = Array.isArray(data?.items) ? data.items : []
      return list
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
          id: `${index}-${item.text || ''}-${item.reply || ''}`,
          text: item.text || '',
          reply: item.reply || '',
          action_log: Array.isArray(item.action_log)
            ? item.action_log.filter((entry) => entry && typeof entry === 'object')
            : [],
          created_at: item.created_at || ''
        }))
    },
    formatRequestErrorMessage(err, requestPath, fallbackText, scene = 'generic') {
      return mapHttpErrorToUserMessage(err, {
        scene,
        fallbackText,
        requestPath
      })
    },
    isAssistantUnavailableError(err) {
      const status = err?.response?.status
      return !err?.response || status >= 500
    },
    async fetchAssistantLogs() {
      if (this.historyLoading) return
      this.historyLoading = true
      try {
        const base = process.env.VUE_APP_BASE_API || ''
        const requestPath = `${base}/data/assistant_command_logs`
        const { data } = await api.get(requestPath, {
          params: { limit: 100 }
        })
        this.historyEntries = this.normalizeAssistantLogs(data)
      } catch (err) {
        if (this.historyDrawer) {
          const requestPath = `${process.env.VUE_APP_BASE_API || ''}/data/assistant_command_logs`
          this.$message.error(
            this.formatRequestErrorMessage(err, requestPath, '成功日志加载失败，请检查后端接口', 'assistant_logs')
          )
        }
      } finally {
        this.historyLoading = false
      }
    },
    normalizeAssistantSettingsOptions(items, fallback) {
      const normalized = Array.isArray(items)
        ? items.map((item) => String(item || '').trim()).filter(Boolean)
        : []
      return normalized.length ? normalized : fallback.slice()
    },
    applyAssistantSettings(data) {
      this.defaultScheduleKind = String(data?.default_schedule_kind || '').trim()
      this.defaultScheduleSeason = String(data?.default_schedule_season || '').trim()
      this.allowedScheduleKinds = this.normalizeAssistantSettingsOptions(
        data?.allowed_schedule_kinds,
        DEFAULT_ALLOWED_SCHEDULE_KINDS
      )
      this.allowedScheduleSeasons = this.normalizeAssistantSettingsOptions(
        data?.allowed_schedule_seasons,
        DEFAULT_ALLOWED_SCHEDULE_SEASONS
      )
    },
    async fetchAssistantSettings(options = {}) {
      if (this.assistantSettingsLoading) return
      this.assistantSettingsLoading = true
      try {
        const base = process.env.VUE_APP_BASE_API || ''
        const requestPath = `${base}/data/assistant_settings`
        const { data } = await api.get(requestPath)
        this.applyAssistantSettings(data)
      } catch (err) {
        if (!options.silent) {
          const requestPath = `${process.env.VUE_APP_BASE_API || ''}/data/assistant_settings`
          this.$message.error(
            this.formatRequestErrorMessage(err, requestPath, '作息模板配置加载失败，请检查后端接口', 'assistant_settings')
          )
        }
      } finally {
        this.assistantSettingsLoading = false
      }
    },
    async saveAssistantSettings(payload) {
      if (this.assistantSettingsSaving) return
      this.assistantSettingsSaving = true
      try {
        const base = process.env.VUE_APP_BASE_API || ''
        const requestPath = `${base}/data/assistant_settings`
        const { data } = await api.put(requestPath, payload)
        this.applyAssistantSettings(data)
        this.schoolKindPopoverVisible = false
        this.$message.success(
          this.scheduleTemplateSelectionLabel
            ? `默认作息模板已设置为${this.scheduleTemplateSelectionLabel}`
            : '已清空默认作息模板'
        )
      } catch (err) {
        const requestPath = `${process.env.VUE_APP_BASE_API || ''}/data/assistant_settings`
        this.$message.error(
          this.formatRequestErrorMessage(err, requestPath, '作息模板配置保存失败，请检查后端接口', 'assistant_settings')
        )
        await this.fetchAssistantSettings({ silent: true })
      } finally {
        this.assistantSettingsSaving = false
      }
    },
    async handleScheduleKindChange(value) {
      const nextValue = String(value || '').trim()
      await this.saveAssistantSettings({
        default_schedule_kind: nextValue,
        default_schedule_season: this.defaultScheduleSeason
      })
    },
    async handleScheduleSeasonChange(value) {
      const nextValue = String(value || '').trim()
      await this.saveAssistantSettings({
        default_schedule_kind: this.defaultScheduleKind,
        default_schedule_season: nextValue
      })
    },
    getManualTemplate(item) {
      return this.resolveManualItem(item)?.template || ''
    },
    parseTemplate(item) {
      const manualItem = this.resolveManualItem(item)
      const template = manualItem?.template || ''
      const parts = []
      const regex = /\[([^\]]+)\]/g
      let lastIndex = 0
      let match
      while ((match = regex.exec(template)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', text: template.slice(lastIndex, match.index) })
        }
        const key = match[1]
        const slotMeta = (manualItem.slotMap && manualItem.slotMap[key]) || { type: 'text', display: key }
        parts.push({
          type: 'slot',
          key,
          slotType: slotMeta.type || 'text',
          display: slotMeta.display || key,
          dependsOn: slotMeta.dependsOn || '',
          presets: Array.isArray(slotMeta.presets) ? slotMeta.presets : [],
          options: Array.isArray(slotMeta.options) ? slotMeta.options : []
        })
        lastIndex = match.index + match[0].length
      }
      if (lastIndex < template.length) {
        parts.push({ type: 'text', text: template.slice(lastIndex) })
      }
      return parts
    },
    normalizeManualItemId(itemOrId) {
      if (itemOrId && typeof itemOrId === 'object') return itemOrId.id
      return itemOrId
    },
    getSlotValue(itemOrId, key) {
      const itemId = this.normalizeManualItemId(itemOrId)
      return (this.slotSelections[itemId] || {})[key] || ''
    },
    getSlotPopoverKey(itemOrId, segOrKey) {
      const itemId = this.normalizeManualItemId(itemOrId)
      const slotKey = typeof segOrKey === 'object' ? segOrKey.key : segOrKey
      return `${itemId}:${slotKey}`
    },
    getSlotPopoverVisible(itemOrId, segOrKey) {
      const popoverKey = this.getSlotPopoverKey(itemOrId, segOrKey)
      return Boolean(this.slotPopoverVisible[popoverKey])
    },
    setSlotPopoverVisible(itemOrId, segOrKey, visible) {
      const popoverKey = this.getSlotPopoverKey(itemOrId, segOrKey)
      this.$set(this.slotPopoverVisible, popoverKey, Boolean(visible))
    },
    setSlotValue(itemOrId, key, value) {
      const itemId = this.normalizeManualItemId(itemOrId)
      const previousValue = this.getSlotValue(itemId, key)
      if (!this.slotSelections[itemId]) {
        this.$set(this.slotSelections, itemId, {})
      }
      this.$set(this.slotSelections[itemId], key, value)
      if (itemOrId && typeof itemOrId === 'object') {
        const manualItem = this.resolveManualItem(itemOrId)
        const slotMeta = (manualItem.slotMap && manualItem.slotMap[key]) || {}
        if (slotMeta.type === 'schedule' && previousValue !== value) {
          this.resetDependentTaskSlots(itemOrId, manualItem)
          if (value) {
            this.ensureTaskOptionsForItem(itemOrId)
          }
        }
        // 原日期(被 task 槽 filterByDate 依赖的日期槽)变化 → 清掉换日后不再合法的已选任务。
        if (previousValue !== value) {
          this.pruneTaskSlotsForDateChange(itemOrId, manualItem, key)
        }
      }
    },
    pruneTaskSlotsForDateChange(item, manualItem, changedKey) {
      const slotMap = (manualItem && manualItem.slotMap) || {}
      const dependentTaskKeys = Object.keys(slotMap).filter((taskKey) => {
        const slotMeta = slotMap[taskKey]
        return slotMeta && slotMeta.type === 'task' && slotMeta.filterByDate === changedKey
      })
      if (!dependentTaskKeys.length) return
      const itemId = this.normalizeManualItemId(item)
      const selections = this.slotSelections[itemId]
      if (!selections) return
      const scheduleName = this.getSelectedScheduleValue(item)
      // 任务候选未加载时无法判定合法性,先不动已选值。
      if (!Array.isArray(this.taskOptionsBySchedule[scheduleName])) return
      const validValues = new Set(this.getTaskOptionsForItem(item).map((opt) => opt.value))
      dependentTaskKeys.forEach((taskKey) => {
        const selected = selections[taskKey]
        if (selected && !validValues.has(selected)) {
          this.$set(selections, taskKey, '')
        }
      })
    },
    resetDependentTaskSlots(item, manualItem = null) {
      const resolvedItem = manualItem || this.resolveManualItem(item)
      const taskKeys = Object.keys(resolvedItem.slotMap || {}).filter((key) => {
        const slotMeta = resolvedItem.slotMap[key]
        return slotMeta && slotMeta.type === 'task'
      })
      if (!taskKeys.length) return
      const itemId = this.normalizeManualItemId(item)
      if (!this.slotSelections[itemId]) return
      taskKeys.forEach((taskKey) => {
        if (this.slotSelections[itemId][taskKey]) {
          this.$set(this.slotSelections[itemId], taskKey, '')
        }
      })
    },
    getSlotDisplay(itemOrId, seg) {
      const value = this.getSlotValue(itemOrId, seg.key)
      return value || seg.display
    },
    isCalendarDateSlot(seg) {
      return seg?.slotType === 'calendarDate'
    },
    isCalendarDateRangeSlot(seg) {
      return seg?.slotType === 'calendarDateRange'
    },
    isCalendarDateWithModeSlot(seg) {
      return seg?.slotType === 'calendarDateWithMode'
    },
    isStructuredTimeSlot(seg) {
      return seg?.slotType === 'structuredTimeRange'
    },
    normalizeCalendarDate(value) {
      const text = String(value || '').trim()
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
    },
    parseCalendarRangeText(value) {
      const text = String(value || '').trim()
      if (!text) return []
      if (text.includes('到')) {
        const parts = text
          .split('到')
          .map((item) => this.normalizeCalendarDate(item))
          .filter(Boolean)
        if (parts.length >= 2) return [parts[0], parts[1]]
      }
      const single = this.normalizeCalendarDate(text)
      return single ? [single, single] : []
    },
    getCalendarDateState(itemOrId, key, slotType = 'calendarDate') {
      const itemId = this.normalizeManualItemId(itemOrId)
      const stateKey = `${itemId}:${key}`
      if (!this.calendarDateSelections[stateKey]) {
        const currentValue = this.getSlotValue(itemId, key)
        const range = this.parseCalendarRangeText(currentValue)
        this.$set(this.calendarDateSelections, stateKey, {
          mode: slotType === 'calendarDateWithMode' && range.length >= 2 && range[0] !== range[1] ? 'range' : 'single',
          date: range.length ? range[0] : this.normalizeCalendarDate(currentValue),
          range
        })
      }
      return this.calendarDateSelections[stateKey]
    },
    getCalendarDateField(itemOrId, key, field, slotType = 'calendarDateWithMode') {
      const state = this.getCalendarDateState(itemOrId, key, slotType)
      if (field === 'range') {
        return Array.isArray(state.range) ? state.range : []
      }
      return state[field] || ''
    },
    updateCalendarDateField(itemOrId, key, field, value, slotType = 'calendarDateWithMode') {
      const state = this.getCalendarDateState(itemOrId, key, slotType)
      if (field === 'range') {
        const range = Array.isArray(value)
          ? value.map((item) => this.normalizeCalendarDate(item)).filter(Boolean)
          : []
        this.$set(state, 'range', range.length >= 2 ? [range[0], range[1]] : [])
        return
      }
      this.$set(state, field, this.normalizeCalendarDate(value))
    },
    updateCalendarDateMode(itemOrId, key, mode) {
      const nextMode = mode === 'range' ? 'range' : 'single'
      const state = this.getCalendarDateState(itemOrId, key, 'calendarDateWithMode')
      this.$set(state, 'mode', nextMode)
      this.$set(state, 'date', '')
      this.$set(state, 'range', [])
      this.setSlotValue(itemOrId, key, '')
    },
    resetCalendarDateState(itemOrId, key) {
      const itemId = this.normalizeManualItemId(itemOrId)
      const stateKey = `${itemId}:${key}`
      if (this.calendarDateSelections[stateKey]) {
        this.$delete(this.calendarDateSelections, stateKey)
      }
    },
    clearCalendarField(itemOrId, key, slotType = 'calendarDate') {
      const state = this.getCalendarDateState(itemOrId, key, slotType)
      this.$set(state, 'date', '')
      this.$set(state, 'range', [])
      if (slotType === 'calendarDateWithMode') {
        this.$set(state, 'mode', 'single')
      }
      this.setSlotValue(itemOrId, key, '')
    },
    formatCalendarValue(itemOrId, key, slotType = 'calendarDate') {
      const state = this.getCalendarDateState(itemOrId, key, slotType)
      if (slotType === 'calendarDate') {
        return this.normalizeCalendarDate(state.date)
      }
      if (slotType === 'calendarDateRange') {
        const range = Array.isArray(state.range) ? state.range : []
        if (range.length < 2) return ''
        return `${range[0]}到${range[1]}`
      }
      if (state.mode === 'range') {
        const range = Array.isArray(state.range) ? state.range : []
        if (range.length < 2) return ''
        return `${range[0]}到${range[1]}`
      }
      return this.normalizeCalendarDate(state.date)
    },
    canConfirmCalendar(itemOrId, key, slotType = 'calendarDate') {
      return Boolean(this.formatCalendarValue(itemOrId, key, slotType))
    },
    getCalendarPreview(itemOrId, key, slotType = 'calendarDate') {
      const value = this.formatCalendarValue(itemOrId, key, slotType)
      return value ? `已选：${value}` : '已选：未完成'
    },
    confirmCalendarValue(itemOrId, key, slotType = 'calendarDate') {
      const value = this.formatCalendarValue(itemOrId, key, slotType)
      if (!value) return
      this.setSlotValue(itemOrId, key, value)
      this.setSlotPopoverVisible(itemOrId, key, false)
    },
    // T122: 结构化时段 = 日期锚点(今天 / 明天 / 后天)+ 起止时间(HH:MM),形如
    // "今天14:00到18:00"。反解成 { anchor, startTime, endTime },供选择器回显。
    parseStructuredTimeValue(value) {
      const text = String(value || '').trim()
      const presets = this.getStructuredTimePresets()
      const matchedPreset = presets.find((preset) => text.startsWith(preset))
      const anchor = matchedPreset || ''
      const remainder = matchedPreset ? text.slice(matchedPreset.length).trim() : text
      let startTime = ''
      let endTime = ''
      if (remainder.includes('到')) {
        const parts = remainder.split('到')
        startTime = this.normalizeClockTime(parts[0])
        endTime = this.normalizeClockTime(parts[1])
      }
      return { anchor, startTime, endTime }
    },
    // T122: 校验 / 归一 "HH:MM"(单选器给的值),非法返回 ''。
    normalizeClockTime(value) {
      const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
      if (!match) return ''
      const hh = Number(match[1])
      const mm = Number(match[2])
      if (hh > 23 || mm > 59) return ''
      return `${String(hh).padStart(2, '0')}:${match[2]}`
    },
    clockToMinutes(value) {
      const normalized = this.normalizeClockTime(value)
      if (!normalized) return -1
      const [hh, mm] = normalized.split(':').map(Number)
      return hh * 60 + mm
    },
    getStructuredTimePresets(seg = null) {
      if (Array.isArray(seg?.presets) && seg.presets.length) return seg.presets
      return ['今天', '明天', '后天', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
    },
    getStructuredTimeState(itemOrId, key) {
      const itemId = this.normalizeManualItemId(itemOrId)
      const stateKey = `${itemId}:${key}`
      if (!this.structuredTimeSelections[stateKey]) {
        const initial = this.parseStructuredTimeValue(this.getSlotValue(itemId, key))
        this.$set(this.structuredTimeSelections, stateKey, initial)
      }
      return this.structuredTimeSelections[stateKey]
    },
    getStructuredTimeField(itemOrId, key, field) {
      const state = this.getStructuredTimeState(itemOrId, key)
      return state[field] || ''
    },
    updateStructuredTimeField(itemOrId, key, field, value) {
      const state = this.getStructuredTimeState(itemOrId, key)
      this.$set(state, field, String(value || '').trim())
    },
    clearStructuredTimeField(itemOrId, key) {
      const state = this.getStructuredTimeState(itemOrId, key)
      this.$set(state, 'anchor', '')
      this.$set(state, 'startTime', '')
      this.$set(state, 'endTime', '')
      this.setSlotValue(itemOrId, key, '')
    },
    formatStructuredTimeValue(itemOrId, key) {
      const state = this.getStructuredTimeState(itemOrId, key)
      if (!state.anchor || !state.startTime || !state.endTime) return ''
      return `${state.anchor}${state.startTime}到${state.endTime}`
    },
    getStructuredTimeError(itemOrId, key) {
      const state = this.getStructuredTimeState(itemOrId, key)
      if (!state.anchor || !state.startTime || !state.endTime) {
        return ''
      }
      if (this.clockToMinutes(state.endTime) <= this.clockToMinutes(state.startTime)) {
        return '结束时间要晚于开始时间'
      }
      return ''
    },
    canConfirmStructuredTime(itemOrId, key) {
      const state = this.getStructuredTimeState(itemOrId, key)
      if (!state.anchor || !state.startTime || !state.endTime) return false
      return !this.getStructuredTimeError(itemOrId, key)
    },
    getStructuredTimePreview(itemOrId, key) {
      const value = this.formatStructuredTimeValue(itemOrId, key)
      return value ? `已选：${value}` : '已选：未完成'
    },
    confirmStructuredTime(itemOrId, key) {
      if (!this.canConfirmStructuredTime(itemOrId, key)) return
      const value = this.formatStructuredTimeValue(itemOrId, key)
      this.setSlotValue(itemOrId, key, value)
      this.setSlotPopoverVisible(itemOrId, key, false)
    },
    usesSelectableOptions(seg) {
      return ['terminal', 'zone', 'schedule', 'media', 'playMedia', 'target', 'task', 'broadcastTask', 'textChoice'].includes(seg?.slotType)
    },
    isScheduleSlot(seg) {
      return seg?.slotType === 'schedule'
    },
    getSlotOptions(type, item = null, seg = null) {
      if (type === 'target') {
        return this.slotOptions.target || []
      }
      if (type === 'task') {
        return this.getTaskOptionsForItem(item)
      }
      if (type === 'broadcastTask') {
        return this.slotOptions.broadcastTask || []
      }
      if (type === 'textChoice') {
        return (Array.isArray(seg?.options) ? seg.options : []).map((value) => ({
          label: String(value),
          value: String(value)
        }))
      }
      return this.slotOptions[type] || []
    },
    getSlotPlaceholder(item, seg) {
      if (seg?.slotType === 'task' && !this.getSelectedScheduleValue(item)) {
        return '先选方案'
      }
      if (seg?.slotType === 'broadcastTask') return '选择文件广播任务'
      if (seg?.slotType === 'schedule') return '选择方案'
      if (seg?.slotType === 'calendarDate') return '请选择日期'
      if (seg?.slotType === 'calendarDateRange') return '请选择日期范围'
      if (seg?.slotType === 'calendarDateWithMode') return '请选择单日或多日'
      if (seg?.slotType === 'structuredTimeRange') return '先选今天/明天/后天，再选起止时间'
      if (seg?.slotType === 'textChoice') return '请选择动作'
      if (this.usesSelectableOptions(seg)) return '选择或输入'
      return '请输入'
    },
    isSlotDisabled(item, seg) {
      if (seg?.slotType === 'task') {
        return !this.getSelectedScheduleValue(item)
      }
      return false
    },
    isSlotLoading(item, seg) {
      if (seg?.slotType === 'task') {
        const scheduleName = this.getSelectedScheduleValue(item)
        return Boolean(scheduleName && this.taskLoadingBySchedule[scheduleName])
      }
      if (seg?.slotType === 'broadcastTask') {
        return Boolean(this.slotLoading.broadcastTask)
      }
      return false
    },
    prepareSlotPicker(item, seg) {
      if (this.isStructuredTimeSlot(seg)) {
        this.getStructuredTimeState(item, seg.key)
        return
      }
      if (this.isCalendarDateSlot(seg) || this.isCalendarDateRangeSlot(seg) || this.isCalendarDateWithModeSlot(seg)) {
        this.getCalendarDateState(item, seg.key, seg.slotType)
        return
      }
      if (seg?.slotType === 'task') {
        this.ensureTaskOptionsForItem(item)
        return
      }
      if (seg?.slotType && !['text', 'structuredTimeRange', 'calendarDate', 'calendarDateRange', 'calendarDateWithMode', 'textChoice'].includes(seg.slotType)) {
        this.ensureSlotOptions(seg.slotType)
      }
    },
    getScheduleSlotKey(item) {
      const manualItem = this.resolveManualItem(item)
      return Object.keys(manualItem.slotMap || {}).find((key) => {
        const slotMeta = manualItem.slotMap[key]
        return slotMeta && slotMeta.type === 'schedule'
      }) || ''
    },
    getSelectedScheduleValue(item) {
      const scheduleKey = this.getScheduleSlotKey(item)
      return scheduleKey ? String(this.getSlotValue(item, scheduleKey) || '').trim() : ''
    },
    // T108: 找当前(变体解析后)slotMap 里 type==='task' 的槽 key。migrate/cancel 的
    // 任务变体各有一个;日期变体没有。swap 无任务槽,按日期对调,天然命不中。
    getTaskSlotKey(item) {
      const manualItem = this.resolveManualItem(item)
      return Object.keys(manualItem.slotMap || {}).find((key) => {
        const slotMeta = manualItem.slotMap[key]
        return slotMeta && slotMeta.type === 'task'
      }) || ''
    },
    getSelectedTaskValue(item) {
      const taskKey = this.getTaskSlotKey(item)
      return taskKey ? String(this.getSlotValue(item, taskKey) || '').trim() : ''
    },
    getScheduleOption(value) {
      const scheduleValue = String(value || '').trim()
      if (!scheduleValue) return null
      return (this.slotOptions.schedule || []).find((item) => item.value === scheduleValue) || null
    },
    isScheduleOptionEnabled(option) {
      return String(option?.status || '').trim() === '启用'
    },
    isSelectedScheduleEnabled(item, seg) {
      const value = this.getSlotValue(item, seg.key)
      return this.isScheduleOptionEnabled(this.getScheduleOption(value))
    },
    getTaskOptionsForItem(item) {
      const scheduleName = this.getSelectedScheduleValue(item)
      if (!scheduleName) return []
      const richTasks = this.taskOptionsBySchedule[scheduleName]
      if (!Array.isArray(richTasks)) return []
      const filtered = this.filterTaskOptionsBySourceDate(item, richTasks)
      return this.uniqueTaskOptions(filtered)
    },
    buildRichTaskOptions(tasks) {
      if (!Array.isArray(tasks)) return []
      return tasks
        .map((task) => {
          const name = this.pickTaskName(task)
          if (!name) return null
          const weekdays = Array.isArray(task?.weekdays)
            ? task.weekdays.map((day) => String(day).trim()).filter(Boolean)
            : []
          return {
            label: name,
            value: name,
            weekdays,
            startdate: String(task?.startdate || '').trim(),
            enddate: String(task?.enddate || '').trim()
          }
        })
        .filter(Boolean)
    },
    uniqueTaskOptions(list) {
      const seen = new Set()
      const result = []
      ;(Array.isArray(list) ? list : []).forEach((task) => {
        const value = String((task && task.value) || '').trim()
        if (!value || seen.has(value)) return
        seen.add(value)
        result.push({ label: task.label || value, value })
      })
      return result
    },
    getTaskFilterDateKey(item) {
      const manualItem = this.resolveManualItem(item)
      const slotMap = manualItem.slotMap || {}
      const taskKey = Object.keys(slotMap).find((key) => {
        const slotMeta = slotMap[key]
        return slotMeta && slotMeta.type === 'task' && slotMeta.filterByDate
      })
      return taskKey ? String(slotMap[taskKey].filterByDate) : ''
    },
    filterTaskOptionsBySourceDate(item, richTasks) {
      const filterKey = this.getTaskFilterDateKey(item)
      if (!filterKey) return richTasks
      const sourceDate = String(this.getSlotValue(item, filterKey) || '').trim()
      // 原日期未选 → 无法按周几过滤,展示全部(不破坏流程)。
      if (!sourceDate) return richTasks
      return richTasks.filter((task) => this.taskMatchesAnchorDate(task, sourceDate))
    },
    // 镜像后端 _task_matches_anchor(kind=='date', allow_recurring_date=True):
    // 选中日期 D 须落在 [startdate, enddate];循环任务(startdate≠enddate)须 weekday(D)∈weekdays;
    // 单日任务(startdate==enddate)仅匹配那天。日期跨度缺失(含 0-00-00)镜像后端判不匹配。
    taskMatchesAnchorDate(task, sourceDate) {
      const anchor = this.parseSlotDate(sourceDate)
      if (!anchor) return true
      const start = this.parseSlotDate(task && task.startdate)
      const end = this.parseSlotDate(task && task.enddate) || start
      if (!start || !end) return false
      const anchorTime = anchor.getTime()
      if (anchorTime < start.getTime() || anchorTime > end.getTime()) return false
      if (start.getTime() !== end.getTime()) {
        const weekdays = Array.isArray(task && task.weekdays) ? task.weekdays : []
        // weekdays 为空时不按周几过滤(镜像后端 `if weekdays:`)。
        if (weekdays.length && !weekdays.includes(this.weekdayLabelFromDate(anchor))) {
          return false
        }
      }
      return true
    },
    parseSlotDate(value) {
      const text = String(value || '').trim()
      if (!text || text === '0-00-00' || text === '0000-00-00') return null
      const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text)
      if (!match) return null
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      if (month < 1 || month > 12 || day < 1 || day > 31) return null
      return new Date(year, month - 1, day)
    },
    weekdayLabelFromDate(date) {
      // Date.getDay(): 0=周日,1=周一 … 6=周六;后端口径 周一..周日。
      const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return labels[date.getDay()] || ''
    },
    async ensureTaskOptionsForItem(item, options = {}) {
      const scheduleName = this.getSelectedScheduleValue(item)
      if (!scheduleName) return
      const force = Boolean(options.force)
      const existing = this.taskOptionsBySchedule[scheduleName]
      if (!force && Array.isArray(existing)) return
      if (this.taskLoadingBySchedule[scheduleName]) return
      this.$set(this.taskLoadingBySchedule, scheduleName, true)
      try {
        const base = process.env.VUE_APP_BASE_API || ''
        const requestPath = `${base}/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}/tasks`
        const { data } = await api.get(requestPath, { params: { _ts: Date.now() }})
        const tasks = Array.isArray(data?.tasks) ? data.tasks : []
        // 缓存富 task(name + weekdays + 日期跨度),供 getTaskOptionsForItem 按原日期过滤。
        this.$set(this.taskOptionsBySchedule, scheduleName, this.buildRichTaskOptions(tasks))
      } catch (err) {
        if (this.manualDrawer) {
          const requestPath = `${process.env.VUE_APP_BASE_API || ''}/data/broadcast_schedules/schedules/${encodeURIComponent(scheduleName)}/tasks`
          this.$message.error(
            this.formatRequestErrorMessage(err, requestPath, `方案“${scheduleName}”的任务列表加载失败`, 'page_data')
          )
        }
      } finally {
        this.$set(this.taskLoadingBySchedule, scheduleName, false)
      }
    },
    collectRefreshActions(payload = {}) {
      const actions = new Set()
      const intent = String(payload?.intent || '').trim()
      if (intent) actions.add(intent)
      const logs = Array.isArray(payload?.action_log) ? payload.action_log : []
      logs.forEach((item) => {
        const action = String(item?.action || '').trim()
        if (action) actions.add(action)
      })
      return actions
    },
    hasAnyAction(actions, candidates) {
      return candidates.some((item) => actions.has(item))
    },
    resetSlotOptions(types = []) {
      const uniqueTypes = Array.from(new Set((Array.isArray(types) ? types : []).filter(Boolean)))
      uniqueTypes.forEach((type) => {
        if (type === 'target') {
          this.slotOptions.target = []
          return
        }
        if (Object.prototype.hasOwnProperty.call(this.slotOptions, type)) {
          this.slotOptions[type] = []
        }
      })
      if (uniqueTypes.includes('terminal') || uniqueTypes.includes('zone')) {
        this.slotOptions.target = []
      }
      if (uniqueTypes.includes('schedule') || uniqueTypes.includes('task') || uniqueTypes.includes('broadcastTask')) {
        this.taskOptionsBySchedule = {}
        this.taskLoadingBySchedule = {}
      }
    },
    refreshManualSlotOptions(options = {}) {
      const types = Array.isArray(options.types) && options.types.length
        ? options.types
        : ['terminal', 'zone', 'schedule', 'media', 'playMedia', 'broadcastTask']
      types.forEach((type) => this.ensureSlotOptions(type, { force: Boolean(options.force) }))
    },
    buildSlotRequestParams(type, force = false) {
      const params = { _ts: Date.now() }
      if (force && (type === 'terminal' || type === 'zone')) {
        params.force = true
      }
      if (type === 'playMedia') {
        params.folderid = 3
      }
      return params
    },
    ensureSlotOptions(type, options = {}) {
      const force = Boolean(options.force)
      if (type === 'target') {
        this.ensureSlotOptions('terminal', options)
        this.ensureSlotOptions('zone', options)
        return
      }
      const existing = this.slotOptions[type]
      if (!force && Array.isArray(existing) && existing.length) return
      if (this.slotLoading[type]) return
      const base = process.env.VUE_APP_BASE_API || ''
      const params = this.buildSlotRequestParams(type, force)
      if (type === 'terminal') {
        this.slotLoading.terminal = true
        api.get(`${base}/terminal/terminalinfo`, { params })
          .then(({ data }) => {
            const list = this.normalizeList(data)
            this.slotOptions.terminal = this.uniqueOptions(list)
            this.syncTargetOptions()
          })
          .finally(() => {
            this.slotLoading.terminal = false
          })
      }
      if (type === 'zone') {
        this.slotLoading.zone = true
        api.get(`${base}/terminal/terzone`, { params })
          .then(({ data }) => {
            const list = this.normalizeList(data)
            this.slotOptions.zone = this.uniqueOptions(list)
            this.syncTargetOptions()
          })
          .finally(() => {
            this.slotLoading.zone = false
          })
      }
      if (type === 'schedule') {
        this.slotLoading.schedule = true
        api.get(`${base}/data/broadcast_schedules`, { params })
          .then(({ data }) => {
            const schedules = Array.isArray(data?.schedules) ? data.schedules : []
            this.slotOptions.schedule = this.normalizeScheduleOptions(schedules)
          })
          .finally(() => {
            this.slotLoading.schedule = false
          })
      }
      if (type === 'media' || type === 'playMedia') {
        this.slotLoading[type] = true
        api.get(`${base}/data/all_audio`, { params })
          .then(({ data }) => {
            const list = this.normalizeList(data, ['name', 'medianame', 'audio'])
            this.slotOptions[type] = this.uniqueOptions(list)
          })
          .finally(() => {
            this.slotLoading[type] = false
          })
      }
      if (type === 'broadcastTask') {
        this.slotLoading.broadcastTask = true
        api.get(`${base}/data/broadcast_schedules/broadcasts`, { params })
          .then(({ data }) => {
            const broadcasts = Array.isArray(data?.broadcasts) ? data.broadcasts : []
            const names = broadcasts.map((task) => this.pickTaskName(task)).filter(Boolean)
            this.slotOptions.broadcastTask = this.uniqueOptions(names)
          })
          .finally(() => {
            this.slotLoading.broadcastTask = false
          })
      }
    },
    normalizeScheduleOptions(list) {
      const optionMap = new Map()
      list.forEach((item) => {
        if (!item || typeof item !== 'object') return
        const value = String(item.schedule_name || item.name || '').trim()
        if (!value) return
        const status = String(item.status || '启用').trim() || '启用'
        const existing = optionMap.get(value)
        if (!existing || (existing.status !== '启用' && status === '启用')) {
          optionMap.set(value, {
            label: value,
            value,
            status,
            displayLabel: status === '启用' ? `${value} (启动)` : value
          })
        }
      })
      return Array.from(optionMap.values())
    },
    normalizeList(data, keys = ['name', 'terminalname', 'terminalName', 'zonename', 'zoneName', 'label']) {
      if (Array.isArray(data)) {
        return data.map((item) => this.pickName(item, keys)).filter(Boolean)
      }
      if (data && typeof data === 'object') {
        const list = data.data || data.rows || data.list || []
        if (Array.isArray(list)) {
          return list.map((item) => this.pickName(item, keys)).filter(Boolean)
        }
      }
      return []
    },
    pickName(item, keys) {
      if (!item || typeof item !== 'object') return ''
      for (const key of keys) {
        if (item[key]) return String(item[key])
      }
      return ''
    },
    pickTaskName(item) {
      if (!item || typeof item !== 'object') return ''
      return String(item.taskname || item.task_name || item.name || item.customName || '').trim()
    },
    uniqueOptions(list) {
      const seen = new Set()
      return list
        .map((value) => String(value).trim())
        .filter((value) => value && !seen.has(value) && seen.add(value))
        .map((value) => ({ label: value, value }))
    },
    syncTargetOptions() {
      const targets = [
        ...(this.slotOptions.zone || []).map((item) => item.value),
        ...(this.slotOptions.terminal || []).map((item) => item.value)
      ]
      this.slotOptions.target = this.uniqueOptions(targets)
    },
    fillCommand(text) {
      if (!text) return
      // T100: 任何填入(示例 / 复制方案 / 模板)都先清掉上一次没发出的锁定
      // directive;fillFromTemplate 会在本方法返回后再按需重新写入。
      this.pendingLockedDirective = null
      this.command = text
      this.manualDrawer = false
      this.$nextTick(() => {
        const input = this.$refs.commandInput
        if (input && typeof input.focus === 'function') {
          input.focus()
        }
      })
    },
    fillFromTemplate(item) {
      const segments = this.parseTemplate(item)
      const text = segments.map((seg) => {
        if (seg.type === 'text') return seg.text
        const value = this.getSlotValue(item, seg.key)
        return value || seg.display
      }).join('')
      this.fillCommand(text)
      // T100: 拍平成纯文本会丢掉用户的结构化选择(意图 + 方案身份)。只有指令大全
      // 的作息命令、且方案是从真列表选中的(非 allow-create 手打)才记锁定 directive。
      this.pendingLockedDirective = this.buildLockedDirective(item, text)
    },
    // T100: 把 item 里 textChoice 槽(启用 / 停用)的选中值取出来。
    getManualTextChoiceValue(item) {
      const manualItem = this.resolveManualItem(item)
      const key = Object.keys(manualItem.slotMap || {}).find((slotKey) => {
        const slotMeta = manualItem.slotMap[slotKey]
        return slotMeta && slotMeta.type === 'textChoice'
      })
      return key ? String(this.getSlotValue(item, key) || '').trim() : ''
    },
    // T100: 把当前 item 的结构化选择映射成后端可锁定的 intent。不在作息 scope、
    // 或启用 / 停用未选 → 返回 '',上层据此不锁。
    resolveManualLockedIntent(item) {
      const id = this.normalizeManualItemId(item)
      if (id === 'schedule-enable') {
        return MANUAL_SCHEDULE_ENABLE_CHOICE_INTENT[this.getManualTextChoiceValue(item)] || ''
      }
      return MANUAL_SCHEDULE_INTENT_MAP[id] || ''
    },
    // T100: 只有"指令大全作息命令 + 方案从真列表选中"才产出锁定 directive。方案是
    // allow-create 手打的列表外值(getScheduleOption 命不中)→ 返回 null,退回纯文本
    // NLU——锁错方案身份比不锁更糟,任何不确定就不锁。
    buildLockedDirective(item, text) {
      const intent = this.resolveManualLockedIntent(item)
      if (!intent) return null
      // 带方案槽的作息命令(启用 / 停用 / 迁移 / 交换):方案必须从真列表选中才锁,
      // 手打列表外值命不中 getScheduleOption → 不锁(退回 NLU),锁错方案身份比不锁更糟。
      const scheduleKey = this.getScheduleSlotKey(item)
      if (scheduleKey) {
        const scheduleValue = this.getSelectedScheduleValue(item)
        if (!scheduleValue) return null
        if (!this.getScheduleOption(scheduleValue)) return null
        const slots = { [LOCKED_SCHEDULE_SLOT_KEY]: scheduleValue }
        // T108: migrate/cancel"任务"变体——用户从下拉选了具体任务时,把选中的任务名
        // 也锁进 locked_slots.task_name。否则任务名被拍平进 text 走 NLU,中文任务名欠
        // 抽取(T90 B2b)→ task_name 空 → 后端 phase-1 anchor 过滤短路 → 当天全表命中。
        // 仅当 task 槽存在且已选中才锁;日期变体(无 task 槽)不锁,保住"挪当天全部"。
        const taskValue = this.getSelectedTaskValue(item)
        if (taskValue) {
          slots[LOCKED_TASK_SLOT_KEY] = taskValue
        }
        return { text, intent, slots }
      }
      // T122: 无方案槽的取消命令(按天 / 按时段)——语义 = 跨所有启用方案 + 当天定时
      // 文件广播,不锁方案(留空 → 后端枚举所有启用方案 + 折入广播)。只锁 intent +
      // 结构化时段(time_range_start/end),彻底跳 NLU。仅 cancel_schedule 走此分支。
      if (intent !== 'cancel_schedule') return null
      const scopeSlots = this.resolveCancelScopeLockedSlots(item)
      if (!scopeSlots) return null
      return { text, intent, slots: scopeSlots }
    },
    // T122: 把"按天 / 按时段"变体选中的结构化日期 / 时段,解析成后端 cancel 时间上下文
    // 认的两个键(_resolve_cancel_schedule_time_context 读 time_range_start /
    // time_range_end,api_public.py:7807-7808)。格式 "YYYY-MM-DD HH:MM"(与后端
    // _parse_phase1_date → _parse_datetime 一致,见 test time_range_start "2026-03-23 08:00")。
    // 同时锁 schedule_scope='enabled_all'(f1 BLOCKER)——否则空 schedule_name + 2+ 启用
    // 方案会掉 target_disambiguation / 当天有广播时静默只删广播丢作息任务。
    // 不完整(未选全)→ 返回 null → 不锁,退回 text NLU。
    resolveCancelScopeLockedSlots(item) {
      const manualItem = this.resolveManualItem(item)
      const slotMap = manualItem.slotMap || {}
      const timeKey = Object.keys(slotMap).find((key) => {
        const meta = slotMap[key]
        return meta && meta.type === 'structuredTimeRange'
      })
      if (timeKey) {
        // 按时段:anchor(今天 / 明天 / 后天)解析成具体日期,拼上起止时间。
        const state = this.getStructuredTimeState(item, timeKey)
        const startTime = this.normalizeClockTime(state.startTime)
        const endTime = this.normalizeClockTime(state.endTime)
        if (!state.anchor || !startTime || !endTime) return null
        if (this.clockToMinutes(endTime) <= this.clockToMinutes(startTime)) return null
        const date = this.resolveStructuredAnchorDate(state.anchor)
        if (!date) return null
        return {
          time_range_start: `${date} ${startTime}`,
          time_range_end: `${date} ${endTime}`,
          [LOCKED_SCHEDULE_SCOPE_KEY]: LOCKED_SCHEDULE_SCOPE_ALL
        }
      }
      const dateKey = Object.keys(slotMap).find((key) => {
        const meta = slotMap[key]
        return meta && meta.type === 'calendarDateWithMode'
      })
      if (dateKey) {
        // 按天:单日 → 整天 [00:00, 23:59];日期区间 "A到B" → [A 00:00, B 23:59]。
        // 后端 _task_matches_range 对 00:00~23:59 窗口覆盖全天所有任务(已核对)。
        const range = this.parseCalendarRangeText(this.getSlotValue(item, dateKey))
        if (range.length < 2) return null
        return {
          time_range_start: `${range[0]} 00:00`,
          time_range_end: `${range[1]} 23:59`,
          [LOCKED_SCHEDULE_SCOPE_KEY]: LOCKED_SCHEDULE_SCOPE_ALL
        }
      }
      return null
    },
    // T122: 把相对日期锚点解析成具体 YYYY-MM-DD(FE 端定死,不依赖后端"今天"解析,
    // 避免 FE/BE 跨日边界漂移,见 KP #23)。只认 今天 / 明天 / 后天,其余返回 ''。
    resolveStructuredAnchorDate(anchor) {
      const offsets = { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2 }
      const key = String(anchor || '').trim()
      if (!(key in offsets)) return ''
      const target = new Date()
      target.setHours(0, 0, 0, 0)
      target.setDate(target.getDate() + offsets[key])
      const yyyy = target.getFullYear()
      const mm = String(target.getMonth() + 1).padStart(2, '0')
      const dd = String(target.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    },
    // T100: 发送时一次性消费锁定 directive。始终清掉(one-shot,防污染后续命令),
    // 仅当待发文本仍与模板填出的原文逐字相同(用户没改过)时才返回锁。
    consumeLockedDirective(text) {
      const pending = this.pendingLockedDirective
      this.pendingLockedDirective = null
      if (!pending || pending.text !== text) return null
      return pending
    },
    formatRequired(item) {
      const manualItem = this.resolveManualItem(item)
      if (!manualItem.required || !manualItem.required.length) return ['无需参数']
      return manualItem.required
    },
    updateCloneForm(key, value) {
      this.$set(this.formState.cloneSchedule, key, value)
    },
    applyCloneSchedule() {
      const source = String(this.formState.cloneSchedule.source || '').trim() || '春季作息'
      const rawOffset = Number(this.formState.cloneSchedule.offset)
      const offset = Number.isFinite(rawOffset) ? rawOffset : 0
      const name = String(this.formState.cloneSchedule.name || '').trim() || '新作息'
      const magnitude = Math.abs(offset)
      // 后端 shift handler 要求位移量 > 0(offset<=0 会被拒并退回追问),前端先拦。
      if (magnitude <= 0) {
        this.$message.warning('偏移时间要大于 0 分钟')
        return
      }
      const offsetText = `${magnitude}分钟`
      const direction = offset >= 0 ? '往后推迟' : '往前提前'
      const sentence = `请复制“${source}”，所有任务${direction}${offsetText}，创建为“${name}”。`
      // T105: 复制表单三值都是显式结构化输入,直接接 slot-locking(T99/T100 机制)绕开
      // "创建为"OOV —— 该词在锁定训练集 0 样本,纯 NLU 抽不到 new_schedule_name,后端
      // shift handler 硬要新名 → 退回追问、像没执行(见 T101 报告 / KP #21 端点能力 vs 前端假设)。
      // 方向靠 intent 区分(shift_schedule_later/earlier),time_offset 传正数量级(handler 内部按
      // intent 决定正负、要求 > 0)。源方案直接锁——后端 _strict_resolve_schedule 对真库校验,查无即
      // not-found,安全。fillCommand 会清 pendingLockedDirective,故先填文本、再写锁(同 fillFromTemplate)。
      this.fillCommand(sentence)
      this.pendingLockedDirective = {
        text: sentence,
        intent: offset >= 0 ? 'shift_schedule_later' : 'shift_schedule_earlier',
        slots: {
          schedule_name: source,
          new_schedule_name: name,
          time_offset: offsetText
        }
      }
    },
    startDrag(e) {
      if (this.isMobileLayout) return
      this.dragState = {
        startX: e.clientX,
        startY: e.clientY,
        originLeft: this.position.left,
        originTop: this.position.top
      }
      document.addEventListener('mousemove', this.onDrag)
      document.addEventListener('mouseup', this.stopDrag)
    },
    onDrag(e) {
      if (this.isMobileLayout) return
      if (!this.dragState) return
      const deltaX = e.clientX - this.dragState.startX
      const deltaY = e.clientY - this.dragState.startY
      const nextLeft = this.dragState.originLeft + deltaX
      const nextTop = this.dragState.originTop + deltaY
      const maxLeft = window.innerWidth - this.panelWidth - 12
      const maxTop = window.innerHeight - 100
      this.position.left = Math.min(Math.max(12, nextLeft), maxLeft)
      this.position.top = Math.min(Math.max(60, nextTop), maxTop)
    },
    stopDrag() {
      this.dragState = null
      this.removeDragListeners()
    },
    removeDragListeners() {
      document.removeEventListener('mousemove', this.onDrag)
      document.removeEventListener('mouseup', this.stopDrag)
    },
    missingSlotsText(list) {
      if (!list || !list.length) return '无'
      return list.join('、')
    },
    pushMessage(role, text, meta = null, options = {}) {
      const message = {
        id: `${Date.now()}-${Math.random()}`,
        role,
        text,
        meta,
        pending: Boolean(options.pending)
      }
      this.conversation.push(message)
      this.$nextTick(() => {
        const box = this.$refs.chatBox
        if (box) box.scrollTop = box.scrollHeight
      })
      return message.id
    },
    replaceMessage(messageId, patch) {
      const index = this.conversation.findIndex((item) => item.id === messageId)
      if (index < 0) {
        return false
      }
      const current = this.conversation[index]
      const next = {
        ...current,
        ...(patch || {})
      }
      this.$set(this.conversation, index, next)
      // Pseudo-stream: when an AI bubble flips out of pending=true with a
      // fresh text, reveal it character-by-character. Skipped when text
      // looks like it has HTML markup (we don't want to truncate mid-tag
      // and emit malformed DOM).
      if (next.role === 'ai' && !next.pending && current.pending) {
        this.startBubbleStream(next)
      }
      this.$nextTick(() => {
        const box = this.$refs.chatBox
        if (box) box.scrollTop = box.scrollHeight
      })
      return true
    },
    aiBubbleText(msg) {
      // While streaming we paint the partial slice; otherwise fall through
      // to the original full text (which may contain v-html markup).
      if (msg && msg.streaming && typeof msg.streamText === 'string') {
        return msg.streamText
      }
      return msg ? msg.text : ''
    },
    startBubbleStream(msg) {
      if (!msg || typeof msg.text !== 'string') return
      const fullText = msg.text
      // Skip animation for empty / very short messages and anything that
      // looks like HTML — partial HTML would corrupt the DOM.
      if (fullText.length < 4 || /<[a-z!\/]/i.test(fullText)) {
        return
      }
      // Cancel any previous streamer on this message (defensive — same
      // message shouldn't normally stream twice but reload paths exist).
      this.stopBubbleStream(msg)
      const id = msg.id
      this.$set(msg, 'streaming', true)
      this.$set(msg, 'streamText', '')
      // ~2 chars per 28ms — 200-char history summary reveals in ~2.8s,
      // 50-char reply in ~0.7s. Long messages auto-accelerate so we
      // don't take ages on the timeline summary.
      const charsPerTick = Math.max(2, Math.ceil(fullText.length / 80))
      let cursor = 0
      msg.streamHandle = setInterval(() => {
        // Re-find the message every tick — array index can shift if other
        // messages are pushed concurrently and we always want the live
        // reactive proxy, not a stale closure reference.
        const live = (this.conversation || []).find((item) => item && item.id === id)
        if (!live) {
          clearInterval(msg.streamHandle)
          return
        }
        cursor = Math.min(fullText.length, cursor + charsPerTick)
        this.$set(live, 'streamText', fullText.slice(0, cursor))
        if (cursor >= fullText.length) {
          clearInterval(live.streamHandle)
          this.$set(live, 'streamHandle', null)
          this.$set(live, 'streaming', false)
        } else {
          // Keep the scroll glued to the bottom while text grows.
          this.$nextTick(() => {
            const box = this.$refs.chatBox
            if (box) box.scrollTop = box.scrollHeight
          })
        }
      }, 28)
    },
    stopBubbleStream(msg) {
      if (msg && msg.streamHandle) {
        clearInterval(msg.streamHandle)
        this.$set(msg, 'streamHandle', null)
        this.$set(msg, 'streaming', false)
      }
    },
    computeThinkingLabel(userInput, elapsedSec) {
      // Map the user's text (raw chat input OR a choice button value
      // like "once" / "permanent") to a context-aware "正在 X" label so
      // slow operations don't all look identical. Hand-tuned because the
      // mapping needs to be cheap + deterministic — no NLU dependency
      // and zero false positives are required.
      const t = String(userInput || '').trim().toLowerCase()
      const raw = String(userInput || '').trim()
      let label = '深度思考中'
      if (!raw) return label
      if (t === 'once' || raw.includes('一次性') || raw.includes('仅这一次')) {
        label = '正在执行一次性操作'
      } else if (t === 'permanent' || raw.includes('永久')) {
        label = '正在永久应用改动'
      } else if (t === 'confirm' || raw.includes('继续切换')) {
        label = '正在切换'
      } else if (raw.includes('创建') || raw.includes('新建')) {
        label = '正在创建作息方案'
      } else if (raw.includes('删除') && (raw.includes('作息') || raw.includes('方案'))) {
        label = '正在删除作息'
      } else if (raw.includes('播放')) {
        label = '正在准备播放'
      } else if (raw.includes('取消')) {
        label = '正在取消任务'
      } else if (raw.includes('挪到') || raw.includes('挪动') || raw.includes('改时间') || raw.includes('改到')) {
        label = '正在调整时间'
      } else if (raw.includes('对调') || raw.includes('互换') || raw.includes('交换')) {
        label = '正在互换任务'
      } else if (raw.includes('换成') || raw.includes('替换')) {
        label = '正在替换音频'
      } else if (raw.includes('音量')) {
        label = '正在调整音量'
      } else if (raw.includes('停止') || raw.includes('暂停')) {
        label = '正在停止任务'
      } else if (raw.includes('今天做了什么') || raw.includes('回顾') || raw.includes('看看历史')) {
        label = '正在回顾历史'
      }
      return label
    },
    computeThinkingDetail(elapsedSec) {
      // Time-based escalation so the user knows the system isn't stuck
      // when an op genuinely takes 4-5s (remote broadcast server can
      // be slow). 3s and 6s are the empirical breakpoints where users
      // start wondering if something hung.
      if (elapsedSec >= 6) return '远端响应较慢,请稍等…'
      if (elapsedSec >= 3) return '正在与广播服务器通讯…'
      return ''
    },
    ensureThinkingTicker() {
      if (this.thinkingTicker) return
      const tick = () => {
        let anyPending = false
        for (const msg of this.conversation || []) {
          if (!msg || !msg.pending || !msg.thinkingStartedAt) continue
          anyPending = true
          const elapsedSec = Math.floor((Date.now() - msg.thinkingStartedAt) / 1000)
          const newLabel = this.computeThinkingLabel(msg.thinkingInput, elapsedSec)
          if (msg.thinkingLabel !== newLabel) {
            this.$set(msg, 'thinkingLabel', newLabel)
          }
          const newDetail = this.computeThinkingDetail(elapsedSec)
          if (msg.thinkingDetail !== newDetail) {
            this.$set(msg, 'thinkingDetail', newDetail)
          }
        }
        if (!anyPending) {
          this.stopThinkingTicker()
        }
      }
      this.thinkingTicker = setInterval(tick, 1000)
    },
    stopThinkingTicker() {
      if (this.thinkingTicker) {
        clearInterval(this.thinkingTicker)
        this.thinkingTicker = null
      }
    },
    async maybeFetchImpactPreview(messageId, data) {
      // For once_or_permanent confirmations, hit
      // /data/schedule_impact_preview so we can tell the user how many
      // future occurrences "永久修改" actually affects BEFORE they click.
      // Fire-and-forget: timeout / 4xx / network errors silently fall
      // through — preview is decoration, not gating.
      const confirmKind = String(data && data.confirm_kind || '').trim()
      if (confirmKind !== 'once_or_permanent') return
      const pa = data.pending_action || {}
      const scheduleName = String(pa.schedule_name || '').trim()
      const rawTaskIds = Array.isArray(pa.task_ids) ? pa.task_ids : []
      const taskIds = rawTaskIds.map((id) => String(id || '').trim()).filter(Boolean)
      if (!scheduleName) return
      const base = process.env.VUE_APP_BASE_API || ''
      try {
        const params = {
          schedule_name: scheduleName,
          days: 14
        }
        if (taskIds.length) params.task_ids = taskIds.join(',')
        const { data: preview } = await api.get(`${base}/data/schedule_impact_preview`, { params })
        const total = Number(preview && preview.total_effective_occurrences) || 0
        if (total <= 0) return
        const msg = (this.conversation || []).find((m) => m && m.id === messageId)
        if (!msg || !msg.meta) return
        const hintLine = `选择「永久修改」会影响未来 14 天的 ${total} 次触发。`
        const nextMeta = { ...msg.meta }
        nextMeta.impact_preview = {
          total_effective_occurrences: total,
          schedule_name: scheduleName,
          days: 14
        }
        if (nextMeta.pending_action) {
          const existingHint = String(nextMeta.pending_action.hint || '').trim()
          nextMeta.pending_action = {
            ...nextMeta.pending_action,
            hint: existingHint ? `${existingHint} ${hintLine}` : hintLine
          }
        }
        this.$set(msg, 'meta', nextMeta)
      } catch (err) {
        // Decoration only — don't surface fetch errors.
      }
    },
    formatActionLog(actionLog) {
      if (!Array.isArray(actionLog) || !actionLog.length) return ''
      const labels = {
        set_task: '新增任务',
        task_cancel: '删除任务',
        task_migrate: '迁移任务',
        play_now: '立即播放',
        task_status: '状态切换',
        volume_adjust: '音量调整'
      }
      return actionLog.map((entry) => {
        const label = labels[entry.action] || entry.action || '操作'
        const ids = Array.isArray(entry.task_ids) ? entry.task_ids.join(', ') : ''
        const schedule = entry.schedule_name || '-'
        const timeRange = entry.time_range
        const rangeText = timeRange?.start || timeRange?.end
          ? `${timeRange?.start || ''} ~ ${timeRange?.end || ''}`.trim()
          : '无'
        const newRange = entry.new_time_range
        const newRangeText = newRange?.start || newRange?.end
          ? `${newRange?.start || ''} ~ ${newRange?.end || ''}`.trim()
          : ''
        const detailParts = []
        if (entry.details?.status) detailParts.push(`状态: ${entry.details.status}`)
        if (entry.details?.volume !== undefined) detailParts.push(`音量: ${entry.details.volume}`)
        if (entry.details?.audio) detailParts.push(`音频: ${entry.details.audio}`)
        const details = detailParts.length ? ` (${detailParts.join('，')})` : ''
        const newRangeLine = newRangeText ? `，新时间: ${newRangeText}` : ''
        return `${label}${details}\n排程: ${schedule}\n任务ID: ${ids || '无'}\n时间: ${rangeText}${newRangeLine}`
      }).join('\n\n')
    },
    isWarningMessage(text) {
      if (!text) return false
      return text.includes('⚠️') || text.includes('断线') || text.includes('播放失败')
    },
    normalizeDiagnostics(list) {
      if (!Array.isArray(list)) return []
      return list.filter((item) => item && typeof item === 'object').map((item) => ({
        diagnostic_id: item.diagnostic_id || '',
        action: item.action || '',
        phase: item.phase || '',
        path: item.path || '',
        request_payload: item.request_payload ?? null,
        status_code: item.status_code ?? null,
        elapsed_ms: item.elapsed_ms ?? null,
        ok: Boolean(item.ok),
        response_body: item.response_body ?? null,
        error_detail: item.error_detail || '',
        timeout: Boolean(item.timeout)
      }))
    },
    shouldShowDiagnostics(meta) {
      return Boolean(
        this.aiDiagnosticsEnabled &&
        meta &&
        Array.isArray(meta.diagnostics) &&
        meta.diagnostics.length
      )
    },
    formatDiagnosticValue(value) {
      if (value === null || value === undefined || value === '') return '-'
      if (typeof value === 'string') return value
      try {
        return JSON.stringify(value, null, 2)
      } catch (err) {
        return String(value)
      }
    },
    formatDiagnosticStatus(diag) {
      if (!diag) return '-'
      const status = diag.timeout ? 'timeout' : (diag.status_code ?? '-')
      return diag.ok ? `成功 ${status}` : `失败 ${status}`
    },
    formatDiagnosticElapsed(diag) {
      if (!diag || diag.elapsed_ms === null || diag.elapsed_ms === undefined || diag.elapsed_ms === '') {
        return '-'
      }
      return `${diag.elapsed_ms} ms`
    },
    normalizeUndoToken(rawToken) {
      // Backend may emit two undo shapes; the discriminator is `kind`.
      //   kind=once_override → {override_ids:[...], endpoint:/undo}
      //   kind=runtime_play_stop → {task_ids:[...], endpoint:/stop}
      // Legacy entries persisted before the kind field existed only carry
      // override_ids, so we infer the kind from that fallback shape.
      if (!rawToken || typeof rawToken !== 'object') return null
      const overrideIds = Array.isArray(rawToken.override_ids)
        ? rawToken.override_ids.map((id) => String(id || '').trim()).filter(Boolean)
        : []
      const taskIds = Array.isArray(rawToken.task_ids)
        ? rawToken.task_ids.map((id) => String(id || '').trim()).filter(Boolean)
        : []
      let kind = String(rawToken.kind || '').trim()
      if (!kind) {
        if (taskIds.length) kind = 'runtime_play_stop'
        else if (overrideIds.length) kind = 'once_override'
      }
      if (!kind) return null
      if (kind === 'runtime_play_stop' && !taskIds.length) return null
      if (kind === 'once_override' && !overrideIds.length) return null
      return {
        kind,
        override_ids: overrideIds,
        task_ids: taskIds,
        summary: String(rawToken.summary || '').trim(),
        expires_at: String(rawToken.expires_at || '').trim(),
        expired: rawToken.expired === true
      }
    },
    hasUndoToken(meta) {
      const ok = Boolean(this.normalizeUndoToken(meta && meta.undo_token))
      if (ok) this.ensureUndoTicker()
      return ok
    },
    isOnceCancelActionLog(actionLog) {
      // T75: true when this turn was a one-time cancel (cancel_schedule +
      // mode=once). Such cancels auto-restore at their end time, so the undo
      // button is redundant. Driven off the authoritative action_log entry
      // (action + mode), not the reply text.
      if (!Array.isArray(actionLog)) return false
      return actionLog.some(
        (item) =>
          item &&
          String(item.action || '') === 'cancel_schedule' &&
          String(item.mode || '') === 'once'
      )
    },
    shouldShowUndo(msg) {
      // T75: gate the undo panel — show only when a live undo token exists AND
      // this is not a once-cancel (whose undo is meaningless).
      if (!msg || !this.hasUndoToken(msg.meta)) return false
      if (msg.meta && msg.meta.cancel_once_no_undo) return false
      return true
    },
    undoSecondsLeft(token) {
      if (!token || !token.expires_at) return null
      const parsed = Date.parse(token.expires_at.replace(' ', 'T'))
      if (isNaN(parsed)) return null
      // undoNowTick is read here so Vue tracks the dependency and re-runs
      // this getter every second. Date.now() alone wouldn't trigger
      // reactivity because it's not a tracked field.
      const now = this.undoNowTick || Date.now()
      return Math.max(0, Math.ceil((parsed - now) / 1000))
    },
    isUndoDisabled(msg) {
      if (!msg || msg.undo_in_flight || msg.undo_done) return true
      const token = this.normalizeUndoToken(msg.meta && msg.meta.undo_token)
      if (!token) return true
      if (token.expired) return true
      const left = this.undoSecondsLeft(token)
      if (left !== null && left <= 0) return true
      return false
    },
    undoDeadlineLabel(token) {
      // T80: format the expiry moment as "截止 HH:MM" (or "截止 M月D日 HH:MM"
      // when it falls on a later day) for the far-future case, instead of a
      // bare seconds countdown that would read like "(28140s)".
      if (!token || !token.expires_at) return ''
      const parsed = new Date(token.expires_at.replace(' ', 'T'))
      if (isNaN(parsed.getTime())) return ''
      const hh = String(parsed.getHours()).padStart(2, '0')
      const mm = String(parsed.getMinutes()).padStart(2, '0')
      const now = new Date(this.undoNowTick || Date.now())
      const sameDay = parsed.getFullYear() === now.getFullYear() &&
        parsed.getMonth() === now.getMonth() &&
        parsed.getDate() === now.getDate()
      if (sameDay) return `截止 ${hh}:${mm}`
      return `截止 ${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hh}:${mm}`
    },
    undoButtonLabel(msg) {
      if (msg && msg.undo_done) return '已撤销'
      if (msg && msg.undo_in_flight) return '撤销中…'
      const token = this.normalizeUndoToken(msg && msg.meta && msg.meta.undo_token)
      if (!token) return '撤销'
      if (token.expired) return '撤销已过期'
      const summary = token.summary ? `「${token.summary}」` : ''
      const left = this.undoSecondsLeft(token)
      if (left === null) {
        return `撤销${summary}`
      }
      if (left <= 0) return '撤销已过期'
      // T80: the undo window now lasts until the latest affected task passes
      // (often hours away). Show a "截止 HH:MM" deadline for the far case and
      // keep the live (Ns) countdown only in the final stretch.
      if (left > 120) {
        return `撤销${summary}（${this.undoDeadlineLabel(token)}）`
      }
      return `撤销${summary}(${left}s)`
    },
    ensureUndoTicker() {
      // Idempotent: starts a 1Hz interval that just bumps undoNowTick so
      // any undo button that reads undoSecondsLeft re-renders. Stops
      // automatically when no live undo token remains in the conversation.
      if (this.undoTickHandle) return
      const tick = () => {
        this.undoNowTick = Date.now()
        if (!this.anyLiveUndoToken()) {
          this.stopUndoTicker()
        }
      }
      this.undoTickHandle = setInterval(tick, 1000)
    },
    stopUndoTicker() {
      if (this.undoTickHandle) {
        clearInterval(this.undoTickHandle)
        this.undoTickHandle = null
      }
    },
    anyLiveUndoToken() {
      const conv = this.conversation || []
      for (const msg of conv) {
        if (!msg || msg.role !== 'ai') continue
        if (msg.undo_done) continue
        const token = this.normalizeUndoToken(msg.meta && msg.meta.undo_token)
        if (!token) continue
        const left = this.undoSecondsLeft(token)
        // null = no expires_at → keep ticking (never expires)
        // 0 = expired → not "live" anymore
        if (left === null || left > 0) return true
      }
      return false
    },
    async submitUndo(msg) {
      if (!msg || this.isUndoDisabled(msg)) return
      const token = this.normalizeUndoToken(msg.meta && msg.meta.undo_token)
      if (!token) return
      this.$set(msg, 'undo_in_flight', true)
      const base = process.env.VUE_APP_BASE_API || ''
      try {
        if (token.kind === 'runtime_play_stop') {
          await api.post(`${base}/data/runtime_play_tasks/stop`, {
            task_ids: token.task_ids
          })
        } else if (token.kind === 'once_override') {
          // Multiple override_ids → undo them sequentially. Backend rejects
          // already-undone ids with 409, which we treat as "already done"
          // (someone else clicked first) instead of surfacing as an error.
          for (const oid of token.override_ids) {
            try {
              await api.post(
                `${base}/data/task_overrides/once/${encodeURIComponent(oid)}/undo`,
                {}
              )
            } catch (err) {
              const status = err && err.response && err.response.status
              if (status !== 409 && status !== 410) throw err
            }
          }
        } else {
          throw new Error(`unknown undo kind: ${token.kind}`)
        }
        this.$set(msg, 'undo_done', true)
        this.$message({ type: 'success', message: '已撤销。', duration: 2000 })
        this.fetchAssistantLogs && this.fetchAssistantLogs()
      } catch (err) {
        const message = (err && err.response && err.response.data && err.response.data.detail)
          || (err && err.message)
          || '撤销失败，请稍后再试。'
        this.$message({ type: 'error', message: String(message), duration: 4000 })
      } finally {
        this.$set(msg, 'undo_in_flight', false)
      }
    },
    mergePendingChoices(data) {
      // Backend may surface choices in two places:
      // 1. data.pending_action.choices — the legacy nested form used for
      //    target_disambiguation / weekday_disambiguation.
      // 2. data.choices (top-level) — the structured render hint added in
      //    backend commit e72117a. Carries once-or-permanent / interrupt
      //    confirmation buttons that don't live in pending_action.
      // If (1) is already populated, leave it. Otherwise splice (2) into
      // a synthetic pending_action so the existing button panel renders.
      if (!data || typeof data !== 'object') return null
      const rawPending = data.pending_action && typeof data.pending_action === 'object'
        ? { ...data.pending_action }
        : null
      const pendingChoices = rawPending && Array.isArray(rawPending.choices) ? rawPending.choices : []
      const topChoices = Array.isArray(data.choices) ? data.choices : []
      if (pendingChoices.length) {
        return rawPending
      }
      if (!topChoices.length) {
        return rawPending
      }
      const confirmKind = String(data.confirm_kind || '').trim()
      // Per-kind panel titles — kept brief so they don't duplicate the
      // bubble text. normalizePendingAction will use this as the title.
      const titleByKind = {
        once_or_permanent: '请选择执行方式',
        interrupt_switch: '请确认是否切换',
        target_disambig: '请从候选项中选择',
        weekday_disambig: '请选择对应的周几',
        quick_actions: '试试这些常用操作'
      }
      const synthesizedTitle = titleByKind[confirmKind] || ''
      return {
        ...(rawPending || {}),
        kind: rawPending?.kind || confirmKind || 'inline_choices',
        choices: topChoices,
        title: rawPending?.title || synthesizedTitle || rawPending?.prompt || ''
      }
    },
    normalizePendingAction(pendingAction) {
      if (!pendingAction || typeof pendingAction !== 'object') return null
      const rawChoices = Array.isArray(pendingAction.choices) ? pendingAction.choices : []
      const choices = rawChoices
        .map((choice, index) => {
          if (choice === null || choice === undefined || choice === '') {
            return null
          }
          if (typeof choice === 'string') {
            const label = choice.trim()
            if (!label) return null
            return {
              key: `${index}-${label}`,
              label,
              value: label,
              description: ''
            }
          }
          if (typeof choice !== 'object') {
            const label = String(choice).trim()
            if (!label) return null
            return {
              key: `${index}-${label}`,
              label,
              value: label,
              description: ''
            }
          }
          const label = String(choice.label || choice.text || choice.name || choice.value || '').trim()
          if (!label) return null
          const value = String(choice.value || choice.text || choice.label || label).trim()
          return {
            key: String(choice.id || choice.key || `${index}-${value}`),
            label,
            value,
            description: String(choice.description || choice.hint || choice.detail || '').trim()
          }
        })
        .filter(Boolean)
      if (!choices.length) return null
      return {
        title: String(pendingAction.title || pendingAction.prompt || '请从候选项中选择一个目标。'),
        hint: String(pendingAction.hint || pendingAction.message || '').trim(),
        choices
      }
    },
    hasPendingChoices(meta) {
      return Boolean(this.normalizePendingAction(meta && meta.pending_action))
    },
    getPendingChoices(meta) {
      const normalized = this.normalizePendingAction(meta && meta.pending_action)
      return normalized ? normalized.choices : []
    },
    getPendingTitle(meta) {
      const normalized = this.normalizePendingAction(meta && meta.pending_action)
      return normalized ? normalized.title : ''
    },
    getPendingHint(meta) {
      const normalized = this.normalizePendingAction(meta && meta.pending_action)
      return normalized ? normalized.hint : ''
    },
    normalizeDialogStateDetail(meta) {
      return String(meta?.dialog_state_detail || '').trim()
    },
    getDialogStateBadge(meta) {
      const detail = this.normalizeDialogStateDetail(meta)
      if (detail === 'confirm_interrupt_switch') return '切换确认'
      return ''
    },
    async submitAssistantText(userText) {
      if (this.aiLoading) return
      const text = String(userText || '').trim()
      if (!text) return
      // T100: 一次性取出锁定 directive(只对指令大全作息命令 + 列表选中方案生效,
      // 且待发文本没被改过)。别的路径(手打 / 待选项确认)拿到 null,行为不变。
      const lockedDirective = this.consumeLockedDirective(text)
      this.pushMessage('user', text)
      this.aiLoading = true
      const startedAt = Date.now()
      const initialLabel = this.computeThinkingLabel(text, 0)
      const pendingId = this.pushMessage('ai', '', null, {
        pending: true,
        thinkingLabel: initialLabel,
        thinkingDetail: '',
        thinkingInput: text,
        thinkingStartedAt: startedAt
      })
      this.pendingAssistantMessageId = pendingId
      this.ensureThinkingTicker()
      try {
        const base = process.env.VUE_APP_BASE_API || ''
        const requestPath = `${base}/assistant/chat`
        const requestBody = { text }
        if (lockedDirective) {
          // T99 契约:独立结构化字段,后端直接读、不解析、覆盖 NLU 结果。
          requestBody.locked_intent = lockedDirective.intent
          requestBody.locked_slots = lockedDirective.slots
        }
        const { data } = await api.post(requestPath, requestBody)
        const speech = data.output_speech || data.reply || '已收到指令。'
        const diagnostics = this.normalizeDiagnostics(data.diagnostics)
        const mergedPending = this.mergePendingChoices(data)
        const pendingAction = this.normalizePendingAction(mergedPending)
        const undoToken = this.normalizeUndoToken(data.undo_token)
        // T75: a one-time (mode=once) cancel auto-restores at its end time, so
        // the "撤销" button is redundant noise — suppress it for once-cancel.
        // The action_log carries the authoritative action+mode, so derive the
        // flag from there and stash it on meta for the undo-panel v-if gate.
        const cancelOnceNoUndo = this.isOnceCancelActionLog(data.action_log)
        const replaced = this.replaceMessage(pendingId, {
          text: speech,
          meta: {
            intent: data.intent,
            confidence: data.confidence,
            dialog_state_detail: data.dialog_state_detail,
            missing_slots: data.missing_slots,
            diagnostics,
            pending_action: pendingAction ? { ...(mergedPending || data.pending_action || {}), choices: pendingAction.choices } : null,
            undo_token: undoToken,
            cancel_once_no_undo: cancelOnceNoUndo
          },
          pending: false
        })
        if (!replaced) {
          this.pushMessage('ai', speech, {
            intent: data.intent,
            confidence: data.confidence,
            dialog_state_detail: data.dialog_state_detail,
            missing_slots: data.missing_slots,
            diagnostics,
            pending_action: pendingAction ? { ...(mergedPending || data.pending_action || {}), choices: pendingAction.choices } : null,
            undo_token: undoToken,
            cancel_once_no_undo: cancelOnceNoUndo
          })
        }
        // Fire-and-forget: when this turn is awaiting once-or-permanent
        // confirmation, fetch /data/schedule_impact_preview and append
        // a "未来 14 天会影响 N 次" hint into the pending panel so the
        // user knows the blast radius BEFORE clicking 永久修改.
        this.maybeFetchImpactPreview(pendingId, data)
        const actionLog = Array.isArray(data.action_log) ? data.action_log : []
        if (actionLog.length) {
          this.fetchAssistantLogs()
        }
        const runtimeScope = actionLog.reduce((scope, item) => {
          if (scope) return scope
          const detailScope = String(item?.details?.runtime_scope || '').trim()
          if (detailScope) return detailScope
          return String(item?.action || '').trim() === 'play_media' ? 'temp_task' : ''
        }, '')
        const warnings = Array.isArray(data.warnings) ? data.warnings : []
        if (warnings.length) {
          warnings.forEach((warning) => {
            const title = warning?.title || '设备异常警告'
            const message = warning?.content || warning?.message || ''
            if (message) {
              this.$notify({
                title,
                message,
                type: 'error',
                duration: 0
              })
            }
          })
        }
        const missingSlots = Array.isArray(data.missing_slots) ? data.missing_slots : []
        const dialogStateDetail = String(data.dialog_state_detail || 'complete').trim() || 'complete'
        const refreshIntents = [
          'create_schedule',
          'delete_schedule',
          'move_schedule',
          'swap_schedule',
          'cancel_schedule',
          'enable_schedule',
          'disable_schedule',
          'shift_schedule_later',
          'shift_schedule_earlier',
          'replace_media',
          'replace_media_in_task',
          'create_zone',
          'delete_zone',
          'enable_terminal',
          'disable_terminal',
          'add_terminal_to_zone',
          'remove_terminal_from_zone',
          'add_terminal_to_task',
          'remove_terminal_from_task',
          'play_media',
          'play_task',
          'stop_task',
          'pause_task',
          'resume_task',
          'adjust_volume'
        ]
        const shouldRefresh = actionLog.length || (
          !missingSlots.length &&
          dialogStateDetail === 'complete' &&
          refreshIntents.includes(data.intent)
        )
        if (shouldRefresh) {
          const refreshPayload = {
            intent: data.intent,
            slots: data.slots,
            action_log: actionLog,
            dialog_state_detail: dialogStateDetail,
            runtime_scope: runtimeScope || undefined
          }
          try {
            const scheduleResp = await api.get(`${base}/data/broadcast_schedules`, { params: { _ts: Date.now() }})
            emitAssistantRefresh({
              ...refreshPayload,
              schedules: scheduleResp.data
            })
          } catch (err) {
            emitAssistantRefresh(refreshPayload)
          }
        }
      } catch (err) {
        const requestPath = `${process.env.VUE_APP_BASE_API || ''}/assistant/chat`
        const failureText = this.isAssistantUnavailableError(err)
          ? '当前网络不稳定，请重新发送。'
          : this.formatRequestErrorMessage(err, requestPath, '助手调用失败，请检查后端接口', 'assistant_chat')
        const replaced = this.replaceMessage(pendingId, {
          text: failureText,
          meta: null,
          pending: false
        })
        if (!replaced) {
          this.pushMessage('ai', failureText)
        }
      } finally {
        if (this.pendingAssistantMessageId === pendingId) {
          this.pendingAssistantMessageId = null
        }
        this.aiLoading = false
      }
    },
    async sendToAssistant() {
      const userText = String(this.command || '').trim()
      if (!userText) {
        this.$message.warning('请先输入指令文本')
        return
      }
      this.command = ''
      await this.submitAssistantText(userText)
    },
    async submitPendingChoice(choice) {
      if (!choice || this.aiLoading) return
      const text = String(choice.value || choice.label || '').trim()
      if (!text) return
      try {
        await this.submitAssistantText(text)
      } catch (err) {
        // submitAssistantText already rendered the failure bubble.
      }
    },
    handleEnter(e) {
      if (e.shiftKey) return
      this.sendToAssistant()
    },
    onCommandFocus() {
      // Open suggestion dropdown on focus. Loading history if it hasn't
      // been fetched yet is fire-and-forget — suggestions fall back to
      // templates while waiting.
      this.suggestionsOpen = true
      if (!this.historyEntries || !this.historyEntries.length) {
        if (typeof this.fetchAssistantLogs === 'function') {
          this.fetchAssistantLogs()
        }
      }
    },
    onCommandBlur() {
      // Defer the close so a click-on-suggestion still has time to land
      // before the dropdown disappears. The @mousedown.prevent on the
      // panel itself blocks textarea blur in normal cases, but mobile
      // taps don't always honor that, so belt-and-braces with a delay.
      if (this.suggestionBlurHandle) clearTimeout(this.suggestionBlurHandle)
      this.suggestionBlurHandle = setTimeout(() => {
        this.suggestionsOpen = false
      }, 150)
    },
    applySuggestion(item) {
      if (!item || !item.text) return
      // T100: 采用历史 / 建议是一次全新的用户选择,清掉任何没发出的模板锁定
      // directive(这条命令不来自指令大全结构化选择,不该带锁)。
      this.pendingLockedDirective = null
      this.command = item.text
      this.suggestionsOpen = false
      this.$nextTick(() => {
        const input = this.$refs.commandInput
        if (input && input.focus) input.focus()
      })
    },
    acceptTopSuggestion() {
      // Tab key handler — adopt the first suggestion if present,
      // otherwise let Tab fall through to default behavior. (We
      // prevent default unconditionally in the @keydown.tab.prevent
      // listener so the textarea doesn't insert a tab character;
      // when there's no suggestion to accept, focus just stays put.)
      const top = (this.currentSuggestions || [])[0]
      if (top) this.applySuggestion(top)
    }
  }
}
</script>

<style lang="scss" scoped>
.ai-assistant-root {
  position: relative;
  z-index: 2000;
}

.ai-float {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 320px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 14px 28px rgba(31, 45, 61, 0.16);
  z-index: 2000;
  cursor: default;
  transition: box-shadow 0.2s ease;
}

.ai-mobile-trigger {
  position: fixed;
  right: calc(16px + var(--safe-right));
  bottom: calc(16px + var(--safe-bottom));
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #1f2d3d 0%, #2f6fbf 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 16px 32px rgba(31, 45, 61, 0.24);
}

.ai-ball {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #1f2d3d 0%, #2f6fbf 100%);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(31, 45, 61, 0.28);
  z-index: 2000;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.ai-ball:hover {
  transform: scale(1.06);
  box-shadow: 0 16px 30px rgba(31, 45, 61, 0.32);
}

.ai-float.collapsed {
  width: 320px;
  height: 46px;
  overflow: hidden;
}

.ai-float.collapsed .ai-header {
  border-bottom: none;
}

.ai-float:hover {
  box-shadow: 0 18px 32px rgba(31, 45, 61, 0.2);
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
  cursor: move;
  user-select: none;
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #1f2d3d;
  font-weight: 600;
  flex-shrink: 0;
}

.header-school-kind {
  display: inline-flex;
  align-items: center;
}

.school-kind-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #d5e2f5;
  border-radius: 999px;
  background: #f7fbff;
  color: #426189;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.school-kind-chip:hover,
.school-kind-chip:focus {
  outline: none;
  border-color: #a9c7f2;
  background: #edf5ff;
  color: #2c4f7a;
}

.school-kind-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.school-kind-popover-title {
  font-size: 12px;
  font-weight: 600;
  color: #324057;
}

.school-kind-popover-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.school-kind-popover-label {
  font-size: 12px;
  color: #5b6b82;
}

.school-kind-popover-select {
  width: 100%;
}

.actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

::v-deep .header-log-btn {
  padding: 7px 10px;
  border: 1px solid #dbe4f1;
  border-radius: 10px;
  background: #f8fbff;
  color: #5b6b82;
}

::v-deep .header-log-btn:hover,
::v-deep .header-log-btn:focus {
  color: #409eff;
  border-color: #bfd8ff;
  background: #edf5ff;
}

.ai-body {
  padding: 12px;
}

.desc {
  margin: 0 0 8px;
  color: #5e6d82;
  font-size: 13px;
}

.assistant-template-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 6px 10px;
  border: 1px solid #e7edf5;
  border-radius: 10px;
  background: linear-gradient(135deg, #fdfefe, #f4f8ff);
}

.assistant-template-label {
  flex-shrink: 0;
  font-size: 12px;
  color: #909399;
}

.assistant-settings-card {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid #e7edf5;
  border-radius: 10px;
  background: linear-gradient(135deg, #fdfefe, #f4f8ff);
}

.assistant-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.assistant-settings-row + .assistant-settings-row {
  margin-top: 8px;
}

.assistant-settings-select {
  min-width: 160px;
}

.assistant-settings-label {
  font-size: 13px;
  font-weight: 600;
  color: #324057;
  white-space: nowrap;
}

.assistant-settings-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7a90;
  line-height: 1.5;
}

.assistant-settings-warning {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #fff4e8;
  color: #c4561a;
  font-size: 12px;
  line-height: 1.5;
}

.chat-box {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
  background: #f9fbff;
  user-select: text;
  -webkit-user-select: text;
}

.chat-line {
  display: flex;
  margin-bottom: 6px;
}

.chat-line.user {
  justify-content: flex-end;
}

.chat-line.ai {
  justify-content: flex-start;
}

.bubble {
  max-width: 90%;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(31, 45, 61, 0.08);
  font-size: 13px;
  color: #1f2d3d;
  user-select: text;
  -webkit-user-select: text;
}

.chat-line.user .bubble {
  background: #ecf5ff;
}

.bubble-pending {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  color: #606266;
}

.chat-line.ai .bubble-warning {
  background: #fff1f0;
  border: 1px solid #ffccc7;
  color: #cf1322;
}

.chat-line.ai .bubble-warning .text {
  color: inherit;
}

.text {
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

.thinking-text {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  color: #606266;
}

.thinking-detail {
  width: 100%;
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.thinking-dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  animation: thinking-dot-bounce 1s infinite ease-in-out;
}

.thinking-dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.thinking-dots i:nth-child(3) {
  animation-delay: 0.3s;
}

.dialog-state-badge {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef3f8;
  color: #51606f;
  font-size: 12px;
  font-weight: 600;
}

.dialog-state-badge.is-confirm {
  background: #fff4e5;
  color: #b26a00;
}

@keyframes thinking-dot-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

.diagnostic-panel {
  margin-top: 8px;
  border-top: 1px dashed #dcdfe6;
  padding-top: 8px;
}

.pending-panel {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #d9e6ff;
  background: linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
}

.pending-title {
  font-size: 12px;
  font-weight: 600;
  color: #1f2d3d;
}

.pending-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #627083;
}

.pending-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.pending-choice {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  white-space: normal;
  line-height: 1.3;
  text-align: left;
}

.undo-panel {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}

.undo-button {
  white-space: normal;
  line-height: 1.3;
}

.command-input-wrap {
  position: relative;
}

.command-suggestions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  padding-bottom: 2px;
  overflow-x: auto;
  white-space: nowrap;
}

.suggestion-row-label {
  flex-shrink: 0;
  font-size: 11px;
  color: #909399;
}

.suggestion-row-tab {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 6px;
  font-size: 11px;
  color: #4f8cff;
}

.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 150px;
  padding: 3px 9px;
  border: 1px solid #dcdfe6;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #303133;
  transition: background 0.15s, border-color 0.15s;

  &:hover { background: #f0f7ff; border-color: #4f8cff; }
  &.source-history { background: #ecf5ff; border-color: #d6e8ff; }
}

.suggestion-icon {
  flex-shrink: 0;
  color: #4f8cff;
}

.source-template .suggestion-icon {
  color: #e6a23c;
}

.suggestion-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text.is-streaming::after {
  content: '▋';
  display: inline-block;
  margin-left: 2px;
  color: #4f8cff;
  animation: streamCursorBlink 0.9s steps(2, end) infinite;
  font-weight: 400;
}

@keyframes streamCursorBlink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.pending-choice-main {
  font-weight: 600;
}

.pending-choice-sub {
  margin-top: 2px;
  font-size: 11px;
  color: #627083;
}

.diagnostic-details summary {
  cursor: pointer;
  color: #409eff;
  font-size: 12px;
  outline: none;
}

.diagnostic-item {
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  background: #f5f7fa;
}

.diagnostic-item.failed {
  background: #fff7e6;
  border: 1px solid #ffd591;
}

.diagnostic-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}

.diagnostic-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.diagnostic-label {
  min-width: 88px;
  color: #909399;
  flex-shrink: 0;
}

.diagnostic-failure {
  margin-top: 8px;
}

.diagnostic-block {
  margin-top: 6px;
}

.diagnostic-block pre {
  margin: 4px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: #1f2937;
  color: #f9fafb;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
}

.meta {
  margin-top: 4px;
  color: #5e6d82;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.placeholder {
  color: #909399;
  text-align: center;
  font-size: 13px;
  padding: 12px 0;
}

.ai-actions {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}

::v-deep .manual-drawer {
  .el-drawer__body {
    padding: 0;
    height: 100%;
  }
}

::v-deep .log-drawer {
  .el-drawer__body {
    padding: 0;
    height: 100%;
  }
}

.log-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f6f8fb;
  color: #1f2d3d;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, #fffaf0, #ffffff 60%);
  border-bottom: 1px solid #e6ebf5;
}

.log-title {
  font-size: 16px;
  font-weight: 600;
}

.log-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7a90;
}

.log-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.log-body {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.log-card {
  background: #fff;
  border: 1px solid #e8eef7;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 18px rgba(31, 45, 61, 0.06);
}

.log-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.log-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.5;
}

.log-card-time {
  flex-shrink: 0;
  font-size: 12px;
  color: #8a94a6;
}

.log-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #6b7a90;
}

.log-card-row {
  margin-top: 10px;
}

.log-card-label {
  font-size: 12px;
  color: #8a94a6;
  margin-bottom: 4px;
}

.log-card-value {
  font-size: 13px;
  color: #1f2d3d;
  line-height: 1.6;
  white-space: pre-wrap;
}

.log-card-detail {
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: #f7f9fc;
  color: #243447;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.manual-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f6f8fb;
  color: #1f2d3d;
}

.manual-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid #e6ebf5;
}

.manual-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.manual-icon {
  font-size: 22px;
}

.manual-title-text {
  font-size: 16px;
  font-weight: 600;
}

.manual-title-sub {
  font-size: 12px;
  color: #6b7a90;
  margin-top: 4px;
}

.manual-search {
  padding: 12px 16px 8px;
  background: #fff;
  border-bottom: 1px solid #f0f2f5;
}

.manual-body {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 8px 12px 16px;
}

.manual-tabs {
  height: 100%;
  min-height: 0;
}

::v-deep .manual-tabs .el-tabs__header,
::v-deep .manual-tabs .el-tabs__nav-wrap,
::v-deep .manual-tabs .el-tabs__content,
::v-deep .manual-tabs .el-tab-pane {
  min-height: 0;
}

::v-deep .manual-tabs .el-tabs__content {
  height: 100%;
  overflow-y: auto;
  padding-left: 8px;
}

.module-intro {
  padding: 8px 4px 10px;
}

.module-title {
  font-weight: 600;
  font-size: 14px;
}

.module-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7a90;
}

.manual-collapse {
  background: transparent;
  border: none;
}

::v-deep .manual-collapse .el-collapse-item__header {
  background: #fff;
  border-radius: 10px;
  margin-bottom: 8px;
  padding: 0 12px;
  border: 1px solid #e8eef7;
}

::v-deep .manual-collapse .el-collapse-item__wrap {
  background: transparent;
  border: none;
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  justify-content: space-between;
}

.collapse-name {
  font-weight: 600;
  color: #1f2d3d;
}

.manual-card {
  background: #fff;
  border: 1px solid #e8eef7;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 6px 14px rgba(31, 45, 61, 0.06);
}

.card-row {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  flex-wrap: wrap;
}

.card-label {
  min-width: 96px;
  font-size: 12px;
  color: #6b7a90;
}

.card-value {
  flex: 1;
  font-size: 13px;
  color: #1f2d3d;
}

.template-line {
  line-height: 1.8;
}

.variant-switch {
  display: inline-flex;
}

.fill-link {
  padding: 0;
  margin-top: 6px;
}

.slot-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin: 0 2px;
  border-radius: 8px;
  border: 1px dashed #f5a623;
  background: #fff7e6;
  color: #8c5a00;
  cursor: pointer;
  font-size: 12px;
}

.slot-chip.active {
  border-color: #91d5ff;
  background: #e6f7ff;
  color: #096dd9;
}

.slot-chip-schedule {
  background: #f6ffed;
  border-color: #95de64;
  color: #237804;
}

.slot-chip-status {
  color: #52c41a;
  font-weight: 600;
}

.slot-picker-title {
  font-size: 12px;
  color: #6b7a90;
  margin-bottom: 6px;
}

.time-range-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calendar-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calendar-picker-input {
  width: 100%;
}

.calendar-mode-switch {
  display: inline-flex;
  width: fit-content;
}

.time-range-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.time-range-preset {
  border: 1px solid #d9e1f2;
  background: #f8fbff;
  color: #36506c;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.time-range-preset.active,
.time-range-preset:hover {
  border-color: #91d5ff;
  background: #e6f7ff;
  color: #096dd9;
}

.time-range-hint {
  font-size: 12px;
  color: #6b7a90;
}

.time-range-hint.invalid {
  color: #d4380d;
}

.time-range-preview {
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7faff;
  color: #1f2d3d;
  font-size: 12px;
}

.calendar-preview {
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7faff;
  color: #1f2d3d;
  font-size: 12px;
}

.time-range-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.schedule-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.schedule-option-status {
  color: #52c41a;
  font-size: 12px;
  font-weight: 600;
}

.example-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #e8eef7;
  background: #fbfdff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.example-item + .example-item {
  margin-top: 6px;
}

.example-item:hover {
  border-color: #b6d4ff;
  box-shadow: 0 6px 12px rgba(31, 45, 61, 0.08);
}

.example-text {
  color: #1f2d3d;
}

.form-row .card-value {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.form-label {
  font-size: 12px;
  color: #6b7a90;
  margin-bottom: 4px;
}

.manual-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #e6ebf5;
  font-size: 12px;
  color: #6b7a90;
}

.empty-state {
  text-align: center;
  color: #9aa4b2;
  font-size: 12px;
  padding: 16px 0;
}

@media (max-width: 768px) {
  .ai-float {
    top: calc(8px + var(--safe-top)) !important;
    right: calc(8px + var(--safe-right));
    bottom: calc(8px + var(--safe-bottom));
    left: calc(8px + var(--safe-left)) !important;
    width: auto;
    max-width: none;
    height: auto;
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 18px 40px rgba(31, 45, 61, 0.18);
  }

  .ai-float.is-mobile-open {
    min-height: calc(100dvh - var(--safe-top) - var(--safe-bottom) - 16px);
  }

  .ai-header {
    padding: 14px 14px 10px;
    cursor: default;
  }

  .actions {
    gap: 4px;
  }

  ::v-deep .header-log-btn {
    min-height: 40px;
    padding: 7px 12px;
  }

  .ai-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 14px 14px;
  }

  .desc {
    margin-bottom: 10px;
  }

  .assistant-settings-card {
    margin-bottom: 12px;
  }

  .title {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .header-school-kind {
    width: 100%;
  }

  .school-kind-chip {
    width: 100%;
    justify-content: space-between;
  }

  .assistant-settings-row {
    align-items: stretch;
    flex-direction: column;
  }

  .assistant-settings-label {
    white-space: normal;
  }

  .assistant-settings-select {
    width: 100%;
  }

  .chat-box {
    flex: 1 1 auto;
    max-height: none;
    min-height: 0;
    margin-bottom: 10px;
    padding: 10px;
  }

  .bubble {
    max-width: 96%;
    padding: 10px 12px;
    font-size: 14px;
  }

  .pending-choice {
    min-height: 44px;
  }

  .ai-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 10px 0 0;
    padding-bottom: max(2px, var(--safe-bottom));
  }

  .manual-search {
    padding: 12px 16px;
  }

  .manual-body,
  .log-body {
    padding-bottom: calc(16px + var(--safe-bottom));
  }

  ::v-deep .manual-drawer-mobile .el-drawer,
  ::v-deep .log-drawer-mobile .el-drawer {
    border-radius: 18px 18px 0 0;
  }

  ::v-deep .manual-drawer-mobile .el-drawer__body,
  ::v-deep .log-drawer-mobile .el-drawer__body {
    height: 100%;
    padding-top: var(--safe-top);
  }

  ::v-deep .manual-tabs .el-tabs__header {
    margin-bottom: 10px;
  }

  ::v-deep .manual-tabs .el-tabs__nav-wrap::after {
    display: none;
  }

  ::v-deep .manual-tabs .el-tabs__content {
    padding-left: 0;
  }

  .card-label,
  .card-value {
    width: 100%;
  }
}
</style>
