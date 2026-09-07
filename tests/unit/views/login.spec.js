jest.mock('@/api/user', () => ({
  getRemoteBootstrap: jest.fn()
}))

import { shallowMount } from '@vue/test-utils'
import LoginView from '@/views/login/index.vue'
import { getRemoteBootstrap } from '@/api/user'

const REMOTE_BASE_URL_STORAGE_KEY = 'AI_SPEAKER_REMOTE_BASE_URL'
const REMOTE_BASE_URL_CONFIRMED_KEY = 'AI_SPEAKER_REMOTE_BASE_URL_CONFIRMED'

const passThroughStub = {
  template: '<div><slot /></div>'
}

const formStub = {
  template: '<form><slot /></form>'
}

const buttonStub = {
  template: '<button><slot /></button>'
}

const flushPromises = async(count = 4) => {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve()
  }
}

function createWrapper({
  bootstrapData,
  bootstrapError,
  routeQuery,
  dispatch = jest.fn(() => Promise.resolve())
} = {}) {
  if (bootstrapError) {
    getRemoteBootstrap.mockRejectedValueOnce(bootstrapError)
  } else {
    getRemoteBootstrap.mockResolvedValueOnce({
      data: bootstrapData || {
        candidates: [],
        suggested_remote_base_urls: [],
        saved_remote_base_url: ''
      }
    })
  }

  const routerReplace = jest.fn()
  const wrapper = shallowMount(LoginView, {
    stubs: {
      'el-alert': passThroughStub,
      'el-form': formStub,
      'el-select': passThroughStub,
      'el-option': passThroughStub,
      'el-input': passThroughStub,
      'el-button': buttonStub
    },
    mocks: {
      $route: {
        query: routeQuery || {}
      },
      $router: {
        replace: routerReplace
      },
      $store: {
        dispatch
      }
    }
  })

  return { wrapper, dispatch, routerReplace }
}

