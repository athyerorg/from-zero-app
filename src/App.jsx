import { useEffect, useState } from 'react'
import { supabase, configured } from './supabase.js'

const PLAN = { price: 49, label: 'شهري' }
const SAR = ({ n }) => <span className="num"><span className="sar">&#x20C1;</span>{n}</span>

function useHash() {
  const [h, setH] = useState(location.hash.slice(1))
  useEffect(() => {
    const f = () => setH(location.hash.slice(1))
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h
}
const go = (to) => { location.hash = to }

export default function App() {
  const route = useHash() || (location.search.includes('paid=1') ? 'pay' : '')
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [member, setMember] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!configured) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' && location.hash.includes('access_token')) { history.replaceState(null, '', location.pathname + '#login'); dispatchEvent(new HashChangeEvent('hashchange')) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function refresh() {
    if (!session) { setProfile(null); setMember(false); return }
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', session.user.id).maybeSingle(),
      supabase.from('memberships').select('status,expires_at').eq('user_id', session.user.id).eq('status', 'active').maybeSingle(),
    ])
    setProfile(p)
    setMember(Boolean(m && (!m.expires_at || new Date(m.expires_at) > new Date())))
  }
  useEffect(() => { refresh() }, [session])

  if (!ready) return null
  if (!configured) return <Setup />

  const ctx = { session, profile, member, refresh }
  let page
  if (route === 'library') page = <Library {...ctx} />
  else if (route.startsWith('read/')) page = <Read id={route.slice(5)} {...ctx} />
  else if (route === 'login') page = <Login {...ctx} />
  else if (route === 'pay') page = <Pay {...ctx} />
  else if (route === 'me') page = <Me {...ctx} />
  else page = <Home {...ctx} />

  return (
    <>
      <nav><div className="wrap">
        <a className="brand" href="#"><i />نادي</a>
        <div className="links">
          <a href="#library" className={route === 'library' ? 'on' : ''}>المكتبة</a>
          {session
            ? <a href="#me" className={route === 'me' ? 'on' : ''}>{profile?.name || 'حسابي'}</a>
            : <a href="#login" className={route === 'login' ? 'on' : ''}>دخول</a>}
        </div>
      </div></nav>
      <main className="wrap">{page}</main>
      <footer className="wrap">نادي · تطبيق تجريبي من دليل «من الصفر» · hello@athyer.com</footer>
    </>
  )
}

function Setup() {
  return <main className="wrap"><section className="empty"><b>التطبيق ما لقى مفاتيح Supabase</b>انسخ <code>.env.example</code> إلى <code>.env.local</code> وعبّي القيمتين، ثم أعد التشغيل.</section></main>
}

function Home({ session, member }) {
  return (
    <>
      <div className="hero">
        <h1>محتوى يستاهل الاشتراك، في مكان واحد.</h1>
        <p>نادي هو تطبيق اشتراك بسيط: تتصفّح مجانًا، تسجّل بإيميلك، تدفع مرة بالشهر، ويفتح لك كل شي. هذا التطبيق هو المثال الحي لدليل «من الصفر».</p>
        <div className="row">
          <a className="btn p" href="#library">تصفّح المكتبة</a>
          {!member && <a className="btn" href={session ? '#pay' : '#login'}>اشترك — <SAR n={PLAN.price} />/شهر</a>}
        </div>
      </div>
      <section>
        <div className="grid c3">
          <div className="panel"><h3>تصفّح بدون تسجيل</h3><p>العناوين والمحتوى المجاني مفتوح للكل. ما نطلب شي قبل وقته.</p></div>
          <div className="panel"><h3>دخول بالإيميل</h3><p>بدون كلمة مرور. يوصلك رابط، تضغطه، وأنت داخل.</p></div>
          <div className="panel"><h3>اشتراك يفتح كل شي</h3><p>دفعة شهرية وحدة. توقفها متى ما تبي من حسابك.</p></div>
        </div>
      </section>
    </>
  )
}

function Library({ member, session }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    supabase.from('content_list').select('*').order('position').then(({ data }) => setItems(data || []))
  }, [])
  if (items === null) return <section><h2>المكتبة</h2></section>
  if (!items.length) return <section className="empty"><b>المكتبة فاضية</b>أضف أول عنصر من لوحة Supabase → جدول content.</section>
  return (
    <section>
      <h2>المكتبة</h2>
      <div className="grid">
        {items.map((it, i) => {
          const open = it.is_free || member
          return (
            <a key={it.id} className="item" href={open ? `#read/${it.id}` : (session ? '#pay' : '#login')}>
              <span className="n">{i + 1}</span>
              <span><b>{it.title}</b><small>{it.summary}</small></span>
              <span className={'tag' + (open ? '' : ' l')}>{it.is_free ? 'مجاني' : open ? 'مفتوح' : 'للمشتركين'}</span>
            </a>
          )
        })}
      </div>
      {!member && <div className="lock" style={{ marginTop: 16 }}>
        <h3>الباقي للمشتركين</h3>
        <p><SAR n={PLAN.price} /> بالشهر، تلغي متى ما تبي.</p>
        <a className="btn p" href={session ? '#pay' : '#login'}>{session ? 'اشترك الحين' : 'سجّل دخول واشترك'}</a>
      </div>}
    </section>
  )
}

