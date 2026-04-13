// /**
//  * useCrowdSense.js - Central state hook
//  * FIX 2: Zones/cameras loaded from backend DB, saved persistently
//  * FIX 3: Upload results reflected on dashboard
//  * FIX 5: Emergency contacts managed here
//  */
// import { useState, useEffect, useRef, useCallback } from 'react'
// import axios from 'axios'

// const API = '/api'
// const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/dashboard`

// const DEFAULT_ZONES = [
//   { id:'zone-main-entry', name:'Main Entry',  threshold:80,  area_m2:40  },
//   { id:'zone-hall-a',     name:'Hall A',       threshold:150, area_m2:120 },
//   { id:'zone-hall-b',     name:'Hall B',       threshold:150, area_m2:120 },
//   { id:'zone-exit-gate',  name:'Exit Gate',    threshold:60,  area_m2:30  },
// ]
// const DEFAULT_CAMS = [
//   { id:'cam-01', zone_id:'zone-main-entry', url:'', active:false },
//   { id:'cam-02', zone_id:'zone-hall-a',     url:'', active:false },
//   { id:'cam-03', zone_id:'zone-hall-b',     url:'', active:false },
//   { id:'cam-04', zone_id:'zone-exit-gate',  url:'', active:false },
// ]

// function statusLabel(count, threshold) {
//   const r = count / threshold
//   if (r >= 1.10) return 'EMERGENCY'
//   if (r >= 0.95) return 'CRITICAL'
//   if (r >= 0.80) return 'WARNING'
//   return 'SAFE'
// }

// export default function useCrowdSense() {
//   const [connected,  setConnected]  = useState(false)
//   const [useMock,    setUseMock]    = useState(false)
//   const [zones,      setZones]      = useState(DEFAULT_ZONES)
//   const [cameras,    setCameras]    = useState(DEFAULT_CAMS)
//   const [snapshots,  setSnapshots]  = useState({})
//   const [alerts,     setAlerts]     = useState([])
//   const [history,    setHistory]    = useState({})
//   const [analytics,  setAnalytics]  = useState(null)
//   const [contacts,   setContacts]   = useState([])

//   const ws       = useRef(null)
//   const mockRef  = useRef(null)
//   const mockState = useRef({ counts: {'cam-01':55,'cam-02':90,'cam-03':60,'cam-04':25} })

//   const pushHistory = useCallback((zone_id, count) => {
//     setHistory(h => {
//       const prev = h[zone_id] || []
//       return { ...h, [zone_id]: [...prev, { ts:Date.now(), count }].slice(-60) }
//     })
//   }, [])

//   const handleMessage = useCallback((data) => {
//     if (data.type === 'init') {
//       if (data.zones)    setZones(data.zones)
//       if (data.cameras)  setCameras(data.cameras)
//       if (data.alerts)   setAlerts(data.alerts)
//       if (data.contacts) setContacts(data.contacts)
//       if (data.snapshots) {
//         const map = {}
//         data.snapshots.forEach(s => { map[s.camera_id] = s })
//         setSnapshots(map)
//       }
//       return
//     }
//     if (data.type === 'zones_updated') {
//       setZones(data.zones); return
//     }
//     if (data.type === 'contacts_updated') {
//       setContacts(data.contacts); return
//     }
//     if (data.type === 'count_update' || data.type === 'snapshot') {
//       setSnapshots(prev => ({ ...prev, [data.camera_id]: data }))
//       if (data.zone_id) pushHistory(data.zone_id, data.count)
//       return
//     }
//     if (data.type === 'alert') {
//       setAlerts(prev => [{ ...data, id: Date.now() + Math.random() }, ...prev].slice(0, 100))
//       return
//     }
//   }, [pushHistory])

//   // WebSocket connection
//   useEffect(() => {
//     let retryTimer = null
//     function connect() {
//       try {
//         const socket = new WebSocket(WS_URL)
//         ws.current = socket
//         socket.onopen = () => { setConnected(true); setUseMock(false) }
//         socket.onmessage = e => { try { handleMessage(JSON.parse(e.data)) } catch(_) {} }
//         socket.onclose = () => {
//           setConnected(false)
//           retryTimer = setTimeout(connect, 3000)
//         }
//         socket.onerror = () => socket.close()
//       } catch(_) { setUseMock(true) }
//     }
//     connect()
//     return () => { ws.current?.close(); clearTimeout(retryTimer) }
//   }, [handleMessage])

