/**
 * CameraFeed.jsx
 * FIX 1: Uses MJPEG stream endpoint for live continuous video
 * FIX 2: Camera add/remove/edit saved to backend DB
 */
import { useState } from 'react'
import { Plus, Trash2, Play, Square, Wifi, WifiOff } from 'lucide-react'

const C = { card:'#111827', border:'1px solid #1f2937' }

function statusRing(s) {
  return s==='EMERGENCY'?'#ef4444':s==='CRITICAL'?'#f97316':s==='WARNING'?'#f59e0b':'#374151'
}
function statusCol(s) {
  return s==='EMERGENCY'?'#fca5a5':s==='CRITICAL'?'#f87171':s==='WARNING'?'#fbbf24':'#34d399'
}

function CameraTile({ cam, snap, zones, onStop, onDelete, backendUrl }) {
  const zone     = zones.find(z => z.id === (snap?.zone_id || cam.zone_id))
  const status   = snap?.status ?? 'OFFLINE'
  const count    = snap?.count  ?? 0
  const threshold= snap?.threshold ?? zone?.threshold ?? 100
  const pct      = Math.min(100, Math.round(count / threshold * 100))
  const barCol   = pct>=95?'#ef4444':pct>=80?'#f59e0b':'#10b981'
  const isRunning = cam.active || !!snap

  // FIX 1: Use MJPEG stream URL instead of base64 snapshot
  const streamUrl = backendUrl ? `${backendUrl}/stream/${cam.id}` : null

  return (
    <div style={{ background:C.card, border:`2px solid ${statusRing(status)}`, borderRadius:12, padding:12, transition:'transform .15s' }}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.005)'}
      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
    >
      {/* Video area */}
      <div style={{ aspectRatio:'16/9', background:'#050508', borderRadius:8, overflow:'hidden', position:'relative', marginBottom:10 }}>
        {isRunning && streamUrl ? (
          // FIX 1: Real MJPEG stream — continuous live video
          <img src={streamUrl} alt="live feed"
            style={{ width:'100%', height:'100%', objectFit:'cover' }}
            onError={e => { e.target.style.display='none' }}
          />
        ) : snap?.frame_b64 ? (
          <img src={`data:image/jpeg;base64,${snap.frame_b64}`} alt="last frame"
            style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        ) : (
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
            <WifiOff size={22} color="#374151" />
            <span style={{ fontSize:10, color:'#4b5563', textAlign:'center', padding:'0 12px' }}>
              {cam.url ? 'Stream offline — check camera URL' : 'No camera URL configured'}
            </span>
          </div>
        )}

        {/* Overlays */}
        <div style={{ position:'absolute', top:5, left:5, display:'flex', alignItems:'center', gap:4 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:isRunning?'#ef4444':'#374151',
            animation:isRunning?'ping-slow 1.2s infinite':'none' }} />
          <span style={{ fontSize:9, color:'rgba(255,255,255,.8)', background:'rgba(0,0,0,.6)', padding:'1px 6px', borderRadius:3, fontFamily:'monospace' }}>{cam.id}</span>
        </div>
        <div style={{ position:'absolute', top:5, right:5, fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:99,
          background:'rgba(0,0,0,.75)', color:statusCol(status) }}>{status}</div>
        {snap?.inference_ms &&
          <div style={{ position:'absolute', bottom:5, left:5, fontSize:9, color:'rgba(255,255,255,.5)', background:'rgba(0,0,0,.5)', padding:'1px 5px', borderRadius:3 }}>{snap.inference_ms}ms</div>}
      </div>

      {/* Info row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:500, color:'#f9fafb' }}>{zone?.name ?? cam.zone_id}</div>
          {cam.url && <div style={{ fontSize:9, color:'#4b5563', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{cam.url}</div>}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {isRunning
            ? <button className="btn" style={{ padding:'3px 8px', fontSize:11 }} onClick={()=>onStop(cam.id)}><Square size={10}/> Stop</button>
            : null}
          <button className="btn btn-danger" style={{ padding:'3px 8px', fontSize:11 }} onClick={()=>onDelete(cam.id)}><Trash2 size={10}/></button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <div style={{ flex:1, height:4, background:'#1f2937', borderRadius:99, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:barCol, borderRadius:99, transition:'width .5s' }} />
        </div>
        <span style={{ fontSize:11, color:'#9ca3af' }}>{count}/{threshold}</span>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#6b7280' }}>
        <span>Density: {snap?.density ?? '—'} p/m²</span>
        {snap?.predicted_count && <span style={{ color:'#f59e0b' }}>↑ predicted: {snap.predicted_count}</span>}
      </div>
    </div>
  )
}

function AddCameraModal({ zones, onClose, onStart }) {
  const [cameraId, setCameraId] = useState(`cam-0${Math.floor(Math.random()*9)+1}`)
  const [url,      setUrl]      = useState('')
  const [zoneId,   setZoneId]   = useState(zones[0]?.id ?? '')
  const [fps,      setFps]      = useState(2)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function submit() {
    if (!cameraId.trim()) { setError('Camera ID required'); return }
    if (!url.trim())      { setError('Stream URL required'); return }
    if (!zoneId)          { setError('Zone required'); return }
    setLoading(true)
    const ok = await onStart(cameraId.trim(), url.trim(), zoneId, fps)
    setLoading(false)
    if (ok) onClose()
    else setError('Failed to connect. Check the URL and ensure the backend is running.')
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
      <div style={{ background:'#111827', border:'1px solid #374151', borderRadius:14, padding:24, width:'100%', maxWidth:440 }}>
        <h2 style={{ fontSize:15, fontWeight:600, color:'#f9fafb', marginBottom:4 }}>Add Camera</h2>
        <p style={{ fontSize:11, color:'#6b7280', marginBottom:16 }}>Camera settings are saved to the database and will persist between sessions.</p>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <div style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>Camera ID</div>
            <input value={cameraId} onChange={e=>setCameraId(e.target.value)} placeholder="cam-01" />
          </div>
          <div>
            <div style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>Stream URL</div>
            <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="http://192.168.x.x:8080/video" />
            <div style={{ fontSize:10, color:'#4b5563', marginTop:4, lineHeight:1.5 }}>
              <strong style={{ color:'#6b7280' }}>IP Webcam (Android):</strong> Install app → Start server → copy URL shown on phone<br/>
              <strong style={{ color:'#6b7280' }}>RTSP camera:</strong> rtsp://user:pass@192.168.x.x:554/stream<br/>
              <strong style={{ color:'#6b7280' }}>Local webcam:</strong> Enter <code style={{ color:'#10b981' }}>0</code>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <div style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>Zone</div>
              <select value={zoneId} onChange={e=>setZoneId(e.target.value)}>
                {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>Process FPS</div>
              <select value={fps} onChange={e=>setFps(+e.target.value)}>
                <option value={1}>1 fps (low CPU)</option>
                <option value={2}>2 fps (recommended)</option>
                <option value={5}>5 fps (high CPU)</option>
              </select>
            </div>
          </div>
          {error && <div style={{ fontSize:11, color:'#f87171', padding:'6px 10px', background:'rgba(69,10,10,.3)', border:'1px solid #991b1b', borderRadius:6 }}>{error}</div>}
        </div>

        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={submit} disabled={loading}>
            <Play size={12}/> {loading ? 'Connecting…' : 'Start Camera'}
          </button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function CameraFeed({ zones, cameras, snapshots, startCamera, stopCamera, deleteCamera, connected }) {
  const [showAdd, setShowAdd] = useState(false)
  // Derive backend URL from current page
  const backendUrl = connected ? `http://${location.hostname}:8000` : null

  const allCamIds = [...new Set([...cameras.map(c=>c.id), ...Object.keys(snapshots)])]
  const camMap = Object.fromEntries(cameras.map(c=>[c.id,c]))

  return (
    <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'#f9fafb' }}>Camera Feeds</h1>
          <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
            {allCamIds.length} camera{allCamIds.length!==1?'s':''} configured
            {!connected && <span style={{ color:'#f59e0b' }}> · Demo mode — add backend for live streams</span>}
          </p>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={13}/> Add Camera</button>
      </div>

      {allCamIds.length === 0 && (
        <div style={{ textAlign:'center', padding:'48px 24px', border:'1px dashed #374151', borderRadius:12, color:'#4b5563' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📷</div>
          <div style={{ fontSize:14, color:'#6b7280', marginBottom:6 }}>No cameras configured</div>
          <div style={{ fontSize:12, marginBottom:16 }}>Click "Add Camera" to connect your IP Webcam or RTSP camera</div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={13}/> Add First Camera</button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:14 }}>
        {allCamIds.map(camId => (
          <CameraTile key={camId}
            cam={camMap[camId] || { id:camId, url:'', zone_id:'', active:false }}
            snap={snapshots[camId]}
            zones={zones}
            onStop={stopCamera}
            onDelete={deleteCamera}
            backendUrl={backendUrl}
          />
        ))}
      </div>

      {showAdd && <AddCameraModal zones={zones} onClose={()=>setShowAdd(false)} onStart={startCamera} />}
    </div>
  )
}
