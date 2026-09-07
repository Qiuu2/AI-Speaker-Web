<template>
  <div class="license-container">
    <div class="license-stage">
      <section class="hero-copy">
        <p class="hero-kicker">Premium Access</p>
        <h1 class="hero-title">校园广播服务器注册</h1>
        <p class="hero-subtitle">登录后如果当前服务器尚未注册，系统会进入此页面。</p>
        <p class="hero-description">
          页面会先获取服务器机器码用于展示。输入总部商务提供的注册码并提交后，如果返回
          <strong>success</strong>，系统会把成功状态保存到本地，后续在有效期内会自动跳过注册。
        </p>
      </section>

      <section class="license-card">
        <div class="card-header">
          <h2 class="card-title">服务器注册</h2>
          <p class="card-subtitle">未注册或已过期时，其余业务接口仍会被后端统一拦截。</p>
        </div>

        <div v-if="loadingStatus" class="status-block loading-block">
          正在检查当前注册状态...
        </div>

        <template v-else-if="status.activated">
          <div class="status-block status-success">
            <p class="status-title">当前服务器已注册成功</p>
            <p class="status-meta">机器码：{{ status.machine_code || '-' }}</p>
            <p class="status-meta">注册时间：{{ status.activated_at || '-' }}</p>
            <p class="status-meta">状态说明：{{ successDescription }}</p>
            <p v-if="status.expires_at" class="status-meta">有效期至：{{ status.expires_at }}</p>
          </div>

          <el-button class="action-button" type="primary" @click="enterSystem">
            进入系统
          </el-button>

          <el-button class="secondary-button" @click="refreshStatus">
            刷新状态
          </el-button>
        </template>

        <template v-else>
          <el-form @submit.native.prevent>
            <label class="field-label" for="machine-code">机器码</label>
            <el-input
              id="machine-code"
              :value="status.machine_code || ''"
              readonly
              placeholder="正在获取机器码"
            />

            <label class="field-label field-gap" for="license-code">注册码</label>
            <el-input
              id="license-code"
              v-model.trim="form.code"
              placeholder="请输入注册码"
              clearable
              @keyup.enter.native="handleActivate"
            />

            <div class="status-block status-neutral">
              <p class="status-meta">当前状态：{{ statusLabel }}</p>
              <p v-if="status.expires_at" class="status-meta">到期日期：{{ status.expires_at }}</p>
              <p v-if="status.last_remote_result" class="status-meta">最近返回：{{ status.last_remote_result }}</p>
            </div>

            <el-alert
              v-if="errorMessage"
              :title="errorMessage"
              type="error"
              :closable="false"
              show-icon
              class="inline-alert"
            />

            <el-button class="action-button" type="primary" :loading="submitting" @click="handleActivate">
              注册并进入
            </el-button>

            <el-button class="secondary-button" @click="refreshStatus">
              刷新状态
            </el-button>
          </el-form>
        </template>
      </section>
    </div>
  </div>
</template>

<script>
import { activateLicense, extractLicenseError, fetchLicenseStatus } from '@/api/license'

function createDefaultStatus() {
  return {
    activated: false,
    hardware_id: '',
    machine_code: '',
    bound_code_mask: '',
    activated_at: '',
    expires_at: '',
    license_state: '',
    error_code: '',
    message: '',
    last_remote_result: '',
    activation_mode: 'remote_registai_cached'
  }
}