//   // Mock data loop when backend not running
//   useEffect(() => {
//     if (connected) { clearInterval(mockRef.current); return }
//     setUseMock(true)
//     mockRef.current = setInterval(() => {
//       const newSnaps = {}
//       DEFAULT_CAMS.forEach(cam => {
//         const zone = DEFAULT_ZONES.find(z => z.id === cam.zone_id)
//         const prev = mockState.current.counts[cam.id]
//         const count = Math.round(Math.max(0, Math.min(zone.threshold * 1.1,
//           prev + (Math.random() - 0.44) * 8)))
//         mockState.current.counts[cam.id] = count
//         const status = statusLabel(count, zone.threshold)
//         newSnaps[cam.id] = { camera_id:cam.id, zone_id:cam.zone_id, zone_name:zone.name,
//           count, density:+(count/zone.area_m2).toFixed(2), status, threshold:zone.threshold,
//           timestamp: Date.now()/1000 }
//         pushHistory(cam.zone_id, count)
//         if (status === 'CRITICAL' || status === 'EMERGENCY') {
//           setAlerts(prev => [{ id:Date.now()+Math.random(), level:status.toLowerCase(),
//             zone_id:cam.zone_id, zone_name:zone.name, camera_id:cam.id, count,
//             threshold:zone.threshold, message:`${zone.name}: ${count} people — ${status}`,
//             timestamp:Date.now()/1000 }, ...prev].slice(0, 100))
//         }
//       })
//       setSnapshots(newSnaps)
//     }, 1500)
//     return () => clearInterval(mockRef.current)
//   }, [connected, pushHistory])

//   // REST API calls
//   const fetchAnalytics = useCallback(async (zone_id=null, hours=24) => {
//     try {
//       const res = await axios.get(`${API}/analytics`, { params: { hours, ...(zone_id ? {zone_id} : {}) } })
//       setAnalytics(res.data)
//     } catch(_) {
//       setAnalytics({
//         stats: { avg_count:72, peak_count:134, samples:5760 },
//         hourly: Array.from({length:24},(_,i)=>({ hour:i, avg_c:40+Math.sin(i/4)*30, max_c:60+Math.sin(i/4)*40 })),
//         alert_summary: { warning:12, critical:3, emergency:0 },
//       })
//     }
//   }, [])

//   const uploadFrame = useCallback(async (cameraId, zoneId, file) => {
//     const form = new FormData(); form.append('file', file)
//     const res = await axios.post(`${API}/upload/frame/${cameraId}?zone_id=${zoneId}`, form,
//       { headers: { 'Content-Type': 'multipart/form-data' } })
//     return res.data
//   }, [])

//   const uploadVideo = useCallback(async (cameraId, zoneId, file) => {
//     const form = new FormData(); form.append('file', file)
//     const res = await axios.post(`${API}/upload/video/${cameraId}?zone_id=${zoneId}`, form,
//       { headers: { 'Content-Type': 'multipart/form-data' } })
//     return res.data
//   }, [])

//   // FIX 2: Camera operations — saved to DB
//   const startCamera = useCallback(async (cameraId, url, zoneId, fps=2) => {
//     try {
//       await axios.post(`${API}/cameras/${cameraId}/start`, { url, zone_id:zoneId, fps })
//       setCameras(prev => {
//         const exists = prev.find(c => c.id === cameraId)
//         if (exists) return prev.map(c => c.id===cameraId ? {...c, url, zone_id:zoneId, active:true} : c)
//         return [...prev, { id:cameraId, url, zone_id:zoneId, fps, active:true }]
//       })
//       return true
//     } catch(e) { console.error(e); return false }
//   }, [])

//   const stopCamera = useCallback(async (cameraId) => {
//     try {
//       await axios.post(`${API}/cameras/${cameraId}/stop`)
//       setCameras(prev => prev.map(c => c.id===cameraId ? {...c, active:false} : c))
//     } catch(_) {}
//   }, [])

//   const deleteCamera = useCallback(async (cameraId) => {
//     try {
//       await axios.delete(`${API}/cameras/${cameraId}`)
//       setCameras(prev => prev.filter(c => c.id !== cameraId))
//       setSnapshots(prev => { const n={...prev}; delete n[cameraId]; return n })
//     } catch(_) {}
//   }, [])

//   // FIX 2: Zone operations — saved to DB
//   const saveZone = useCallback(async (zone) => {
//     await axios.post(`${API}/zones/${zone.id}`, {
//       name: zone.name, area_m2: +zone.area_m2,
//       threshold: +zone.threshold,
//       camera_ids: Array.isArray(zone.camera_ids) ? zone.camera_ids
//         : zone.camera_ids.split(',').map(s=>s.trim()).filter(Boolean),
//     })
//     setZones(prev => prev.map(z => z.id===zone.id ? zone : z))
//   }, [])

