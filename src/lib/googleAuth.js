// googleAuth — Google OAuth 2.0 authorization-code flow with refresh token support.

const KEYS = {
  accessToken:  'taski_google_access_token',
  refreshToken: 'taski_google_refresh_token',
  expiry:       'taski_google_token_expiry',
  userEmail:    'taski_google_user_email',
  userName:     'taski_google_user_name',
  connected:    'taski_google_connected',
}

function saveTokens({ accessToken, refreshToken, expiresIn }) {
  const expiry = Date.now() + ((expiresIn || 3600) * 1000)
  localStorage.setItem(KEYS.accessToken, accessToken)
  localStorage.setItem(KEYS.expiry, expiry.toString())
  localStorage.setItem(KEYS.connected, 'true')
  if (refreshToken) {
    localStorage.setItem(KEYS.refreshToken, refreshToken)
  }
}

function hasValidToken() {
  const token  = localStorage.getItem(KEYS.accessToken)
  const expiry = localStorage.getItem(KEYS.expiry)
  if (!token || !expiry) return false
  return parseInt(expiry) - Date.now() > 5 * 60 * 1000
}

function hasRefreshToken() {
  return !!localStorage.getItem(KEYS.refreshToken)
}

async function silentRefresh() {
  const refreshToken = localStorage.getItem(KEYS.refreshToken)
  if (!refreshToken) throw new Error('No refresh token')

  const result = await window.taskiAPI.googleAuthRefresh(refreshToken)
  if (!result.success) {
    signOut()
    throw new Error('Refresh failed: ' + result.error)
  }
  saveTokens({ accessToken: result.accessToken, expiresIn: result.expiresIn })
  return result.accessToken
}

export async function getValidToken() {
  if (hasValidToken()) {
    return localStorage.getItem(KEYS.accessToken)
  }
  if (hasRefreshToken()) {
    try {
      return await silentRefresh()
    } catch (e) {
      return await signIn()
    }
  }
  return await signIn()
}

export async function signIn() {
  if (!window.taskiAPI?.googleAuthStart) {
    throw new Error('Electron API not available. Make sure preload.js is configured.')
  }

  // main process opens a BrowserWindow, handles the full OAuth flow, returns tokens
  const result = await window.taskiAPI.googleAuthStart()

  if (result.success) {
    saveTokens({
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn:    result.expiresIn,
    })

    try {
      const res  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + result.accessToken },
      })
      const info = await res.json()
      localStorage.setItem(KEYS.userEmail, info.email || '')
      localStorage.setItem(KEYS.userName,  info.name  || '')
    } catch (e) { /* non-fatal */ }

    return result.accessToken
  }

  if (result.error === 'Window closed by user') {
    throw new Error('Sign in cancelled. Please try again.')
  }

  throw new Error(result.error || 'Google sign in failed')
}

export function isAuthenticated() {
  return hasValidToken() || hasRefreshToken()
}

export function signOut() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key))
}

export function getStoredEmail() {
  return localStorage.getItem(KEYS.userEmail) || ''
}

export function getStoredName() {
  return localStorage.getItem(KEYS.userName) || ''
}