export default {
  name: 'LicenseActivation',
  data() {
    return {
      loadingStatus: true,
      submitting: false,
      errorMessage: '',
      redirect: '/',
      form: {
        code: ''
      },
      status: createDefaultStatus()
    }
  },
  computed: {
    successDescription() {
      return this.status.expires_at
        ? `注册成功，在 ${this.status.expires_at} 前可直接进入系统`
        : '永久注册成功，后续可直接进入系统'
    },
    statusLabel() {
      const state = String(this.status.license_state || '').trim()
      if (state === 'expired') return '注册码已过期'
      if (state === 'failed') return '注册码校验失败'
      if (state === 'inactive') return '未注册'
      return '待注册'
    }
  },
  created() {
    const redirect = this.$route.query && this.$route.query.redirect
    this.redirect = redirect ? decodeURIComponent(redirect) : '/'
    this.refreshStatus()
  },
  methods: {
    applyStatus(payload) {
      this.status = Object.assign(createDefaultStatus(), payload || {})
      if (this.status.activated) {
        this.errorMessage = ''
        return
      }
      if (this.status.license_state === 'expired') {
        this.errorMessage = this.status.expires_at
          ? `注册码已过期，到期日期：${this.status.expires_at}`
          : (this.status.message || '注册码已过期')
        return
      }
      if (this.status.license_state === 'failed') {
        this.errorMessage = this.status.message || '注册码校验失败，请检查后重试'
        return
      }
      if (this.status.error_code && this.status.message) {
        this.errorMessage = this.status.message
        return
      }
      this.errorMessage = ''
    },
    async refreshStatus() {
      this.loadingStatus = true
      try {
        const payload = await fetchLicenseStatus()
        this.applyStatus(payload)
      } catch (error) {
        const detail = extractLicenseError(error)
        this.errorMessage = detail.message || '注册状态检查失败'
      } finally {
        this.loadingStatus = false
      }
    },
    async handleActivate() {
      if (!this.form.code) {
        this.errorMessage = '请输入注册码'
        return
      }
      this.submitting = true
      this.errorMessage = ''
      try {
        const payload = await activateLicense(this.form.code)
        this.applyStatus(payload)
        if (payload && payload.activated) {
          this.enterSystem()
        } else if (!this.errorMessage) {
          this.errorMessage = payload.message || '注册失败'
        }
      } catch (error) {
        const detail = extractLicenseError(error)
        const messageMap = {
          invalid_code: '注册码不能为空，请重新输入。',
          remote_request_failed: '注册服务暂时不可用，请稍后重试。',
          machine_code_unavailable: '机器码获取失败，请检查远端注册服务。',
          invalid_remote_response: '注册服务返回了无法识别的结果，请联系管理员。'
        }
        this.errorMessage = messageMap[detail.error_code] || detail.message || '注册失败'
      } finally {
        this.submitting = false
      }
    },
    enterSystem() {
      this.$router.replace(this.redirect || '/')
    }
  }
}
</script>

<style lang="scss" scoped>
.license-container {
  min-height: 100vh;
  background:
    linear-gradient(120deg, rgba(8, 18, 34, 0.92), rgba(12, 29, 56, 0.78)),
    url('../../../interface.png') center / cover no-repeat;
}

.license-stage {
  min-height: 100vh;
  max-width: 1240px;
  margin: 0 auto;
  padding: 48px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 48px;
}

.hero-copy {
  max-width: 560px;
  color: #eef5ff;
}

.hero-kicker {
  margin: 0 0 16px;
  font-size: 13px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(149, 194, 255, 0.82);
}

.hero-title {
  margin: 0;
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1.05;
}

.hero-subtitle {
  margin: 18px 0 0;
  font-size: 24px;
  line-height: 1.45;
  color: rgba(236, 244, 255, 0.92);
}

.hero-description {
  margin: 14px 0 0;
  font-size: 16px;
  line-height: 1.8;
  color: rgba(210, 226, 248, 0.8);
}

.license-card {
  width: 440px;
  max-width: 100%;
  padding: 30px 28px;
  border-radius: 28px;
  border: 1px solid rgba(142, 192, 255, 0.2);
  background: linear-gradient(180deg, rgba(10, 20, 36, 0.82), rgba(7, 14, 27, 0.92));
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(18px);
}

.card-header {
  margin-bottom: 24px;
}

.card-title {
  margin: 0;
  font-size: 28px;
  color: #eef5ff;
}

.card-subtitle {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(206, 222, 244, 0.72);
}

.field-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  color: rgba(224, 235, 252, 0.88);
}

.field-gap {
  margin-top: 18px;
}

.status-block {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.7;
}

.loading-block,
.status-neutral {
  background: rgba(21, 40, 69, 0.72);
  color: rgba(220, 232, 248, 0.9);
}

.status-success {
  background: rgba(20, 74, 55, 0.36);
  border: 1px solid rgba(87, 193, 136, 0.22);
  color: #edfdf3;
}

.status-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}

.status-meta {
  margin: 0;
  word-break: break-all;
}

.inline-alert {
  margin-top: 18px;
}

.action-button,
.secondary-button {
  width: 100%;
  margin-top: 18px;
  height: 50px;
  border-radius: 14px;
}

.action-button {
  font-size: 16px;
  font-weight: 600;
}

.secondary-button {
  margin-left: 0;
}

::v-deep .el-input__inner {
  height: 50px;
  line-height: 50px;
  border-radius: 14px;
  border: 1px solid rgba(143, 192, 255, 0.22);
  background: rgba(14, 28, 49, 0.8);
  color: #eef5ff;
}

::v-deep .el-input__inner::placeholder {
  color: rgba(184, 205, 235, 0.46);
}

@media (max-width: 980px) {
  .license-stage {
    padding: 24px 18px;
    flex-direction: column;
    justify-content: center;
  }

  .hero-copy {
    max-width: 720px;
    text-align: center;
  }

  .license-card {
    width: 100%;
    max-width: 520px;
  }
}
</style>
