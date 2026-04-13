/**
 * Emergency.jsx - FIX 5
 * Manually add ambulance, police, hospital numbers
 * Twilio config for auto-call/SMS
 */
import { useState } from 'react'
import { Plus, Trash2, Phone, Save, CheckCircle, AlertTriangle, Edit2 } from 'lucide-react'

const ROLES = ['Ambulance','Police','Hospital','Fire Brigade','Event Security','Management','Other']
const NOTIFY_OPTIONS = [
  { value:'warning',   label:'Warning (80%+)',   color:'#fbbf24' },
  { value:'critical',  label:'Critical (95%+)',  color:'#f97316' },
  { value:'emergency', label:'Emergency (110%+)',color:'#ef4444' },
]

function roleIcon(role) {
  return role==='Ambulance'?'🚑':role==='Police'?'🚔':role==='Hospital'?'🏥':role==='Fire Brigade'?'🚒':'📞'
}

function ContactCard({ contact, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: contact.name, phone: contact.phone,
    role: contact.role,
    notify_on: contact.notify_on || 'critical,emergency',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function toggleNotify(val) {
    const parts = form.notify_on.split(',').filter(Boolean)
    const next = parts.includes(val) ? parts.filter(p=>p!==val) : [...parts,val]
    set('notify_on', next.join(','))
  }

  async function save() {
    setSaving(true)
    try { await onUpdate(contact.id, form); setEditing(false); setSaved(true); setTimeout(()=>setSaved(false),2000) }
    catch(e) { console.error(e) }
    finally { setSaving(false) }
  }

  const notifyList = (contact.notify_on||'').split(',').filter(Boolean)

  return (
    <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:14, marginBottom:8 }}>
      {!editing ? (
        <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
          <div style={{ fontSize:22, width:40, height:40, background:'#1f2937', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {roleIcon(contact.role)}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:14, fontWeight:500, color:'#f9fafb' }}>{contact.name}</span>
              {saved && <span style={{ fontSize:10, color:'#34d399', display:'flex', alignItems:'center', gap:3 }}><CheckCircle size={10}/> Saved</span>}
            </div>
            <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>{contact.role}</div>
            <div style={{ fontSize:13, color:'#60a5fa', marginTop:3, fontFamily:'monospace' }}>{contact.phone}</div>
            <div style={{ display:'flex', gap:4, marginTop:6, flexWrap:'wrap' }}>
              {notifyList.map(n => {
                const opt = NOTIFY_OPTIONS.find(o=>o.value===n)
                return opt ? <span key={n} style={{ fontSize:9, padding:'2px 7px', borderRadius:99, border:`1px solid ${opt.color}55`, background:`${opt.color}20`, color:opt.color }}>{opt.label}</span> : null
              })}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button className="btn" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>setEditing(true)}><Edit2 size={11}/></button>
            <button className="btn btn-danger" style={{ padding:'4px 8px', fontSize:11 }} onClick={()=>onDelete(contact.id)}><Trash2 size={11}/></button>
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Name / Label</div>
              <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="City Ambulance" />
            </div>
            <div>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Phone Number (with country code)</div>
              <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91XXXXXXXXXX" />
            </div>
            <div>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Role</div>
              <select value={form.role} onChange={e=>set('role',e.target.value)}>
                {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:6 }}>Notify on (select all that apply)</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {NOTIFY_OPTIONS.map(opt => {
                const active = form.notify_on.split(',').includes(opt.value)
                return (
                  <label key={opt.value} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:12,
                    padding:'4px 10px', borderRadius:99, border:`1px solid ${active?opt.color:opt.color+'44'}`,
                    background:active?`${opt.color}25`:'transparent', color:active?opt.color:'#9ca3af', userSelect:'none' }}>
                    <input type="checkbox" checked={active} onChange={()=>toggleNotify(opt.value)} style={{ width:'auto', display:'none' }} />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" style={{ fontSize:11 }} onClick={save} disabled={saving}><Save size={11}/>{saving?'Saving…':'Save'}</button>
            <button className="btn" style={{ fontSize:11 }} onClick={()=>setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddContactForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:'', phone:'', role:'Ambulance', notify_on:'critical,emergency' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function toggleNotify(val) {
    const parts = form.notify_on.split(',').filter(Boolean)
    const next = parts.includes(val) ? parts.filter(p=>p!==val) : [...parts,val]
    set('notify_on', next.join(','))
  }

  async function submit() {
    if (!form.name.trim()) { setError('Name required'); return }
    if (!form.phone.trim()) { setError('Phone number required'); return }
    if (!form.phone.startsWith('+')) { setError('Phone must start with + and country code (e.g. +91XXXXXXXXXX)'); return }
    setSaving(true); setError('')
    try { await onAdd(form); onClose() }
    catch(e) { setError('Failed to save. Check backend is running.') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background:'#111827', border:'1px dashed #1D9E75', borderRadius:10, padding:16, marginBottom:12 }}>
      <div style={{ fontSize:12, fontWeight:500, color:'#34d399', marginBottom:12 }}>+ Add Emergency Contact</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Name / Label</div>
          <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="City Ambulance 108" />
        </div>
        <div>
          <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Phone (with country code)</div>
          <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91XXXXXXXXXX" />
        </div>
        <div>
          <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>Role</div>
          <select value={form.role} onChange={e=>set('role',e.target.value)}>
            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, color:'#6b7280', marginBottom:6 }}>Notify when (SMS + call)</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {NOTIFY_OPTIONS.map(opt => {
            const active = form.notify_on.split(',').includes(opt.value)
            return (
              <label key={opt.value} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:12,
                padding:'4px 10px', borderRadius:99, border:`1px solid ${active?opt.color:opt.color+'44'}`,
                background:active?`${opt.color}25`:'transparent', color:active?opt.color:'#9ca3af', userSelect:'none' }}>
                <input type="checkbox" checked={active} onChange={()=>toggleNotify(opt.value)} style={{ display:'none' }} />
                {opt.label}
              </label>
            )
          })}
        </div>
      </div>
      {error && <div style={{ fontSize:11, color:'#f87171', marginBottom:8 }}>{error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-primary" onClick={submit} disabled={saving}><Plus size={12}/>{saving?'Saving…':'Add Contact'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function TwilioSetup({ onSave }) {
  const [form, setForm] = useState({ account_sid:'', auth_token:'', from_number:'' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    setSaving(true); setError('')
    try { await onSave(form); setSaved(true); setTimeout(()=>setSaved(false),3000) }
    catch(e) { setError('Failed to save Twilio settings') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background:'#111827', border:'1px solid #1f2937', borderRadius:10, padding:14, marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:500, color:'#f9fafb', marginBottom:4 }}>Twilio SMS/Call Setup</div>
      <p style={{ fontSize:11, color:'#6b7280', marginBottom:12, lineHeight:1.6 }}>
        Twilio sends automated SMS alerts and voice calls to your emergency contacts when thresholds are breached.
        Get free credentials at <a href="https://twilio.com" target="_blank" style={{ color:'#60a5fa' }}>twilio.com</a> (trial account works for testing).
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
        {[
          { label:'Account SID',   key:'account_sid',  placeholder:'ACxxxxxxxxxxxxxxxx' },
          { label:'Auth Token',    key:'auth_token',   placeholder:'your_auth_token'    },
          { label:'From Number',   key:'from_number',  placeholder:'+1XXXXXXXXXX'       },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>{label}</div>
            <input value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder} type={key==='auth_token'?'password':'text'} />
          </div>
        ))}
      </div>
      {error && <div style={{ fontSize:11, color:'#f87171', marginBottom:8 }}>{error}</div>}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={11}/>{saving?'Saving…':'Save Twilio Config'}</button>
        {saved && <span style={{ fontSize:11, color:'#34d399', display:'flex', alignItems:'center', gap:4 }}><CheckCircle size={11}/> Saved & activated!</span>}
      </div>
    </div>
  )
}

