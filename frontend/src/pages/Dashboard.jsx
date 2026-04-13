import { useMemo } from 'react'
import { Users, Gauge, AlertTriangle, ShieldAlert, Clock } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { format } from 'date-fns'

const C = { page:'#030712', card:'#111827', border:'#1f2937', cardBorder:'1px solid #1f2937' }

function statusColor(s) {
  if (s==='EMERGENCY') return { ring:'#ef4444', bg:'rgba(69,10,10,.3)', text:'#fca5a5', badge:'badge-emergency' }
  if (s==='CRITICAL')  return { ring:'#f97316', bg:'rgba(69,10,10,.2)', text:'#f87171', badge:'badge-critical'  }
  if (s==='WARNING')   return { ring:'#f59e0b', bg:'rgba(78,29,0,.3)',  text:'#fbbf24', badge:'badge-warning'   }
  return                      { ring:'#065f46', bg:'rgba(6,46,32,.2)',  text:'#34d399', badge:'badge-safe'      }
}

function barColor(count, threshold) {
  const r = count / threshold
  return r >= .95 ? '#ef4444' : r >= .80 ? '#f59e0b' : '#10b981'
}

function MetricCard({ icon:Icon, label, value, sub, color }) {
  return (
    <div style={{ background:C.card, border:C.cardBorder, borderRadius:12, padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ padding:8, background:'#1f2937', borderRadius:8, marginTop:2 }}>
          <Icon size={15} color="#9ca3af" />
        </div>
        <div>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{label}</div>
          <div style={{ fontSize:22, fontWeight:600, color: color || '#f9fafb' }}>{value}</div>
          {sub && <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )
}

function ZoneBar({ zone, snap }) {
  const count = snap?.count ?? 0
  const pct   = Math.min(100, Math.round(count / zone.threshold * 100))
  const status = snap?.status ?? 'SAFE'
  const col   = statusColor(status)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, border:`1px solid ${col.ring}`, background:col.bg, transition:'all .3s' }}>
      <div style={{ width:100, fontSize:12, color:'#d1d5db', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{zone.name}</div>
      <div style={{ flex:1, height:6, background:'#1f2937', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:99, width:`${pct}%`, background:barColor(count, zone.threshold), transition:'width .7s ease' }} />
      </div>
      <div style={{ fontSize:12, width:52, textAlign:'right', color:col.text, fontWeight:500 }}>{count}<span style={{ color:'#4b5563', fontWeight:400 }}>/{zone.threshold}</span></div>
      <span className={`badge ${col.badge}`}>{status}</span>
    </div>
  )
}

function AlertItem({ alert }) {
  const col = statusColor(alert.level?.toUpperCase())
  const ts  = alert.timestamp ? format(new Date(alert.timestamp * 1000), 'HH:mm:ss') : '--'
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'7px 8px', borderRadius:6, border:`1px solid ${col.ring}`, background:col.bg, animation:'slide-in .25s ease-out' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:col.text, marginTop:5, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:500, color:col.text }}>{alert.zone_name}</div>
        <div style={{ fontSize:11, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{alert.message}</div>
      </div>
      <div style={{ fontSize:10, color:'#6b7280', flexShrink:0 }}>{ts}</div>
    </div>
  )
}

export default function Dashboard({ zones, snapshots, alerts, history, totals }) {
  const trendData = useMemo(() => {
    const maxLen = Math.max(...Object.values(history).map(h => h.length), 0)
    if (maxLen === 0) return []
    const primary = Object.values(history)[0] || []
    return primary.map((point, i) => ({
      ts: point.ts,
      total: Object.values(history).reduce((s, h) => s + (h[i]?.count ?? 0), 0)
    }))
  }, [history])

  const zoneChartData = useMemo(() => zones.map(z => {
    const snap = Object.values(snapshots).find(s => s.zone_id === z.id)
    return { name: z.name.split(' ')[0], count: snap?.count ?? 0, threshold: z.threshold }
  }), [zones, snapshots])

  const criticalAlerts = alerts.filter(a => a.level === 'critical' || a.level === 'emergency')
  const riskColor = totals.risk > 0 ? '#f87171' : '#34d399'

  return (
    <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'#f9fafb' }}>Live Dashboard</h1>
          <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Real-time crowd monitoring — all zones</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6b7280' }}>
          <Clock size={12} />
          {format(new Date(), 'dd MMM yyyy · HH:mm:ss')}
        </div>
      </div>

      {/* Critical banner */}
      {criticalAlerts.length > 0 && (
        <div style={{ padding:'10px 14px', background:'rgba(69,10,10,.5)', border:'1px solid #dc2626', borderRadius:12, display:'flex', alignItems:'center', gap:10 }}>
          <ShieldAlert size={16} color="#f87171" />
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'#fca5a5' }}>Critical Alert Active</div>
            <div style={{ fontSize:11, color:'#f87171' }}>{criticalAlerts[0]?.message}</div>
          </div>
          <div style={{ marginLeft:'auto', fontSize:11, color:'#f87171' }}>Emergency contacts notified</div>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        <MetricCard icon={Users}        label="Total People"   value={totals.total}      sub="across all zones"   color="#60a5fa" />
        <MetricCard icon={Gauge}        label="Avg Density"    value={totals.density}    sub="people / m²"        color="#c084fc" />
        <MetricCard icon={AlertTriangle}label="Alerts"         value={totals.alertCount} sub="this session"       color="#fbbf24" />
        <MetricCard icon={ShieldAlert}  label="Zones at Risk"  value={totals.risk}       sub="above 80% capacity" color={riskColor} />
        <MetricCard icon={Users}        label="Total Entered"  value={totals.cumulative} sub="since session start" color="#22c55e" />


      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:12 }}>
        <div style={{ background:C.card, border:C.cardBorder, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12, display:'flex', justifyContent:'space-between' }}>
            <span>Total crowd — live trend</span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ display:'inline-block', width:14, height:2, background:'#3b82f6', verticalAlign:'middle' }} /> Total
              <span style={{ display:'inline-block', width:14, height:2, background:'#ef4444', verticalAlign:'middle', marginLeft:8 }} /> Threshold
            </span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={trendData} margin={{ top:4, right:4, bottom:0, left:-20 }}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" hide />
              <YAxis tick={{ fontSize:10, fill:'#6b7280' }} />
              <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, fontSize:11 }} formatter={v=>[v,'People']} labelFormatter={()=>''} />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#cg)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:C.card, border:C.cardBorder, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Zone occupancy</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={zoneChartData} margin={{ top:4, right:4, bottom:0, left:-28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:9, fill:'#6b7280' }} />
              <YAxis tick={{ fontSize:10, fill:'#6b7280' }} />
              <Tooltip contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8, fontSize:11 }} />
              <Bar dataKey="count" radius={[3,3,0,0]} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Zone status + Alerts */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:12 }}>
        <div style={{ background:C.card, border:C.cardBorder, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Zone status</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {zones.map(z => {
              const snap = Object.values(snapshots).find(s => s.zone_id === z.id)
              return <ZoneBar key={z.id} zone={z} snap={snap} />
            })}
          </div>
        </div>

        <div style={{ background:C.card, border:C.cardBorder, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Alert log</div>
          <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:240, overflowY:'auto', paddingRight:2 }}>
            {alerts.length === 0
              ? <div style={{ fontSize:11, color:'#4b5563', textAlign:'center', padding:'24px 0' }}>No alerts yet</div>
              : alerts.slice(0,30).map((a,i) => <AlertItem key={a.id ?? i} alert={a} />)
            }
          </div>
        </div>
      </div>
    </div>
  )
}
