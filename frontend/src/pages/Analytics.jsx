import { useEffect, useState } from 'react'
import { TrendingUp, AlertTriangle, Users, Clock } from 'lucide-react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const C = { card:'#111827', border:'1px solid #1f2937', borderR:12 }
const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6']

export default function Analytics({ zones, fetchAnalytics, analytics, history }) {
  const [hours,   setHours]   = useState(24)
  const [zoneId,  setZoneId]  = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchAnalytics(zoneId || null, hours).finally(() => setLoading(false))
  }, [hours, zoneId])

  const hourlyData = analytics?.hourly?.map((h, i) => ({
    hour: `${String(i).padStart(2,'0')}:00`,
    avg:  Math.round(h.avg_c ?? h.avg_count ?? 0),
    peak: Math.round(h.max_c ?? 0),
  })) ?? []

  const alertSummary = analytics?.alert_summary ?? {}
  const stats = analytics?.stats ?? {}

  const multiLineData = (() => {
    const maxLen = Math.max(...Object.values(history).map(h => h.length), 0)
    if (maxLen === 0) return []
    return Array.from({ length: maxLen }, (_, i) => {
      const point = { i }
      zones.forEach(z => { const h = history[z.id]; if (h?.[i]) point[z.name] = h[i].count })
      return point
    })
  })()

  const metrics = [
    { icon:Users,         label:'Avg crowd',    value: Math.round(stats.avg_count ?? 0),       color:'#60a5fa' },
    { icon:TrendingUp,    label:'Peak count',   value: stats.peak_count ?? 0,                  color:'#c084fc' },
    { icon:Clock,         label:'Samples',      value: (stats.samples ?? 0).toLocaleString(),  color:'#d1d5db' },
    { icon:AlertTriangle, label:'Total alerts', value: Object.values(alertSummary).reduce((a,b)=>a+b,0), color:'#fbbf24' },
  ]

  return (
    <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'#f9fafb' }}>Analytics</h1>
          <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Historical crowd data and trends</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <select value={zoneId} onChange={e=>setZoneId(e.target.value)} style={{ width:'auto' }}>
            <option value="">All zones</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={hours} onChange={e=>setHours(+e.target.value)} style={{ width:'auto' }}>
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
          </select>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {metrics.map(({ icon:Icon, label, value, color }) => (
          <div key={label} style={{ background:C.card, border:C.border, borderRadius:C.borderR, padding:'12px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <Icon size={13} color="#6b7280" />
              <span style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</span>
            </div>
            <div style={{ fontSize:22, fontWeight:600, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.card, border:C.border, borderRadius:C.borderR, padding:14 }}>
        <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Hourly crowd average & peak — last {hours}h</div>
        {loading
          ? <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:13 }}>Loading…</div>
          : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData} margin={{ top:4, right:4, bottom:0, left:-20 }}>
                <defs>
                  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={.2}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="hour" tick={{ fontSize:9, fill:'#6b7280' }} interval={3} />
                <YAxis tick={{ fontSize:10, fill:'#6b7280' }} />
                <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, fontSize:11 }} />
                <Legend wrapperStyle={{ fontSize:11, color:'#9ca3af' }} />
                <Area type="monotone" dataKey="avg"  stroke="#3b82f6" fill="url(#ag)" strokeWidth={2} dot={false} name="Avg count" />
                <Area type="monotone" dataKey="peak" stroke="#f59e0b" fill="url(#pg)" strokeWidth={1.5} dot={false} name="Peak" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )
        }
      </div>

      <div style={{ background:C.card, border:C.border, borderRadius:C.borderR, padding:14 }}>
        <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Per-zone live comparison</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={multiLineData} margin={{ top:4, right:4, bottom:0, left:-20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis hide />
            <YAxis tick={{ fontSize:10, fill:'#6b7280' }} />
            <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, fontSize:11 }} />
            <Legend wrapperStyle={{ fontSize:11, color:'#9ca3af' }} />
            {zones.map((z,i) => <Line key={z.id} type="monotone" dataKey={z.name} stroke={COLORS[i%COLORS.length]} strokeWidth={2} dot={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ background:C.card, border:C.border, borderRadius:C.borderR, padding:14 }}>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Alert breakdown</div>
          {[
            { level:'warning',   label:'Warnings',    color:'#f59e0b' },
            { level:'critical',  label:'Critical',    color:'#f97316' },
            { level:'emergency', label:'Emergencies', color:'#ef4444' },
          ].map(({ level, label, color }) => {
            const count = alertSummary[level] ?? 0
            const max = Math.max(...Object.values(alertSummary), 1)
            return (
              <div key={level} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11 }}>
                  <span style={{ color }}>{label}</span>
                  <span style={{ color:'#9ca3af' }}>{count}</span>
                </div>
                <div style={{ height:5, background:'#1f2937', borderRadius:99 }}>
                  <div style={{ height:'100%', width:`${(count/max)*100}%`, background:color, borderRadius:99 }} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ background:C.card, border:C.border, borderRadius:C.borderR, padding:14 }}>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Zone capacity</div>
          {zones.map(z => (
            <div key={z.id} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9ca3af', marginBottom:8 }}>
              <span>{z.name}</span>
              <span style={{ color:'#6b7280' }}>cap {z.threshold} · {z.area_m2}m² · {(z.threshold/z.area_m2).toFixed(1)}p/m²</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
