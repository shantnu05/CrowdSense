import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Camera, BarChart3, Upload, Settings, Phone } from 'lucide-react'
import useCrowdSense from './useCrowdSense'
import Dashboard  from './pages/Dashboard'
import CameraFeed from './pages/CameraFeed'
import Analytics  from './pages/Analytics'
import ZoneConfig from './pages/ZoneConfig'
import UploadPage from './pages/UploadPage'
import Emergency  from './pages/Emergency'

const nav = [
  { to:'/',           icon:LayoutDashboard, label:'Dashboard' },
  { to:'/cameras',    icon:Camera,          label:'Cameras'   },
  { to:'/analytics',  icon:BarChart3,        label:'Analytics' },
  { to:'/upload',     icon:Upload,           label:'Upload'    },
  { to:'/zones',      icon:Settings,         label:'Zones'     },
  { to:'/emergency',  icon:Phone,            label:'Emergency' },
]

export default function App() {
  const ctx = useCrowdSense()
  const critCount = ctx.alerts.filter(a => a.level==='critical'||a.level==='emergency').length

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#030712' }}>
      <aside style={{ width:190, flexShrink:0, background:'#0f1117', borderRight:'1px solid #1f2937', display:'flex', flexDirection:'column', padding:'12px 8px' }}>
        <div style={{ padding:'6px 8px', marginBottom:10, borderBottom:'1px solid #1f2937', paddingBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:9, height:9, borderRadius:'50%', background: ctx.connected ? '#10b981' : '#4b5563',
              animation: ctx.connected ? 'ping-slow 1.5s ease-in-out infinite' : 'none', flexShrink:0 }} />
            <span style={{ fontSize:15, fontWeight:600, color:'#f9fafb' }}>CrowdSense</span>
          </div>
          <div style={{ fontSize:10, color:'#6b7280', marginTop:3, paddingLeft:16 }}>
            {ctx.connected ? 'Backend connected' : ctx.useMock ? 'Demo mode (no backend)' : 'Connecting…'}
          </div>
        </div>

        <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2, paddingTop:4 }}>
          {nav.map(({ to, icon:Icon, label }) => (
            <NavLink key={to} to={to} end={to==='/'} className={({ isActive }) => `nav-link${isActive?' active':''}`}>
              <Icon size={14} />
              {label}
              {label==='Emergency' && ctx.contacts.length === 0 &&
                <span style={{ marginLeft:'auto', fontSize:9, background:'#dc2626', color:'#fff', padding:'1px 5px', borderRadius:99 }}>Setup</span>}
            </NavLink>
          ))}
        </nav>

        {critCount > 0 && (
          <div style={{ margin:'6px 0', padding:'8px 10px', background:'rgba(69,10,10,.6)', border:'1px solid #991b1b', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'#fca5a5', fontWeight:500 }}>⚠ {critCount} critical alert{critCount>1?'s':''}</div>
          </div>
        )}
      </aside>

      <main style={{ flex:1, overflow:'auto', background:'#030712' }}>
        <Routes>
          <Route path="/"           element={<Dashboard  {...ctx} />} />
          <Route path="/cameras"    element={<CameraFeed {...ctx} />} />
          <Route path="/analytics"  element={<Analytics  {...ctx} />} />
          <Route path="/upload"     element={<UploadPage {...ctx} />} />
          <Route path="/zones"      element={<ZoneConfig {...ctx} />} />
          <Route path="/emergency"  element={<Emergency  {...ctx} />} />
        </Routes>
      </main>
    </div>
  )
}
