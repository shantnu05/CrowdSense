/**
 * UploadPage.jsx
 * FIX 3: Upload results are pushed to dashboard via WebSocket automatically
 */
import { useState, useRef, useCallback } from 'react'
import { Upload, Image, Film, CheckCircle, AlertCircle, Loader, Info } from 'lucide-react'

function statusStyle(s) {
  const m = {
    SAFE:      { color:'#34d399', bg:'rgba(6,78,59,.3)',   border:'#065f46' },
    WARNING:   { color:'#fbbf24', bg:'rgba(78,29,0,.3)',   border:'#92400e' },
    CRITICAL:  { color:'#f87171', bg:'rgba(69,10,10,.3)',  border:'#991b1b' },
    EMERGENCY: { color:'#fca5a5', bg:'rgba(127,29,29,.5)', border:'#ef4444' },
  }
  return m[s] ?? { color:'#9ca3af', bg:'#1f2937', border:'#374151' }
}

export default function UploadPage({ zones, uploadFrame, uploadVideo }) {
  const [file,     setFile]     = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [isVideo,  setIsVideo]  = useState(false)
  const [cameraId, setCameraId] = useState('cam-upload')
  const [zoneId,   setZoneId]   = useState(zones[0]?.id ?? '')
  const [result,   setResult]   = useState(null)
  const [jobId,    setJobId]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState('')
  const [error,    setError]    = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const pollRef = useRef()

  const handleFile = useCallback((f) => {
    if (!f) return
    setFile(f); setResult(null); setError(''); setJobId(null); setProgress('')
    if (f.type.startsWith('image/')) { setPreview(URL.createObjectURL(f)); setIsVideo(false) }
    else { setPreview(null); setIsVideo(true) }
  }, [])

  async function analyse() {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      if (!isVideo) {
        setProgress('Running YOLOv8 detection…')
        const res = await uploadFrame(cameraId, zoneId, file)
        setResult(res)
        setProgress('Done! Result also pushed to Dashboard.')
      } else {
        setProgress('Uploading video…')
        const res = await uploadVideo(cameraId, zoneId, file)
        setJobId(res.job_id)
        setProgress('Processing video frames… (this may take a minute)')
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`/api/upload/status/${res.job_id}`)
            const data = await r.json()
            if (data.status === 'complete') {
              clearInterval(pollRef.current)
              setResult(data)
              setProgress(`Complete! ${data.frames_analysed} frames analysed. Peak: ${data.peak_count} people.`)
              setLoading(false)
            }
          } catch(_) {}
        }, 1500)
        return
      }
    } catch(e) {
      setError(e?.response?.data?.detail || e.message || 'Detection failed. Is the backend running?')
    } finally {
      if (!isVideo) setLoading(false)
    }
  }

  return (
    <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <h1 style={{ fontSize:17, fontWeight:600, color:'#f9fafb' }}>Upload and Analyse</h1>
        <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Upload crowd images or video — results appear here AND on the main dashboard</p>
      </div>

      <div style={{ display:'flex', gap:8, padding:'8px 12px', background:'rgba(29,74,150,.15)', border:'1px solid #1e40af', borderRadius:8, fontSize:11, color:'#93c5fd' }}>
        <Info size={13} style={{ flexShrink:0, marginTop:1 }} />
        After detection, the result is automatically sent to the Dashboard and Analytics pages in real-time via WebSocket.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div
            style={{ border:`2px dashed ${dragOver?'#1D9E75':'#374151'}`, background:dragOver?'rgba(29,158,117,.05)':'transparent',
              borderRadius:12, padding:'28px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:10,
              cursor:'pointer', transition:'all .2s', color:dragOver?'#1D9E75':'#6b7280', textAlign:'center' }}
            onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}}
            onClick={()=>fileRef.current?.click()}
          >
            <Upload size={26} />
            <div style={{ fontSize:13 }}>Drag & drop or click to browse<br/><span style={{ fontSize:11, color:'#4b5563' }}>JPG, PNG, MP4, AVI, MOV</span></div>
            {file && <div style={{ fontSize:11, color:'#1D9E75', fontWeight:500 }}>✓ {file.name}</div>}
            <input ref={fileRef} type="file" style={{ display:'none' }} accept="image/*,video/*" onChange={e=>handleFile(e.target.files[0])} />
          </div>

          <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:12, padding:14 }}>
            <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
              onClick={analyse} disabled={!file||loading}>
              {loading ? <><Loader size={13} style={{ animation:'spin 1s linear infinite' }}/> {isVideo?'Processing video…':'Detecting…'}</>
                       : <><Upload size={13}/> {isVideo?'Analyse Video':'Detect People'}</>}
            </button>

            {progress && <div style={{ fontSize:11, color:'#34d399', marginTop:8 }}>{progress}</div>}
            {error && (
              <div style={{ fontSize:11, color:'#f87171', marginTop:8, display:'flex', gap:5 }}>
                <AlertCircle size={11} />
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}