//   const addZone = useCallback(async (zone) => {
//     await axios.post(`${API}/zones/${zone.id}`, {
//       name:zone.name, area_m2:+zone.area_m2, threshold:+zone.threshold,
//       camera_ids: Array.isArray(zone.camera_ids) ? zone.camera_ids
//         : zone.camera_ids.split(',').map(s=>s.trim()).filter(Boolean),
//     })
//     setZones(prev => [...prev, zone])
//   }, [])

//   const removeZone = useCallback(async (zoneId) => {
//     await axios.delete(`${API}/zones/${zoneId}`)
//     setZones(prev => prev.filter(z => z.id !== zoneId))
//   }, [])

//   // FIX 5: Contact operations
//   const addContact = useCallback(async (contact) => {
//     const res = await axios.post(`${API}/contacts`, contact)
//     setContacts(prev => [...prev, { ...contact, id:res.data.id }])
//     return res.data.id
//   }, [])

//   const updateContact = useCallback(async (id, contact) => {
//     await axios.put(`${API}/contacts/${id}`, contact)
//     setContacts(prev => prev.map(c => c.id===id ? {...c,...contact} : c))
//   }, [])

//   const removeContact = useCallback(async (id) => {
//     await axios.delete(`${API}/contacts/${id}`)
//     setContacts(prev => prev.filter(c => c.id !== id))
//   }, [])

//   const saveTwilio = useCallback(async (settings) => {
//     await axios.post(`${API}/settings/twilio`, settings)
//   }, [])

//   const totals = (() => {
//     const vals = Object.values(snapshots)
//     const total = vals.reduce((s,v) => s + (v.count||0), 0)
//     const totalArea = zones.reduce((s,z) => s + z.area_m2, 0)
//     const risk = vals.filter(v => v.status==='WARNING'||v.status==='CRITICAL'||v.status==='EMERGENCY').length
//     return { total, density: totalArea ? +(total/totalArea).toFixed(2) : 0, risk, alertCount: alerts.length }
//   })()

//   return {
//     connected, useMock,
//     zones, cameras, snapshots, alerts, history, analytics, contacts, totals,
//     setZones, setCameras,
//     fetchAnalytics, uploadFrame, uploadVideo,
//     startCamera, stopCamera, deleteCamera,
//     saveZone, addZone, removeZone,
//     addContact, updateContact, removeContact, saveTwilio,
//   }
// }