function Read({ id, session }) {
  const [row, setRow] = useState(undefined)
  useEffect(() => {
    supabase.from('content').select('title,body').eq('id', id).maybeSingle().then(({ data }) => setRow(data))
  }, [id])
  if (row === undefined) return null
  if (!row) return <section className="lock" style={{ marginTop: 24 }}><h3>هذا المحتوى للمشتركين</h3><p>سجّل واشترك ويفتح لك فورًا.</p><a className="btn p" href={session ? '#pay' : '#login'}>{session ? 'اشترك' : 'دخول'}</a></section>
  return (
    <section>
      <a href="#library" style={{ color: 'var(--mute)', fontSize: 14 }}>→ المكتبة</a>
      <article className="reader" style={{ marginTop: 10 }}>
        <h1>{row.title}</h1>
        {row.body.split('\n').map((p, i) => <p key={i}>{p}</p>)}
      </article>
    </section>
  )
}

function Login({ session, profile, refresh }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState('email')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (session && profile?.name) go('library')
    else if (session) setStep('name')
  }, [session, profile])

  const [code, setCode] = useState('')
  async function sendCode(e) {
    e.preventDefault(); setBusy(true); setErr('')
    // Emails a 6-digit code (the template in Supabase → Auth → Emails prints {{ .Token }};
    // the email itself goes out through your own sender, Resend, set in Auth → SMTP).
    const { error } = await supabase.auth.signInWithOtp({ email })
    setBusy(false)
    if (error) return setErr(explain(error))
    setStep('code')
  }
  async function checkCode(e) {
    e.preventDefault(); setBusy(true); setErr('')
    // The code is checked by Supabase; a wrong or old code comes back as an error, nothing else happens.
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) return setErr(explain(error))
    await refresh()
  }
  async function saveName(e) {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.from('profiles').upsert({ id: session.user.id, name: name.trim() })
    setBusy(false)
    if (error) return setErr(explain(error))
    await refresh(); go('library')
  }

  return (
    <section style={{ maxWidth: 420, margin: '24px auto' }}>
      <div className="panel">
        {step === 'email' && <form className="form" onSubmit={sendCode}>
          <h2>دخول</h2>
          <p style={{ color: 'var(--mute)', margin: 0 }}>اكتب إيميلك ويوصلك رمز من 6 أرقام. بدون كلمة مرور.</p>
          <label>الإيميل<input type="email" required autoFocus dir="ltr" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          {err && <div className="err">{err}</div>}
          <button className="btn p w" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'أرسل الرمز'}</button>
        </form>}
        {step === 'code' && <form className="form" onSubmit={checkCode}>
          <h2>اكتب الرمز</h2>
          <p style={{ color: 'var(--mute)', margin: 0 }}>أرسلنا رمزًا إلى <span className="num" style={{ fontWeight: 500 }}>{email}</span>. ما وصل خلال دقيقة؟ شوف المزعج.</p>
          <input required autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={8} dir="ltr" className="num" style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
          {err && <div className="err">{err}</div>}
          <button className="btn p w" disabled={busy || code.length < 6}>{busy ? 'جارٍ التحقق…' : 'دخول'}</button>
          <button type="button" className="btn w" onClick={() => { setStep('email'); setCode('') }}>غيّر الإيميل</button>
        </form>}
        {step === 'name' && <form className="form" onSubmit={saveName}>
          <h2>وش اسمك؟</h2>
          <p style={{ color: 'var(--mute)', margin: 0 }}>مرة وحدة بس، عشان نناديك باسمك.</p>
          <input required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="الاسم" />
          {err && <div className="err">{err}</div>}
          <button className="btn p w" disabled={busy || !name.trim()}>تم</button>
        </form>}
      </div>
    </section>
  )
}

