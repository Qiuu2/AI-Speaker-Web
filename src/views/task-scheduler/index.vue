<template>
  <div class="scheduler-page">
    <div class="page-header">
      <div>
        <h2>任务编排中心</h2>
        <p>在此编排作息方案、文件广播、采播管理，保存后各模块页面可直接查看。</p>
      </div>
      <div class="header-actions">
        <el-button size="small" icon="el-icon-document" @click="persist('已保存上传')">保存上传</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="resetData">恢复默认示例</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" type="card">
      <!-- 作息方案 -->
      <el-tab-pane label="作息方案" name="plans">
        <div class="toolbar">
          <el-button size="mini" @click="selectAll('plan')">全选</el-button>
          <el-button size="mini" @click="clearSelection('plan')">取消</el-button>
          <el-button size="mini" type="success" @click="toggleStatus('plan', '启用')">启用方案</el-button>
          <el-button size="mini" type="warning" @click="toggleStatus('plan', '停用')">停用方案</el-button>
          <el-button size="mini" type="primary" icon="el-icon-plus" @click="openDialog('plan', 'add')">添加方案</el-button>
          <el-button size="mini" icon="el-icon-edit" @click="openDialog('plan', 'edit')">修改方案</el-button>
          <el-button size="mini" type="danger" icon="el-icon-delete" @click="removeSelected('plan')">删除方案</el-button>
          <el-button size="mini" icon="el-icon-copy-document" @click="copySelected('plan')">复制方案</el-button>
          <el-button size="mini" icon="el-icon-setting" @click="openBatchDialog">批量修改</el-button>
        </div>
        <el-table
          ref="planTable"
          :data="modules.plans"
          border
          size="small"
          @selection-change="(vals) => (selected.plans = vals)"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column type="expand">
            <template slot-scope="{ row }">
              <div class="task-toolbar">
                <el-button size="mini" type="primary" icon="el-icon-plus" @click="addPlanTask(row)">添加任务</el-button>
              </div>
              <el-table :data="row.tasks" border size="mini">
                <el-table-column type="index" width="40" />
                <el-table-column label="音频资源" min-width="200">
                  <template slot-scope="{ row: task }">
                    <div class="audio-cell">
                      <el-select v-model="task.audio" filterable placeholder="选择音频" size="mini">
                        <el-option v-for="item in audioOptions" :key="item.value" :label="item.label" :value="item.value" />
                      </el-select>
                      <el-button type="text" size="mini" icon="el-icon-video-play" @click="preview(task.audio)">试听</el-button>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="播放时间 / 时长" min-width="220">
                  <template slot-scope="{ row: task }">
                    <div class="time-cell">
                      <el-time-picker v-model="task.time" size="mini" value-format="HH:mm" format="HH:mm" placeholder="播放时间" />
                      <el-input v-model="task.duration" size="mini" placeholder="时长(分钟)" suffix-icon="el-icon-time" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="循环" width="90">
                  <template slot-scope="{ row: task }">
                    <el-input-number v-model="task.loop" :min="1" size="mini" />
                  </template>
                </el-table-column>
                <el-table-column label="执行周期" min-width="200">
                  <template slot-scope="{ row: task }">
                    <el-checkbox-group v-model="task.weekdays" size="mini" class="week-group">
                      <el-checkbox v-for="day in weekdaysOptions" :key="day" :label="day">{{ day }}</el-checkbox>
                    </el-checkbox-group>
                  </template>
                </el-table-column>
                <el-table-column label="时效范围" min-width="220">
                  <template slot-scope="{ row: task }">
                    <el-date-picker
                      v-model="task.dateRange"
                      type="daterange"
                      size="mini"
                      value-format="yyyy-MM-dd"
                      range-separator="至"
                      start-placeholder="开始"
                      end-placeholder="结束"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="音量" width="140">
                  <template slot-scope="{ row: task }">
                    <div class="volume-cell">
                      <el-input-number v-model="task.volume" :min="0" :max="100" size="mini" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="终端地点" min-width="240">
                  <template slot-scope="{ row: task }">
                    <el-cascader
                      v-model="task.location"
                      :options="locationOptions"
                      :props="{ checkStrictly: true, multiple: true }"
                      filterable
                      clearable
                      size="mini"
                      placeholder="选择区域/终端"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="90">
                  <template slot-scope="{ row: task }">
                    <el-button type="text" size="mini" @click="removePlanTask(row, task)">删除</el-button>
                  </template>
                </el-table-column>
                <el-table-column type="expand" width="120" label="更多设置">
                  <template slot-scope="{ row: task }">
                    <div class="advanced-box">
                      <el-form label-width="90px" size="mini">
                        <el-form-item label="任务等级">
                          <el-select v-model="task.taskLevel">
                            <el-option label="正常" value="正常" />
                            <el-option label="高" value="高" />
                            <el-option label="最高" value="最高" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="预开电源">
                          <el-switch v-model="task.powerOn" />
                        </el-form-item>
                        <el-form-item label="发送模式">
                          <el-select v-model="task.sendMode">
                            <el-option label="单播" value="单播" />
                            <el-option label="组播" value="组播" />
                            <el-option label="广播" value="广播" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="播放模式">
                          <el-select v-model="task.playMode">
                            <el-option label="串行" value="串行" />
                            <el-option label="并行" value="并行" />
                            <el-option label="循环" value="循环" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="LED 播放">
                          <el-input v-model="task.ledSetting" placeholder="LED 播报设置" />
                        </el-form-item>
                      </el-form>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="方案名称" />
          <el-table-column label="任务数" width="80">
            <template slot-scope="{ row }">
              {{ (row.tasks && row.tasks.length) || 0 }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template slot-scope="{ row }">
              <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="mini">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 文件广播 -->
      <el-tab-pane label="文件广播" name="broadcasts">
        <div class="toolbar">
          <el-button size="mini" @click="selectAll('broadcast')">全选</el-button>
          <el-button size="mini" @click="clearSelection('broadcast')">取消</el-button>
          <el-button size="mini" type="success" @click="setBroadcastStatus('执行中')">执行</el-button>
          <el-button size="mini" type="warning" @click="setBroadcastStatus('停止')">停止</el-button>
          <el-button size="mini" @click="setBroadcastStatus('暂停')">暂停</el-button>
          <el-button size="mini" @click="setBroadcastStatus('执行中')">恢复</el-button>
          <el-button size="mini" @click="setBroadcastStatus('启用')">启用</el-button>
          <el-button size="mini" @click="setBroadcastStatus('停用')">停用</el-button>
          <el-button size="mini" type="primary" icon="el-icon-plus" @click="addBroadcastRow">添加</el-button>
          <el-button size="mini" type="danger" icon="el-icon-delete" @click="removeSelected('broadcast')">删除</el-button>
          <el-button size="mini" type="danger" icon="el-icon-warning-outline" @click="setEmergency(true)">紧急设置</el-button>
          <el-button size="mini" @click="setEmergency(false)">紧急取消</el-button>
          <el-button size="mini" icon="el-icon-bell" @click="openVolumeDialog('broadcast')">调整音量</el-button>
          <el-button size="mini" icon="el-icon-folder-add" @click="createDirectory">创建目录</el-button>
          <el-button size="mini" icon="el-icon-edit-outline" @click="modifyDirectory">修改目录</el-button>
          <el-button size="mini" icon="el-icon-folder-remove" @click="deleteDirectory">删除目录</el-button>
          <el-button size="mini" icon="el-icon-copy-document" @click="copyDirectory">复制目录</el-button>
        </div>
        <el-table
          ref="broadcastTable"
          :data="modules.broadcasts"
          border
          size="small"
          @selection-change="(vals) => (selected.broadcasts = vals)"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column label="任务名称 / 目录" min-width="220">
            <template slot-scope="{ row }">
              <div class="audio-cell">
                <el-input v-model="row.name" size="mini" placeholder="任务名称" />
              </div>
              <div class="audio-cell" style="margin-top: 4px;">
                <el-select v-model="row.directory" filterable size="mini" placeholder="目录">
                  <el-option v-for="dir in modules.directories" :key="dir" :label="dir" :value="dir" />
                </el-select>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="音频资源" min-width="180">
            <template slot-scope="{ row }">
              <div class="audio-cell">
                <el-select v-model="row.audio" filterable placeholder="选择音频" size="mini">
                  <el-option v-for="item in audioOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
                <el-button type="text" size="mini" icon="el-icon-video-play" @click="preview(row.audio)">试听</el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="播放时间 / 时长" min-width="200">
            <template slot-scope="{ row }">
              <div class="time-cell">
                <el-time-picker v-model="row.time" size="mini" value-format="HH:mm" format="HH:mm" placeholder="播放时间" />
                <el-input v-model="row.duration" size="mini" placeholder="时长(分钟)" suffix-icon="el-icon-time" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="循环" width="90">
            <template slot-scope="{ row }">
              <el-input-number v-model="row.loop" :min="1" size="mini" />
            </template>
          </el-table-column>
          <el-table-column label="终端地点" min-width="220">
            <template slot-scope="{ row }">
              <el-cascader
                v-model="row.location"
                :options="locationOptions"
                :props="{ checkStrictly: true, multiple: true }"
                filterable
                clearable
                size="mini"
                placeholder="选择区域/终端"
              />
            </template>
          </el-table-column>
          <el-table-column label="音量" width="140">
            <template slot-scope="{ row }">
              <div class="volume-cell">
                <el-input-number v-model="row.volume" :min="0" :max="100" size="mini" />
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template slot-scope="{ row }">
              <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
              <el-tag v-if="row.emergency" type="danger" size="mini">紧急</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template slot-scope="{ row }">
              <el-button type="text" size="mini" @click="removeBroadcastRow(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 采播管理 -->
      <el-tab-pane label="采播管理" name="livecasts">
        <div class="toolbar">
          <el-button size="mini" @click="selectAll('live')">全选</el-button>
          <el-button size="mini" @click="clearSelection('live')">取消</el-button>
          <el-button size="mini" type="success" @click="setLiveStatus('执行中')">执行</el-button>
          <el-button size="mini" type="warning" @click="setLiveStatus('停止')">停止</el-button>
          <el-button size="mini" type="primary" icon="el-icon-plus" @click="addLiveRow">添加</el-button>
          <el-button size="mini" type="danger" icon="el-icon-delete" @click="removeSelected('live')">删除</el-button>
          <el-button size="mini" @click="setLiveStatus('启用')">启用</el-button>
          <el-button size="mini" @click="setLiveStatus('停用')">停用</el-button>
          <el-button size="mini" icon="el-icon-bell" @click="openVolumeDialog('live')">调整音量</el-button>
        </div>
        <el-table
          ref="liveTable"
          :data="modules.livecasts"
          border
          size="small"
          @selection-change="(vals) => (selected.livecasts = vals)"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column label="任务名称" min-width="180">
            <template slot-scope="{ row }">
              <el-input v-model="row.name" size="mini" placeholder="任务名称" />
            </template>
          </el-table-column>
          <el-table-column label="音频源" min-width="160">
            <template slot-scope="{ row }">
              <el-select v-model="row.audio" filterable placeholder="选择音频" size="mini">
                <el-option v-for="item in audioOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="播放时间 / 时长" min-width="200">
            <template slot-scope="{ row }">
              <div class="time-cell">
                <el-time-picker v-model="row.time" size="mini" value-format="HH:mm" format="HH:mm" placeholder="播放时间" />
                <el-input v-model="row.duration" size="mini" placeholder="时长(分钟)" suffix-icon="el-icon-time" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="循环" width="90">
            <template slot-scope="{ row }">
              <el-input-number v-model="row.loop" :min="1" size="mini" />
            </template>
          </el-table-column>
          <el-table-column label="终端地点" min-width="220">
            <template slot-scope="{ row }">
              <el-cascader
                v-model="row.location"
                :options="locationOptions"
                :props="{ checkStrictly: true, multiple: true }"
                filterable
                clearable
                size="mini"
                placeholder="选择区域/终端"
              />
            </template>
          </el-table-column>
          <el-table-column label="音量" width="140">
            <template slot-scope="{ row }">
              <div class="volume-cell">
                <el-input-number v-model="row.volume" :min="0" :max="100" size="mini" />
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template slot-scope="{ row }">
              <el-tag :type="statusTag(row.status)" size="mini">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template slot-scope="{ row }">
              <el-button type="text" size="mini" @click="removeLiveRow(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 方案新增/修改 -->
    <el-dialog :title="dialogTitle" :visible.sync="dialog.visible" width="360px">
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
    <el-dialog title="批量修改任务" :visible.sync="batchDialog.visible" width="420px">
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
    <el-dialog title="统一调整音量" :visible.sync="volumeDialog.visible" width="360px">
      <p>选择的{{ volumeTargetLabel }}将应用以下音量：</p>
      <el-input-number v-model="volumeDialog.value" :min="0" :max="100" />
      <span slot="footer">
        <el-button @click="volumeDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="applyVolume">确定</el-button>
      </span>
    </el-dialog>
  </div>
</template>
<script>
import { loadSchedulerData, saveSchedulerData, getDefaultSchedulerData } from '@/utils/schedulerStorage'

export default {
  name: 'TaskSchedulerPage',
  data() {
    return {
      activeTab: 'plans',
      modules: loadSchedulerData(),
      selected: {
        plans: [],
        broadcasts: [],
        livecasts: []
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
      audioOptions: [
        { label: '校园铃声.mp3', value: '校园铃声.mp3' },
        { label: '安全提示.wav', value: '安全提示.wav' },
        { label: '比赛预告.mp3', value: '比赛预告.mp3' },
        { label: '直播源A', value: '直播源A' },
        { label: '直播源B', value: '直播源B' }
      ],
      locationOptions: [
        {
          value: '教学楼',
          label: '教学楼',
          children: [
            { value: '一层', label: '一层', children: [{ value: '101音箱', label: '101音箱' }, { value: '102音箱', label: '102音箱' }] },
            { value: '二层', label: '二层', children: [{ value: '201音箱', label: '201音箱' }] }
          ]
        },
        {
          value: '操场',
          label: '操场',
          children: [
            { value: '东侧', label: '东侧', children: [{ value: '东-1', label: '东-1' }, { value: '东-2', label: '东-2' }] },
            { value: '西侧', label: '西侧', children: [{ value: '西-1', label: '西-1' }] }
          ]
        },
        {
          value: '体育馆',
          label: '体育馆',
          children: [
            { value: '看台区', label: '看台区', children: [{ value: '北侧音箱', label: '北侧音箱' }] }
          ]
        }
      ],
      weekdaysOptions: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    }
  },
  computed: {
    dialogTitle() {
      const map = { plan: '作息方案', broadcast: '文件广播', live: '采播管理' }
      const name = map[this.dialog.type] || '项'
      return `${this.dialog.mode === 'add' ? '添加' : '修改'}${name}`
    },
    volumeTargetLabel() {
      if (this.volumeDialog.target === 'broadcast') return '文件广播'
      if (this.volumeDialog.target === 'live') return '采播任务'
      return '任务'
    }
  },
  methods: {
    persist(message) {
      saveSchedulerData(this.modules)
      if (message) {
        this.$message.success(message)
      }
    },
    resetData() {
      this.modules = getDefaultSchedulerData()
      this.selected = { plans: [], broadcasts: [], livecasts: [] }
      this.persist('已恢复默认示例')
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
      return []
    },
    getSelected(type) {
      if (type === 'plan') return this.selected.plans || []
      if (type === 'broadcast') return this.selected.broadcasts || []
      if (type === 'live') return this.selected.livecasts || []
      return []
    },
    toggleStatus(type, status) {
      const rows = this.getSelected(type)
      if (!rows.length) return this.$message.warning('请选择要处理的行')
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
    submitDialog() {
      const { type, mode, form } = this.dialog
      const name = form.name || '新建'
      if (mode === 'add') {
        this.addByType(type, name)
      } else {
        const target = this.getSelected(type)[0]
        if (target) target.name = name
      }
      this.dialog.visible = false
      this.persist('已保存')
    },
    addByType(type, name) {
      if (type === 'plan') {
        this.modules.plans.push({
          id: Date.now(),
          name,
          status: '停用',
          tasks: []
        })
      } else if (type === 'broadcast') {
        this.modules.broadcasts.push(this.newBroadcastRow(name))
      } else if (type === 'live') {
        this.modules.livecasts.push(this.newLiveRow(name))
      }
    },
    copySelected(type) {
      const rows = this.getSelected(type)
      if (!rows.length) return this.$message.warning('请选择要复制的行')
      const list = this.getList(type)
      rows.forEach((item) => {
        const copy = JSON.parse(JSON.stringify(item))
        copy.id = Date.now() + Math.random()
        copy.name = `${item.name || '副本'}-副本`
        list.push(copy)
      })
      this.persist('已复制')
    },
    removeSelected(type) {
      const rows = this.getSelected(type)
      if (!rows.length) return this.$message.warning('请选择要删除的行')
      const list = this.getList(type)
      const ids = rows.map((r) => r.id)
      if (type === 'plan') {
        this.modules.plans = list.filter((item) => !ids.includes(item.id))
      } else if (type === 'broadcast') {
        this.modules.broadcasts = list.filter((item) => !ids.includes(item.id))
      } else if (type === 'live') {
        this.modules.livecasts = list.filter((item) => !ids.includes(item.id))
      }
      this.persist('已删除')
    },
    openBatchDialog() {
      if (!this.getSelected('plan').length) return this.$message.warning('请选择要批量修改的方案')
      this.batchDialog = { visible: true, volume: null, status: '' }
    },
    submitBatch() {
      const rows = this.getSelected('plan')
      if (!rows.length) return this.$message.warning('请选择要批量修改的方案')
      rows.forEach((plan) => {
        if (this.batchDialog.status) plan.status = this.batchDialog.status
        if (Array.isArray(plan.tasks)) {
          plan.tasks.forEach((task) => {
            if (this.batchDialog.volume !== null && this.batchDialog.volume !== undefined) {
              task.volume = this.batchDialog.volume
            }
          })
        }
      })
      this.batchDialog.visible = false
      this.persist('批量修改已应用')
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
      this.persist('音量已调整')
    },
    addPlanTask(plan) {
      if (!Array.isArray(plan.tasks)) plan.tasks = []
      plan.tasks.push(this.newPlanTask())
      this.persist('已添加任务')
    },
    removePlanTask(plan, task) {
      const list = plan.tasks || []
      const idx = list.indexOf(task)
      if (idx > -1) {
        list.splice(idx, 1)
        this.persist('已删除任务')
      }
    },
    newPlanTask() {
      const today = new Date().toISOString().slice(0, 10)
      return {
        id: `task-${Date.now()}`,
        audio: this.audioOptions[0]?.value || '',
        time: '08:00',
        duration: '05',
        loop: 1,
        weekdays: ['周一', '周二', '周三', '周四', '周五'],
        dateRange: [today, today],
        volume: 50,
        location: [['教学楼', '一层', '101音箱']],
        powerOn: true,
        taskLevel: '正常',
        sendMode: '单播',
        playMode: '串行',
        ledSetting: ''
      }
    },
    addBroadcastRow() {
      this.modules.broadcasts.push(this.newBroadcastRow())
      this.persist('已添加广播任务')
    },
    removeBroadcastRow(row) {
      this.modules.broadcasts = this.modules.broadcasts.filter((item) => item !== row)
      this.persist('已删除广播任务')
    },
    newBroadcastRow(name = '新广播任务') {
      return {
        id: Date.now(),
        name,
        directory: this.modules.directories[0] || '',
        status: '待执行',
        volume: 50,
        emergency: false,
        audio: this.audioOptions[1]?.value || '',
        time: '09:00',
        duration: '05',
        loop: 1,
        location: [['教学楼', '一层', '101音箱']]
      }
    },
    setBroadcastStatus(status) {
      const rows = this.getSelected('broadcast')
      if (!rows.length) return this.$message.warning('请选择广播任务')
      rows.forEach((row) => {
        row.status = status
      })
      this.persist('广播状态已更新')
    },
    setEmergency(flag) {
      const rows = this.getSelected('broadcast')
      if (!rows.length) return this.$message.warning('请选择广播任务')
      rows.forEach((row) => {
        row.emergency = flag
      })
      this.persist('紧急标记已更新')
    },
    createDirectory() {
      this.$prompt('请输入目录名称', '创建目录', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '如：校园广播/通知'
      })
        .then(({ value }) => {
          if (!value) return
          if (!this.modules.directories.includes(value)) {
            this.modules.directories.push(value)
            this.persist('目录已创建')
          }
        })
        .catch(() => {})
    },
    modifyDirectory() {
      const row = this.getSelected('broadcast')[0]
      if (!row) return this.$message.warning('请选择要修改目录的广播任务')
      this.$prompt('请输入新的目录名称', '修改目录', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: row.directory
      })
        .then(({ value }) => {
          row.directory = value
          if (!this.modules.directories.includes(value)) {
            this.modules.directories.push(value)
          }
          this.persist('目录已修改')
        })
        .catch(() => {})
    },
    deleteDirectory() {
      const row = this.getSelected('broadcast')[0]
      if (!row) return this.$message.warning('请选择要删除目录的广播任务')
      const dir = row.directory
      this.modules.directories = this.modules.directories.filter((d) => d !== dir)
      this.modules.broadcasts.forEach((item) => {
        if (item.directory === dir) item.directory = ''
      })
      this.persist('目录已删除')
    },
    copyDirectory() {
      this.$message.success('目录已复制（示例）')
    },
    addLiveRow() {
      this.modules.livecasts.push(this.newLiveRow())
      this.persist('已添加采播任务')
    },
    removeLiveRow(row) {
      this.modules.livecasts = this.modules.livecasts.filter((item) => item !== row)
      this.persist('已删除采播任务')
    },
    newLiveRow(name = '新采播任务') {
      return {
        id: Date.now(),
        name,
        status: '待执行',
        volume: 45,
        audio: this.audioOptions[3]?.value || '',
        time: '14:00',
        duration: '10',
        loop: 1,
        location: [['体育馆', '看台区', '北侧音箱']]
      }
    },
    setLiveStatus(status) {
      const rows = this.getSelected('live')
      if (!rows.length) return this.$message.warning('请选择采播任务')
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
.toolbar,
.task-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.audio-cell,
.time-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.volume-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.week-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
</style>