//_______________
/**
 * useCrowdSense.js - Central state hook
 * FIX 2: Zones/cameras loaded from backend DB, saved persistently
 * FIX 3: Upload results reflected on dashboard
 * FIX 5: Emergency contacts managed here
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const API = '/api'
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/dashboard`

const DEFAULT_ZONES = [
  { id:'zone-main-entry', name:'Main Entry',  threshold:80,  area_m2:40  },
  { id:'zone-hall-a',     name:'Hall A',       threshold:150, area_m2:120 },
  { id:'zone-hall-b',     name:'Hall B',       threshold:150, area_m2:120 },
  { id:'zone-exit-gate',  name:'Exit Gate',    threshold:60,  area_m2:30  },
]
const DEFAULT_CAMS = [
  { id:'cam-01', zone_id:'zone-main-entry', url:'', active:false },
  { id:'cam-02', zone_id:'zone-hall-a',     url:'', active:false },
  { id:'cam-03', zone_id:'zone-hall-b',     url:'', active:false },
  { id:'cam-04', zone_id:'zone-exit-gate',  url:'', active:false },
]

function statusLabel(count, threshold) {
  const r = count / threshold
  if (r >= 1.10) return 'EMERGENCY'
  if (r >= 0.95) return 'CRITICAL'
  if (r >= 0.80) return 'WARNING'
  return 'SAFE'
}

export default function useCrowdSense() {
  const [connected,  setConnected]  = useState(false)
  const [useMock,    setUseMock]    = useState(false)
  const [zones,      setZones]      = useState(DEFAULT_ZONES)
  const [cameras,    setCameras]    = useState(DEFAULT_CAMS)
  const [snapshots,  setSnapshots]  = useState({})
  const [alerts,     setAlerts]     = useState([])
  const [history,    setHistory]    = useState({})
  const [analytics,  setAnalytics]  = useState(null)
  const [contacts,   setContacts]   = useState([])

  const ws       = useRef(null)
  const mockRef  = useRef(null)
  const mockState = useRef({ counts: {'cam-01':55,'cam-02':90,'cam-03':60,'cam-04':25} })

  const pushHistory = useCallback((zone_id, count) => {
    setHistory(h => {
      const prev = h[zone_id] || []
      return { ...h, [zone_id]: [...prev, { ts:Date.now(), count }].slice(-60) }
    })
  }, [])

  const handleMessage = useCallback((data) => {
    if (data.type === 'init') {
      if (data.zones)    setZones(data.zones)
      if (data.cameras)  setCameras(data.cameras)
      if (data.alerts)   setAlerts(data.alerts)
      if (data.contacts) setContacts(data.contacts)
      if (data.snapshots) {
        const map = {}
        data.snapshots.forEach(s => { map[s.camera_id] = s })
        setSnapshots(map)
      }
      return
    }
    if (data.type === 'zones_updated') {
      setZones(data.zones); return
    }
    if (data.type === 'contacts_updated') {
      setContacts(data.contacts); return
    }
    if (data.type === 'count_update' || data.type === 'snapshot') {
      // ✅ NEW: cumulative_count is now included in snapshot
      setSnapshots(prev => ({ ...prev, [data.camera_id]: data }))
      if (data.zone_id) pushHistory(data.zone_id, data.count)
      return
    }
    if (data.type === 'alert') {
      setAlerts(prev => [{ ...data, id: Date.now() + Math.random() }, ...prev].slice(0, 100))
      return
    }
  }, [pushHistory])

  // WebSocket connection
  useEffect(() => {
    let retryTimer = null
    function connect() {
      try {
        const socket = new WebSocket(WS_URL)
        ws.current = socket
        socket.onopen = () => { setConnected(true); setUseMock(false) }
        socket.onmessage = e => { try { handleMessage(JSON.parse(e.data)) } catch(_) {} }
        socket.onclose = () => {
          setConnected(false)
          retryTimer = setTimeout(connect, 3000)
        }
        socket.onerror = () => socket.close()
      } catch(_) { setUseMock(true) }
    }
    connect()
    return () => { ws.current?.close(); clearTimeout(retryTimer) }
  }, [handleMessage])

  // Mock data loop when backend not running
  useEffect(() => {
    if (connected) { clearInterval(mockRef.current); return }
    setUseMock(true)
    mockRef.current = setInterval(() => {
      const newSnaps = {}
      DEFAULT_CAMS.forEach(cam => {
        const zone = DEFAULT_ZONES.find(z => z.id === cam.zone_id)
        const prev = mockState.current.counts[cam.id]
        const count = Math.round(Math.max(0, Math.min(zone.threshold * 1.1,
          prev + (Math.random() - 0.44) * 8)))
        mockState.current.counts[cam.id] = count
        const status = statusLabel(count, zone.threshold)
        newSnaps[cam.id] = { camera_id:cam.id, zone_id:cam.zone_id, zone_name:zone.name,
          count, density:+(count/zone.area_m2).toFixed(2), status, threshold:zone.threshold,
          timestamp: Date.now()/1000,
          cumulative_count: (prev + count) // ✅ simple mock cumulative count
        }
        pushHistory(cam.zone_id, count)
        if (status === 'CRITICAL' || status === 'EMERGENCY') {
          setAlerts(prev => [{ id:Date.now()+Math.random(), level:status.toLowerCase(),
            zone_id:cam.zone_id, zone_name:zone.name, camera_id:cam.id, count,
            threshold:zone.threshold, message:`${zone.name}: ${count} people — ${status}`,
            timestamp:Date.now()/1000 }, ...prev].slice(0, 100))
        }
      })
      setSnapshots(newSnaps)
    }, 1500)
    return () => clearInterval(mockRef.current)
  }, [connected, pushHistory])

  // REST API calls
  const fetchAnalytics = useCallback(async (zone_id=null, hours=24) => {
    try {
      const res = await axios.get(`${API}/analytics`, { params: { hours, ...(zone_id ? {zone_id} : {}) } })
      setAnalytics(res.data)
    } catch(_) {
      setAnalytics({
        stats: { avg_count:72, peak_count:134, samples:5760, total_entered:200 }, // ✅ include total_entered
        hourly: Array.from({length:24},(_,i)=>({ hour:i, avg_c:40+Math.sin(i/4)*30, max_c:60+Math.sin(i/4)*40, total_c: i*10 })),
        alert_summary: { warning:12, critical:3, emergency:0 },
      })
    }
  }, [])

  const uploadFrame = useCallback(async (cameraId, zoneId, file) => {
    const form = new FormData(); form.append('file', file)
    const res = await axios.post(`${API}/upload/frame/${cameraId}?zone_id=${zoneId}`, form,
      { headers: { 'Content-Type': 'multipart/form-data' } })
    return res.data
  }, [])

  const uploadVideo = useCallback(async (cameraId, zoneId, file) => {
    const form = new FormData(); form.append('file', file)
    const res = await axios.post(`${API}/upload/video/${cameraId}?zone_id=${zoneId}`, form,
      { headers: { 'Content-Type': 'multipart/form-data' } })
    return res.data
  }, [])

  // FIX 2: Camera operations — saved to DB
  const startCamera = useCallback(async (cameraId, url, zoneId, fps=2) => {
    try {
      await axios.post(`${API}/cameras/${cameraId}/start`, { url, zone_id:zoneId, fps })
      setCameras(prev => {
        const exists = prev.find(c => c.id === cameraId)
        if (exists) return prev.map(c => c.id===cameraId ? {...c, url, zone_id:zoneId, active:true} : c)
        return [...prev, { id:cameraId, url, zone_id:zoneId, fps, active:true }]
      })
      return true
    } catch(e) { console.error(e); return false }
  }, [])
    const stopCamera = useCallback(async (cameraId) => {
    try {
      await axios.post(`${API}/cameras/${cameraId}/stop`)
      setCameras(prev => prev.map(c => c.id===cameraId ? {...c, active:false} : c))
    } catch(_) {}
  }, [])

  const deleteCamera = useCallback(async (cameraId) => {
    try {
      await axios.delete(`${API}/cameras/${cameraId}`)
      setCameras(prev => prev.filter(c => c.id !== cameraId))
      setSnapshots(prev => { const n={...prev}; delete n[cameraId]; return n })
    } catch(_) {}
  }, [])

  // FIX 2: Zone operations — saved to DB
  const saveZone = useCallback(async (zone) => {
    await axios.post(`${API}/zones/${zone.id}`, {
      name: zone.name, area_m2: +zone.area_m2,
      threshold: +zone.threshold,
      camera_ids: Array.isArray(zone.camera_ids) ? zone.camera_ids
        : zone.camera_ids.split(',').map(s=>s.trim()).filter(Boolean),
    })
    setZones(prev => prev.map(z => z.id===zone.id ? zone : z))
  }, [])

  const addZone = useCallback(async (zone) => {
    await axios.post(`${API}/zones/${zone.id}`, {
      name:zone.name, area_m2:+zone.area_m2, threshold:+zone.threshold,
      camera_ids: Array.isArray(zone.camera_ids) ? zone.camera_ids
        : zone.camera_ids.split(',').map(s=>s.trim()).filter(Boolean),
    })
    setZones(prev => [...prev, zone])
  }, [])

  const removeZone = useCallback(async (zoneId) => {
    await axios.delete(`${API}/zones/${zoneId}`)
    setZones(prev => prev.filter(z => z.id !== zoneId))
  }, [])

  // FIX 5: Contact operations
  const addContact = useCallback(async (contact) => {
    const res = await axios.post(`${API}/contacts`, contact)
    setContacts(prev => [...prev, { ...contact, id:res.data.id }])
    return res.data.id
  }, [])

  const updateContact = useCallback(async (id, contact) => {
    await axios.put(`${API}/contacts/${id}`, contact)
    setContacts(prev => prev.map(c => c.id===id ? {...c,...contact} : c))
  }, [])

  const removeContact = useCallback(async (id) => {
    await axios.delete(`${API}/contacts/${id}`)
    setContacts(prev => prev.filter(c => c.id !== id))
  }, [])

  const saveTwilio = useCallback(async (settings) => {
    await axios.post(`${API}/settings/twilio`, settings)
  }, [])

  // Totals calculation — now includes cumulative counts
  const totals = (() => {
    const vals = Object.values(snapshots)
    const total = vals.reduce((s,v) => s + (v.count||0), 0)
    const cumulative = vals.reduce((s,v) => s + (v.cumulative_count||0), 0) // ✅ NEW
    const totalArea = zones.reduce((s,z) => s + z.area_m2, 0)
    const risk = vals.filter(v => v.status==='WARNING'||v.status==='CRITICAL'||v.status==='EMERGENCY').length
    return { 
      total, 
      cumulative,   // ✅ NEW field exposed to frontend
      density: totalArea ? +(total/totalArea).toFixed(2) : 0, 
      risk, 
      alertCount: alerts.length 
    }
  })()

  return {
    connected, useMock,
    zones, cameras, snapshots, alerts, history, analytics, contacts, totals,
    setZones, setCameras,
    fetchAnalytics, uploadFrame, uploadVideo,
    startCamera, stopCamera, deleteCamera,
    saveZone, addZone, removeZone,
    addContact, updateContact, removeContact, saveTwilio,
  }
}