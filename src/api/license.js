import axios from 'axios'

const service = axios.create({
  baseURL: process.env.VUE_APP_BASE_API,
  timeout: 15000
})

export function fetchLicenseStatus() {
  return service.get('/license/status').then(response => response.data)
}

export function activateLicense(code) {
  return service.post('/license/activate', { code }).then(response => response.data)
}

export function extractLicenseError(error) {
  const detail = error && error.response && error.response.data && error.response.data.detail
  if (detail && typeof detail === 'object') {
    return detail
  }
  return {
    error_code: 'request_failed',
    message: (error && error.message) || '请求失败'
  }
}