describe('LoginView remote base url visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', 'http://localhost/login')
  })

  it('shows the remote base url field when no confirmed address exists', async() => {
    const { wrapper } = createWrapper()

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('label[for="login-remote-base-url"]').exists()).toBe(true)
    expect(wrapper.vm.showRemoteBaseUrlField).toBe(true)
  })

  it('hides the remote base url section when bootstrap returns a saved address', async() => {
    const savedRemoteBaseUrl = 'http://12.12.2.51:99/api'
    const { wrapper } = createWrapper({
      bootstrapData: {
        candidates: [{ interface: 'eth0', ip: '12.12.2.51' }],
        suggested_remote_base_urls: [savedRemoteBaseUrl],
        saved_remote_base_url: savedRemoteBaseUrl
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.remoteBaseUrl).toBe(savedRemoteBaseUrl)
    expect(wrapper.vm.showRemoteBaseUrlField).toBe(false)
    expect(wrapper.find('label[for="login-remote-base-url"]').exists()).toBe(false)
    expect(localStorage.getItem(REMOTE_BASE_URL_STORAGE_KEY)).toBe(savedRemoteBaseUrl)
    expect(localStorage.getItem(REMOTE_BASE_URL_CONFIRMED_KEY)).toBe('1')
  })

  it('keeps the remote base url section hidden when a confirmed local address already exists', async() => {
    localStorage.setItem(REMOTE_BASE_URL_STORAGE_KEY, 'http://192.168.10.10:99/api')
    localStorage.setItem(REMOTE_BASE_URL_CONFIRMED_KEY, '1')

    const { wrapper } = createWrapper({
      bootstrapError: {
        message: 'bootstrap failed'
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.remoteBaseUrl).toBe('http://192.168.10.10:99/api')
    expect(wrapper.vm.showRemoteBaseUrlField).toBe(false)
    expect(wrapper.find('label[for="login-remote-base-url"]').exists()).toBe(false)
  })

  it('shows the remote base url field again after local confirmation is cleared', async() => {
    localStorage.setItem(REMOTE_BASE_URL_STORAGE_KEY, 'http://192.168.10.10:99/api')
    localStorage.setItem(REMOTE_BASE_URL_CONFIRMED_KEY, '1')

    const firstMount = createWrapper({
      bootstrapData: {
        candidates: [],
        suggested_remote_base_urls: [],
        saved_remote_base_url: ''
      }
    })
    await flushPromises()
    expect(firstMount.wrapper.vm.showRemoteBaseUrlField).toBe(false)
    firstMount.wrapper.destroy()

    localStorage.clear()

    const secondMount = createWrapper({
      bootstrapData: {
        candidates: [],
        suggested_remote_base_urls: [],
        saved_remote_base_url: ''
      }
    })
    await flushPromises()
    await secondMount.wrapper.vm.$nextTick()

    expect(secondMount.wrapper.vm.showRemoteBaseUrlField).toBe(true)
    expect(secondMount.wrapper.find('label[for="login-remote-base-url"]').exists()).toBe(true)
  })

  it('prefers the backend saved remote base url over a confirmed local cached address', async() => {
    localStorage.setItem(REMOTE_BASE_URL_STORAGE_KEY, 'http://192.168.10.10:99/api')
    localStorage.setItem(REMOTE_BASE_URL_CONFIRMED_KEY, '1')

    const savedRemoteBaseUrl = 'http://117.40.88.155:99/api'
    const { wrapper } = createWrapper({
      bootstrapData: {
        candidates: [{ interface: 'eth0', ip: '117.40.88.155' }],
        suggested_remote_base_urls: ['http://117.40.88.155:99/api'],
        saved_remote_base_url: savedRemoteBaseUrl
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.remoteBaseUrl).toBe(savedRemoteBaseUrl)
    expect(wrapper.vm.showRemoteBaseUrlField).toBe(false)
    expect(localStorage.getItem(REMOTE_BASE_URL_STORAGE_KEY)).toBe(savedRemoteBaseUrl)
    expect(localStorage.getItem(REMOTE_BASE_URL_CONFIRMED_KEY)).toBe('1')
  })

  it('keeps url-injected addresses visible for the first login and hides them after confirmation', async() => {
    const routeQuery = {
      remote_base_url: 'http://172.16.10.20:99/api'
    }
    const dispatch = jest.fn(() => Promise.resolve())
    const firstMount = createWrapper({
      routeQuery,
      bootstrapData: {
        candidates: [],
        suggested_remote_base_urls: [],
        saved_remote_base_url: ''
      },
      dispatch
    })

    await flushPromises()
    await firstMount.wrapper.vm.$nextTick()

    firstMount.wrapper.vm.form.username = 'admin'
    firstMount.wrapper.vm.form.password = '123456'

    expect(firstMount.wrapper.vm.form.remoteBaseUrl).toBe(routeQuery.remote_base_url)
    expect(firstMount.wrapper.vm.showRemoteBaseUrlField).toBe(true)
    expect(firstMount.wrapper.find('label[for="login-remote-base-url"]').exists()).toBe(true)

    await firstMount.wrapper.vm.handleLogin()

    expect(dispatch).toHaveBeenCalledWith('user/login', expect.objectContaining({
      remoteBaseUrl: routeQuery.remote_base_url,
      username: 'admin',
      password: '123456'
    }))
    expect(localStorage.getItem(REMOTE_BASE_URL_STORAGE_KEY)).toBe(routeQuery.remote_base_url)
    expect(localStorage.getItem(REMOTE_BASE_URL_CONFIRMED_KEY)).toBe('1')

    firstMount.wrapper.destroy()

    const secondMount = createWrapper({
      bootstrapData: {
        candidates: [],
        suggested_remote_base_urls: [],
        saved_remote_base_url: ''
      }
    })
    await flushPromises()
    await secondMount.wrapper.vm.$nextTick()

    expect(secondMount.wrapper.vm.form.remoteBaseUrl).toBe(routeQuery.remote_base_url)
    expect(secondMount.wrapper.vm.showRemoteBaseUrlField).toBe(false)
    expect(secondMount.wrapper.find('label[for="login-remote-base-url"]').exists()).toBe(false)
  })

  it('keeps url-injected addresses visible even when bootstrap has a saved remote base url', async() => {
    const routeQuery = {
      remote_base_url: 'http://172.16.10.20:99/api'
    }
    const savedRemoteBaseUrl = 'http://117.40.88.155:99/api'
    const { wrapper } = createWrapper({
      routeQuery,
      bootstrapData: {
        candidates: [],
        suggested_remote_base_urls: [],
        saved_remote_base_url: savedRemoteBaseUrl
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.remoteBaseUrl).toBe(routeQuery.remote_base_url)
    expect(wrapper.vm.showRemoteBaseUrlField).toBe(true)
    expect(localStorage.getItem(REMOTE_BASE_URL_STORAGE_KEY)).toBe(null)
    expect(localStorage.getItem(REMOTE_BASE_URL_CONFIRMED_KEY)).toBe(null)
  })

  it('uses the first suggested remote base url when neither backend nor local values exist', async() => {
    const suggestedRemoteBaseUrl = 'http://192.168.5.20:99/api'
    const { wrapper } = createWrapper({
      bootstrapData: {
        candidates: [{ interface: 'eth0', ip: '192.168.5.20' }],
        suggested_remote_base_urls: [suggestedRemoteBaseUrl, 'http://192.168.5.20:99/api'],
        saved_remote_base_url: ''
      }
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.form.remoteBaseUrl).toBe(suggestedRemoteBaseUrl)
    expect(wrapper.vm.showRemoteBaseUrlField).toBe(true)
  })
})
