/**
 * ZoneConfig.jsx
 * FIX 2: All zone edits saved to backend DB and persist
 */
import { useState } from 'react'
import { Plus, Trash2, Save, MapPin, CheckCircle } from 'lucide-react'

function ZoneCard({ zone, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form,    setForm]    = useState({ ...zone, camera_ids: Array.isArray(zone.camera_ids) ? zone.camera_ids.join(', ') : zone.camera_ids })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    setSaving(true); setError('')
    try {
      await onSave({
        ...form,
        area_m2: +form.area_m2,
        threshold: +form.threshold,
        camera_ids: typeof form.camera_ids === 'string'
          ? form.camera_ids.split(',').map(s=>s.trim()).filter(Boolean)
          : form.camera_ids,
      })
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch(e) {
      setError('Save failed — is the backend running?')
    } finally { setSaving(false) }
  }

  const camIds = Array.isArray(zone.camera_ids) ? zone.camera_ids.join(', ') : zone.camera_ids

  return (
    <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:14, marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <MapPin size={13} color="#1D9E75" />
          {editing
            ? <input value={form.name} onChange={e=>set('name',e.target.value)} style={{ width:160, fontWeight:500 }} />
            : <span style={{ fontSize:13, fontWeight:500, color:'#f9fafb' }}>{zone.name}</span>
          }
          {saved && <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#34d399' }}><CheckCircle size={10}/> Saved!</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {editing ? (
            <>
              <button className="btn" style={{ fontSize:11, padding:'3px 10px', color:'#34d399', borderColor:'#065f46' }} onClick={save} disabled={saving}>
                <Save size={10}/> {saving ? 'Saving…' : 'Save to DB'}
              </button>
              <button className="btn" style={{ fontSize:11, padding:'3px 10px' }} onClick={()=>setEditing(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn" style={{ fontSize:11, padding:'3px 10px' }} onClick={()=>setEditing(true)}>Edit</button>
          )}
          <button className="btn btn-danger" style={{ fontSize:11, padding:'3px 8px' }} onClick={()=>onDelete(zone.id)}>
            <Trash2 size={11}/>
          </button>
        </div>
      </div>

      {error && <div style={{ fontSize:11, color:'#f87171', marginBottom:8 }}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[
          { label:'Max capacity (people)', key:'threshold' },
          { label:'Zone area (m²)',        key:'area_m2'   },
          { label:'Camera IDs',            key:'camera_ids' },
        ].map(({ label, key }) => (
          <div key={key}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>{label}</div>
            {editing
              ? <input value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={key==='camera_ids'?'cam-01, cam-02':''} />
              : <div style={{ fontSize:12, color:'#d1d5db', fontWeight:key==='threshold'?500:400 }}>
                  {key==='camera_ids' ? (camIds||'none') : zone[key]}
                </div>
            }
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:16, marginTop:10, fontSize:10, color:'#4b5563' }}>
        <span>Density limit: <strong style={{ color:'#9ca3af' }}>{(zone.threshold / Math.max(1, zone.area_m2)).toFixed(2)} p/m²</strong></span>
        <span>Zone ID: <code style={{ color:'#6b7280' }}>{zone.id}</code></span>
      </div>
    </div>
  )
}

function NewZoneForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ id:'', name:'', threshold:100, area_m2:80, camera_ids:'' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function submit() {
    if (!form.id.trim() || !form.name.trim()) { setError('Zone ID and Name are required'); return }
    setSaving(true); setError('')
    try {
      await onAdd({
        ...form, area_m2:+form.area_m2, threshold:+form.threshold,
        camera_ids: form.camera_ids.split(',').map(s=>s.trim()).filter(Boolean),
      })
      onClose()
    } catch(e) { setError('Save failed — is backend running? Check console.') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background:'#111827', border:'1px dashed #1D9E75', borderRadius:10, padding:16, marginBottom:12 }}>
      <div style={{ fontSize:12, fontWeight:500, color:'#34d399', marginBottom:12 }}>+ New Zone</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        {[
          { label:'Zone ID (no spaces)',  key:'id',         placeholder:'zone-foyer'  },
          { label:'Display Name',         key:'name',       placeholder:'Main Foyer'  },
          { label:'Max Capacity (people)',key:'threshold',  placeholder:'100'         },
          { label:'Area (m²)',            key:'area_m2',    placeholder:'80'          },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>{label}</div>
            <input value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        <div style={{ gridColumn:'span 2' }}>
          <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Camera IDs (comma-separated)</div>
          <input value={form.camera_ids} onChange={e=>set('camera_ids',e.target.value)} placeholder="cam-01, cam-02" />
        </div>
      </div>
      {error && <div style={{ fontSize:11, color:'#f87171', marginBottom:8 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}><Plus size={12}/>{saving?'Saving…':'Save Zone to DB'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export default function ZoneConfig({ zones, saveZone, addZone, removeZone }) {
  const [showNew, setShowNew] = useState(false)

  return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'#f9fafb' }}>Zone Configuration</h1>
          <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>All changes save to the database — persistent across restarts</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowNew(s=>!s)}><Plus size={13}/>New Zone</button>
      </div>

      <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:14, marginBottom:16 }}>
        <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Alert thresholds (% of zone max capacity)</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { pct:'80%',  label:'Warning',   desc:'Alert security on dashboard',  col:'#fbbf24', bg:'rgba(78,29,0,.4)'   },
            { pct:'95%',  label:'Critical',  desc:'SMS sent to emergency contacts', col:'#f97316', bg:'rgba(69,26,3,.4)' },
            { pct:'110%', label:'Emergency', desc:'Auto-call ambulance & police',  col:'#f87171', bg:'rgba(69,10,10,.4)' },
          ].map(({ pct, label, desc, col, bg }) => (
            <div key={label} style={{ padding:'10px 12px', borderRadius:8, background:bg, border:`1px solid ${col}55` }}>
              <div style={{ fontSize:18, fontWeight:700, color:col }}>{pct}</div>
              <div style={{ fontSize:12, color:col, fontWeight:500, marginTop:1 }}>{label}</div>
              <div style={{ fontSize:10, color:'#9ca3af', marginTop:3 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {showNew && <NewZoneForm onAdd={addZone} onClose={()=>setShowNew(false)} />}

      {zones.length === 0
        ? <div style={{ textAlign:'center', padding:32, color:'#4b5563', fontSize:13 }}>No zones configured. Add your first zone above.</div>
        : zones.map(z => (
            <ZoneCard key={z.id} zone={z}
              onSave={saveZone}
              onDelete={id => { if(confirm(`Delete zone "${z.name}"?`)) removeZone(id) }} />
          ))
      }
    </div>
  )
}