function Pay({ session, member, refresh }) {
  const [err, setErr] = useState('')
  const [state, setState] = useState('form') // form | checking | done | failed
  const [msg, setMsg] = useState('')
  const pk = import.meta.env.VITE_MOYASAR_PK
  const returning = new URLSearchParams(location.search)

  useEffect(() => { if (!session) go('login') }, [session])

  // Coming back from Moyasar: the URL carries ?id=<payment>&status=…  We do NOT trust that status;
  // we ask our Edge Function, which asks Moyasar with the secret key and unlocks if it really is paid.
  useEffect(() => {
    const id = returning.get('id')
    if (!session || !id) return
    setState('checking')
    history.replaceState(null, '', location.pathname + '#pay')
    supabase.functions.invoke('confirm-payment', { body: { id } }).then(async ({ data, error }) => {
      if (error || data?.error) { setState('failed'); setMsg(explain(error || { message: data?.error })); return }
      if (data?.ok) { await refresh(); setState('done') }
      else { setState('failed'); setMsg(data?.message || 'ما تمت عملية الدفع.') }
    })
  }, [session])

  // Draw Moyasar's card form inside our page (the card number never touches our code or our database).
  useEffect(() => {
    if (!session || state !== 'form' || !pk || !window.Moyasar) return
    const el = document.querySelector('.mysr-form'); if (!el) return
    el.innerHTML = ''
    window.Moyasar.init({
      element: '.mysr-form',
      amount: PLAN.price * 100,           // halalas
      currency: 'SAR',
      description: 'اشتراك نادي — شهر',
      publishable_api_key: pk,
      callback_url: location.origin + '/?paid=1',
      methods: ['creditcard'],
      metadata: { user_id: session.user.id },
      on_failure: (e) => setErr(e?.message || 'ما قدرنا نكمل الدفع.'),
    })
  }, [session, state, pk])

  if (!session) return null
  if (member && state === 'form') return <section className="okbox" style={{ marginTop: 24 }}>اشتراكك فعّال. <a href="#library" style={{ textDecoration: 'underline' }}>روح للمكتبة</a>.</section>

  if (state === 'checking') return <section className="panel" style={{ maxWidth: 420, margin: '24px auto', textAlign: 'center' }}><p>لحظة، نتأكد من الدفع…</p></section>
  if (state === 'done') return (
    <section style={{ maxWidth: 420, margin: '24px auto' }}>
      <div className="panel" style={{ textAlign: 'center' }}>
        <div className="status on" style={{ marginBottom: 10 }}><i />تم الاشتراك</div>
        <h2 style={{ margin: '6px 0' }}>كل المكتبة مفتوحة لك</h2>
        <a className="btn p w" href="#library">افتح المكتبة</a>
      </div>
    </section>
  )
  if (state === 'failed') return (
    <section style={{ maxWidth: 420, margin: '24px auto' }}>
      <div className="panel">
        <h2>ما تم الدفع</h2>
        <p style={{ color: 'var(--mute)' }}>{msg}</p>
        <button className="btn p w" onClick={() => { setState('form'); setMsg('') }}>جرّب مرة ثانية</button>
      </div>
    </section>
  )

  return (
    <section style={{ maxWidth: 420, margin: '24px auto' }}>
      <div className="panel">
        <h2>الاشتراك</h2>
        <div className="price"><SAR n={PLAN.price} /><small>/ شهر</small></div>
        <ul style={{ color: 'var(--mute)', paddingInlineStart: 20, margin: '10px 0 18px', fontSize: 15 }}>
          <li>كل المحتوى، الحالي والجاي</li>
          <li>تلغي من حسابك متى ما تبي</li>
          <li>تسترجع خلال 7 أيام إذا ما فتحت أي محتوى مدفوع</li>
        </ul>
        {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
        {pk ? <div className="mysr-form" /> : <div className="err">بوابة الدفع غير مضبوطة: المتغيّر VITE_MOYASAR_PK ناقص.</div>}
        <p style={{ fontSize: 13, color: 'var(--dim)', textAlign: 'center', margin: '10px 0 0' }}>الدفع عبر ميسر. بطاقتك لا تمر على خوادمنا.</p>
      </div>
    </section>
  )
}

function Me({ session, profile, member, refresh }) {
  useEffect(() => { if (!session) go('login') }, [session])
  if (!session) return null
  async function logout() { await supabase.auth.signOut(); go('') }
  async function cancel() {
    if (!confirm('توقف الاشتراك؟ يبقى مفتوح لنهاية الشهر المدفوع.')) return
    await supabase.rpc('demo_cancel'); await refresh()
  }
  return (
    <section style={{ maxWidth: 480, margin: '24px auto' }}>
      <div className="panel">
        <h2 style={{ marginBottom: 4 }}>{profile?.name || 'حسابي'}</h2>
        <p style={{ color: 'var(--mute)', margin: '0 0 14px' }}><span className="num" style={{ fontWeight: 400 }}>{session.user.email}</span></p>
        <div className={'status' + (member ? ' on' : '')}><i />{member ? 'الاشتراك فعّال' : 'ما فيه اشتراك'}</div>
        <div className="row" style={{ marginTop: 18 }}>
          {member ? <button className="btn" onClick={cancel}>أوقف الاشتراك</button> : <a className="btn p" href="#pay">اشترك</a>}
          <button className="btn" onClick={logout}>خروج</button>
        </div>
      </div>
    </section>
  )
}

function explain(error) {
  const m = error?.message || ''
  if (/rate limit|too many/i.test(m)) return 'أرسلنا رموز كثيرة لهذا الإيميل. جرّب بعد دقيقة.'
  if (/expired|invalid/i.test(m)) return 'الرمز غلط أو انتهى. اطلب رمزًا جديدًا.'
  if (/network|fetch/i.test(m)) return 'ما قدرنا نوصل للخادم. تأكد من الإنترنت وجرّب.'
  return 'صار خطأ: ' + m
}
