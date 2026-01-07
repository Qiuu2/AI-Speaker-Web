<template>
  <div
    class="ai-float"
    :class="{ collapsed }"
    :style="{ top: position.top + 'px', left: position.left + 'px' }"
    @mousedown.stop
  >
    <div class="ai-header" @mousedown.prevent="startDrag">
      <div class="title">
        <i class="el-icon-microphone" />
        <span>AI 语音助手</span>
      </div>
      <div class="actions">
        <el-button type="text" size="mini" @click.stop="toggleCollapse">
          {{ collapsed ? '展开' : '收起' }}
        </el-button>
      </div>
    </div>

    <div v-show="!collapsed" class="ai-body">
      <p class="desc">在任意页面输入口令，调用后端 /assistant/chat 接口解析意图并返回回复。</p>

      <div class="chat-box" ref="chatBox">
        <div v-for="msg in conversation" :key="msg.id" :class="['chat-line', msg.role]">
          <div class="bubble">
            <div class="text">{{ msg.text }}</div>
            <div v-if="msg.meta" class="meta">
              <span>意图: {{ msg.meta.intent }}</span>
              <span>置信度: {{ msg.meta.confidence }}</span>
              <span>缺失槽位: {{ missingSlotsText(msg.meta.missing_slots) }}</span>
            </div>
          </div>
        </div>
        <div v-if="!conversation.length" class="placeholder">
          试着说：“明早 8 点在教学楼一层播放校园铃声，音量 40，循环 2 次”
        </div>
      </div>

      <el-input
        type="textarea"
        :rows="3"
        v-model="command"
        placeholder="请输入语音口令文本"
      />
      <div class="ai-actions">
        <el-button
          type="primary"
          icon="el-icon-microphone"
          size="mini"
          :loading="aiLoading"
          @click="sendToAssistant"
        >
          发送
        </el-button>
        <el-button size="mini" @click="command = ''">清空</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  name: 'AiAssistantFloat',
  data() {
    return {
      command: '',
      aiLoading: false,
      collapsed: false,
      conversation: [],
      position: {
        top: 140,
        left: 0
      },
      dragState: null,
      panelWidth: 320
    }
  },
  mounted() {
    this.position.left = window.innerWidth - this.panelWidth - 24
    window.addEventListener('resize', this.handleResize)
  },
  beforeDestroy() {
    this.removeDragListeners()
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    toggleCollapse() {
      this.collapsed = !this.collapsed
    },
    handleResize() {
      const maxLeft = window.innerWidth - this.panelWidth - 12
      if (this.position.left > maxLeft) this.position.left = maxLeft
    },
    startDrag(e) {
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
    pushMessage(role, text, meta = null) {
      this.conversation.push({
        id: `${Date.now()}-${Math.random()}`,
        role,
        text,
        meta
      })
      this.$nextTick(() => {
        const box = this.$refs.chatBox
        if (box) box.scrollTop = box.scrollHeight
      })
    },
    async sendToAssistant() {
      if (!this.command) {
        this.$message.warning('请先输入语音口令文本')
        return
      }
      const userText = this.command
      this.pushMessage('user', userText)
      this.command = ''
      this.aiLoading = true
      try {
        const base = process.env.VUE_APP_BASE_API || ''
        const { data } = await axios.post(`${base}/assistant/chat`, { text: userText })
        this.pushMessage('ai', data.reply || '已收到指令。', {
          intent: data.intent,
          confidence: data.confidence,
          missing_slots: data.missing_slots
        })
      } catch (err) {
        this.pushMessage('ai', '助手调用失败，请检查后端 /assistant/chat 接口')
      } finally {
        this.aiLoading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.ai-float {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 320px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 14px 28px rgba(31, 45, 61, 0.16);
  z-index: 2000;
  user-select: none;
  cursor: default;
  transition: box-shadow 0.2s ease;
}

.ai-float.collapsed {
  width: 200px;
}

.ai-float:hover {
  box-shadow: 0 18px 32px rgba(31, 45, 61, 0.2);
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
  cursor: move;
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #1f2d3d;
  font-weight: 600;
}

.ai-body {
  padding: 12px;
}

.desc {
  margin: 0 0 8px;
  color: #5e6d82;
  font-size: 13px;
}

.chat-box {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
  background: #f9fbff;
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
}

.chat-line.user .bubble {
  background: #ecf5ff;
}

.text {
  white-space: pre-wrap;
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
</style>