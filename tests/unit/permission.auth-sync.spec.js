function loadPermissionModule({
  token = 'session-token',
  licenseStatus = { activated: true },
  dispatchImpl
} = {}) {
  jest.resetModules()
  window.sessionStorage.clear()

  const beforeEach = jest.fn()
  const afterEach = jest.fn()
  const dispatch = jest.fn(dispatchImpl || ((type) => {
    if (type === 'user/getInfo' || type === 'user/tokenLogin' || type === 'user/resetToken') {
      return Promise.resolve({})
    }
    return Promise.resolve({})
  }))
  const getToken = jest.fn(() => token)
  const fetchLicenseStatus = jest.fn(() => Promise.resolve(licenseStatus))
  const start = jest.fn()
  const done = jest.fn()
  const messageError = jest.fn()

  jest.doMock('@/router', () => ({
    __esModule: true,
    default: {
      beforeEach,
      afterEach
    }
  }))
  jest.doMock('@/store', () => ({
    __esModule: true,
    default: {
      dispatch
    }
  }))
  jest.doMock('@/utils/auth', () => ({
    getToken
  }))
  jest.doMock('@/api/license', () => ({
    fetchLicenseStatus
  }))
  jest.doMock('element-ui', () => ({
    Message: {
      error: messageError
    }
  }))
  jest.doMock('nprogress', () => ({
    __esModule: true,
    default: {
      configure: jest.fn(),
      start,
      done
    }
  }))
  jest.doMock('nprogress/nprogress.css', () => ({}))
  jest.doMock('@/utils/get-page-title', () => ({
    __esModule: true,
    default: jest.fn(() => 'page-title')
  }))
  jest.doMock('@/settings', () => ({
    __esModule: true,
    default: {}
  }))

  require('@/permission')
  const guard = beforeEach.mock.calls[0][0]

  return {
    guard,
    mocks: {
      dispatch,
      getToken,
      fetchLicenseStatus,
      start,
      done,
      messageError
    }
  }
}

describe('permission guard auth session', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('shows a user-friendly auth session 401 message before redirecting', async() => {
    const authError = {
      response: {
        status: 401,
        data: {
          detail: 'Login required.'
        }
      },
      config: {
        url: '/auth/session'
      }
    }
    const { guard, mocks } = loadPermissionModule({
      dispatchImpl: (type) => {
        if (type === 'user/getInfo') {
          return Promise.reject(authError)
        }
        if (type === 'user/resetToken') {
          return Promise.resolve({})
        }
        return Promise.resolve({})
      }
    })
    const next = jest.fn()

    await guard({ path: '/device-status', fullPath: '/device-status', meta: {} }, {}, next)

    expect(mocks.messageError).toHaveBeenCalledWith('登录状态已失效，正在跳转登录页。')
    expect(next).toHaveBeenCalledWith('/login?redirect=%2Fdevice-status')
  })
})