export default function Emergency({ contacts, addContact, updateContact, removeContact, saveTwilio, alerts }) {
  const [showAdd, setShowAdd] = useState(false)
  const emergencyAlerts = alerts.filter(a => a.level==='emergency'||a.level==='critical').slice(0,5)

  return (
    <div style={{ padding:20, maxWidth:800 }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:17, fontWeight:600, color:'#f9fafb' }}>Emergency Contacts</h1>
        <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Numbers saved here are auto-called and SMS'd when crowd thresholds are breached</p>
      </div>

      {/* How it works */}
      <div style={{ background:'rgba(29,158,117,.08)', border:'1px solid #065f46', borderRadius:10, padding:14, marginBottom:16, fontSize:12 }}>
        <div style={{ fontWeight:500, color:'#34d399', marginBottom:6 }}>How automatic alerts work</div>
        <div style={{ color:'#9ca3af', lineHeight:1.7 }}>
          1. <strong style={{ color:'#fbbf24' }}>80%+ capacity</strong> → Dashboard warning shown<br/>
          2. <strong style={{ color:'#f97316' }}>95%+ capacity</strong> → SMS sent to contacts marked "Critical"<br/>
          3. <strong style={{ color:'#f87171' }}>110%+ capacity</strong> → Automated voice call placed to ALL "Emergency" contacts via Twilio
        </div>
      </div>

      {/* Recent emergency alerts */}
      {emergencyAlerts.length > 0 && (
        <div style={{ background:'rgba(69,10,10,.4)', border:'1px solid #991b1b', borderRadius:10, padding:14, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, color:'#fca5a5', fontWeight:500, fontSize:12, marginBottom:8 }}>
            <AlertTriangle size={13}/> Recent critical alerts
          </div>
          {emergencyAlerts.map((a,i) => (
            <div key={i} style={{ fontSize:11, color:'#f87171', padding:'3px 0', borderTop:i>0?'1px solid rgba(153,27,27,.3)':'' }}>
              {a.zone_name}: {a.message}
            </div>
          ))}
        </div>
      )}

      <TwilioSetup onSave={saveTwilio} />

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'#f9fafb' }}>
          Contacts ({contacts.length})
          {contacts.length === 0 && <span style={{ fontSize:11, color:'#f59e0b', marginLeft:8 }}>⚠ No contacts — alerts will not be sent</span>}
        </div>
        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={()=>setShowAdd(s=>!s)}><Plus size={12}/>Add Contact</button>
      </div>

      {showAdd && <AddContactForm onAdd={addContact} onClose={()=>setShowAdd(false)} />}

      {contacts.length === 0 && !showAdd && (
        <div style={{ textAlign:'center', padding:'32px 16px', border:'1px dashed #374151', borderRadius:10, color:'#4b5563' }}>
          <div style={{ fontSize:28, marginBottom:8 }}>📞</div>
          <div style={{ fontSize:13, marginBottom:4, color:'#6b7280' }}>No emergency contacts yet</div>
          <div style={{ fontSize:11, marginBottom:16 }}>Add ambulance, police, and hospital numbers so they are automatically contacted during stampede risk</div>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><Plus size={12}/> Add First Contact</button>
        </div>
      )}

      {contacts.map(c => (
        <ContactCard key={c.id} contact={c}
          onUpdate={updateContact}
          onDelete={id => { if(confirm(`Remove ${c.name}?`)) removeContact(id) }} />
      ))}
    </div>
  )
}
