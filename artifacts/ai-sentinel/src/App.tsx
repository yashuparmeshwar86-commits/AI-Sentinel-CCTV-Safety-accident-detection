import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import {
  Activity, AlertTriangle, ArrowDownRight, BellRing, Camera as CameraIcon,
  Check, CheckCircle2, Clock3, Database, ExternalLink, FileVideo2,
  Filter, Gauge, HardDrive, History as HistoryIcon, LayoutDashboard, MapPin, Menu, Plus,
  Radio, Search, Settings2, Shield, ShieldAlert, Signal, Trash2, Upload, Video, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  getGetSentinelSummaryQueryKey, getListCamerasQueryKey, getListIncidentsQueryKey,
  useAnalyzeVideo, useCreateCamera, useDeleteCamera, useGetEvidence,
  useGetSentinelSummary, useListCameras, useListIncidents, useSimulateNotification,
  useUpdateCamera, useUpdateIncident,
} from '@workspace/api-client-react';
import type {
  Camera, CameraInput, CameraUpdate, Incident, IncidentUpdate,
  ListIncidentsParams, VideoAnalysisResult,
} from '@workspace/api-client-react';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/monitoring', label: 'Video analysis', icon: Video },
  { href: '/alerts', label: 'Incident review', icon: ShieldAlert },
  { href: '/history', label: 'History', icon: HistoryIcon },
  { href: '/cameras', label: 'Cameras', icon: CameraIcon },
  { href: '/analytics', label: 'Analytics', icon: Activity },
  { href: '/settings', label: 'System notes', icon: Settings2 },
];
const fmtTime = (date?: string) => date ? new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const statusClass = (value: string) => value === 'verified' || value === 'online' ? 'tag-green' : value === 'pending' || value === 'maintenance' ? 'tag-amber' : value === 'high' || value === 'offline' ? 'tag-red' : 'tag-slate';
const errText = (err: unknown) => err instanceof Error ? err.message : 'The request could not be completed.';

function AppShell({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[238px] flex-col border-r border-[#25303c] bg-[#111821] transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[74px] items-center gap-3 border-b border-[#25303c] px-5">
        <div className="grid h-9 w-9 place-items-center rounded-md border border-[#3c555c] bg-[#172a30] text-[#80d6c9]"><Shield size={19}/></div>
        <div><div className="text-[14px] font-extrabold tracking-[.14em] text-[#e8eef2]">AI SENTINEL</div><div className="mono mt-0.5 text-[9px] tracking-[.13em] text-[#778797]">OPERATIONS / EXPERIMENTAL</div></div>
      </div>
      <div className="px-4 pt-6 pb-2 eyebrow">Control room</div>
      <nav className="space-y-1 px-3">{navItems.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== '/' && path.startsWith(href));
        return <Link key={href} href={href} data-testid={`nav-${label.toLowerCase().replaceAll(' ','-')}`} onClick={() => setMobileNav(false)}
          className={`flex h-10 items-center gap-3 rounded-md px-3 text-[12px] font-semibold transition ${active ? 'bg-[#1e2d37] text-[#88d9ce] shadow-[inset_2px_0_0_#4ab6a8]' : 'text-[#97a5b3] hover:bg-[#19232e] hover:text-[#dce4ea]'}`}>
          <Icon size={16} strokeWidth={1.8}/>{label}{href === '/alerts' && <span className="ml-auto mono text-[9px] text-[#748493]">LIVE</span>}
        </Link>;
      })}</nav>
      <div className="mt-auto p-4">
        <div className="rounded-lg border border-[#283641] bg-[#151e28] p-3">
          <div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#50c18e] opacity-35"/><span className="relative inline-flex h-2 w-2 rounded-full bg-[#50c18e]"/></span><span className="mono text-[10px] uppercase tracking-wider text-[#a9b8c4]">Operator review required</span></div>
          <p className="mb-0 mt-2 text-[10px] leading-4 text-[#778797]">Experimental signals support review; they do not establish a collision.</p>
        </div>
        <div className="mono mt-4 flex justify-between text-[9px] text-[#607080]"><span>SENTINEL / BUILD 0.1</span><span>LOCAL</span></div>
      </div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-black/60 md:hidden"/>}
    <div className="min-h-[100dvh] md:pl-[238px]">
      <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-[#25303c] bg-[#101720]/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button className="btn btn-quiet px-2 md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={18}/></button><div className="eyebrow hidden sm:block">Municipal road safety / operator console</div><div className="eyebrow sm:hidden">AI SENTINEL / OPS</div></div>
        <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded border border-[#29463d] bg-[#14241e] px-2.5 py-1.5 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#66ce99]"/><span className="mono text-[9px] uppercase tracking-wider text-[#93c8a8]">Review mode</span></div><span className="mono text-[10px] text-[#728292]">{new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'2-digit'})}</span></div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  </div>;
}

function PageHead({ kicker, title, detail, action }: { kicker: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-enter"><div><div className="eyebrow mb-2">{kicker}</div><h1 className="m-0 text-[26px] font-bold tracking-[-.04em] text-[#e5edf2] md:text-[31px]">{title}</h1><p className="mb-0 mt-2 max-w-2xl text-[12px] leading-5 text-[#8c9aa9]">{detail}</p></div>{action}</div>;
}
function Panel({ title, label, children, className = '' }: { title: string; label?: string; children: React.ReactNode; className?: string }) {
  return <section className={`surface ${className}`}><div className="flex items-center justify-between border-b border-[#26313d] px-4 py-3.5"><h2 className="m-0 text-[12px] font-bold tracking-wide text-[#d8e1e8]">{title}</h2>{label && <span className="eyebrow">{label}</span>}</div><div className="p-4">{children}</div></section>;
}
function LoadingRows() { return <div className="space-y-3 py-2">{[1,2,3].map(x=><div className="flex gap-3" key={x}><div className="skeleton h-9 w-9"/><div className="flex-1 space-y-2"><div className="skeleton h-3 w-2/5"/><div className="skeleton h-3 w-3/4"/></div></div>)}</div>; }
function QueryProblem({ onRetry }: { onRetry: () => void }) { return <div className="py-8 text-center"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#321c22] text-[#ee9297]"><AlertTriangle size={18}/></div><div className="text-[12px] font-semibold text-[#dfe6ec]">Unable to load this record</div><p className="text-[11px] text-[#8291a0]">Check the connection, then try again.</p><button className="btn" onClick={onRetry}>Retry</button></div>; }
function EmptyState({ title, copy }: { title: string; copy: string }) { return <div className="py-10 text-center"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg border border-[#2d3b48] bg-[#18222d] text-[#8ea2b1]"><Database size={18}/></div><div className="text-[12px] font-semibold text-[#cbd5de]">{title}</div><p className="mx-auto mb-0 mt-1 max-w-sm text-[11px] leading-5 text-[#8291a0]">{copy}</p></div>; }

function useInvalidate() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: getListIncidentsQueryKey() });
    client.invalidateQueries({ queryKey: getListCamerasQueryKey() });
    client.invalidateQueries({ queryKey: getGetSentinelSummaryQueryKey() });
  };
}

function IncidentRows({ items, onChoose }: { items: Incident[]; onChoose?: (incident: Incident) => void }) {
  if (!items.length) return <EmptyState title="No incidents in this view" copy="Records appear here only when they are returned by Sentinel analysis or persisted in incident history." />;
  return <div className="divide-y divide-[#25313d]">{items.map((item) => <article key={item.id} data-testid={`incident-${item.id}`} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${item.severity === 'high' ? 'bg-[#321d24] text-[#f08c93]' : item.severity === 'medium' ? 'bg-[#312819] text-[#e5bc69]' : 'bg-[#202a35] text-[#9baab8]'}`}><AlertTriangle size={16}/></div>
    <div className="min-w-[160px] flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[12px] font-semibold text-[#d7e0e7]">{item.cameraName}</span><span className={`tag ${statusClass(item.severity)}`}>{item.severity}</span><span className={`tag ${statusClass(item.status)}`}>{item.status}</span></div><div className="mt-1 text-[10px] text-[#8593a2]">{item.location} <span className="px-1 text-[#43505e]">/</span> {fmtTime(item.createdAt)}</div></div>
    <div className="hidden w-[116px] text-right sm:block"><div className="mono text-[11px] text-[#c0cbd4]">{item.detectionCount ?? 0}</div><div className="eyebrow mt-1">detections</div></div>
    <button className="btn btn-quiet ml-auto min-h-8 px-2" onClick={() => onChoose?.(item)} aria-label={`Review ${item.cameraName}`}><ExternalLink size={14}/><span className="hidden sm:inline">Review</span></button>
  </article>)}</div>;
}

function Home() {
  const summary = useGetSentinelSummary(); const incidents = useListIncidents({}); const cameras = useListCameras();
  const [, setLocation] = useLocation(); const [selected, setSelected] = useState<Incident | null>(null);
  const daily = summary.data?.daily ?? [];
  return <><PageHead kicker="Situation overview / 01" title="Operations overview" detail="A live view of returned incident records, configured cameras, and model availability." action={<Link href="/monitoring" className="btn btn-primary"><Upload size={15}/>Analyze footage</Link>}/>
    {summary.isError && <div className="mb-4 rounded border border-[#71313a] bg-[#27191e] px-4 py-3 text-[11px] text-[#f0a1a6]">Summary unavailable. <button className="underline" onClick={() => summary.refetch()}>Retry</button></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Recorded incidents" value={summary.data?.totalIncidents} note="Persisted review records" icon={Activity}/>
      <Metric label="Awaiting review" value={summary.data?.pendingIncidents} note="Human review required" icon={AlertTriangle} tone="amber"/>
      <Metric label="Cameras online" value={summary.data ? `${summary.data.onlineCameras} / ${summary.data.totalCameras}` : undefined} note="Configured camera sources" icon={Radio} tone="green"/>
      <Metric label="Model availability" value={summary.data ? (summary.data.modelAvailable ? 'Available' : 'Unavailable') : undefined} note={summary.data?.modelMessage || 'Status from service'} icon={Gauge} tone={summary.data?.modelAvailable ? 'green' : 'red'}/>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Panel title="Incident volume" label="Persisted daily totals">
        {summary.isLoading ? <div className="skeleton h-[230px] w-full"/> : summary.isError ? <QueryProblem onRetry={() => summary.refetch()}/> : daily.length ? <div className="h-[235px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{top:12,right:10,bottom:0,left:-18}}><defs><linearGradient id="tealArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#48b8a9" stopOpacity={.28}/><stop offset="100%" stopColor="#48b8a9" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#293440" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#778797',fontSize:10}}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:'#778797',fontSize:10}}/><Tooltip contentStyle={{background:'#18212b',border:'1px solid #34414d',borderRadius:7,color:'#dce5eb',fontSize:11}}/><Area type="monotone" dataKey="count" stroke="#56bbaa" strokeWidth={2} fill="url(#tealArea)" activeDot={{r:4,fill:'#a1eadb'}}/></AreaChart></ResponsiveContainer></div> : <EmptyState title="No daily totals returned" copy="The service has not provided a daily trend series."/>}
      </Panel>
      <Panel title="System posture" label="Current service report">
        <div className="space-y-3">
          <InfoLine icon={Signal} title="Camera inventory" value={cameras.data ? `${cameras.data.length} configured` : cameras.isLoading ? 'Loading' : 'Unavailable'} tone="green"/>
          <InfoLine icon={ShieldAlert} title="Incident review" value={summary.data ? `${summary.data.pendingIncidents} pending` : '—'} tone="amber"/>
          <InfoLine icon={HardDrive} title="Analysis mode" value="Experimental / review only" tone="slate"/>
          <div className="mt-4 border-t border-[#27323e] pt-3 text-[10px] leading-[1.7] text-[#8998a7]">Rule-based signals can flag proximity or abrupt stopping. Neither signal proves that a collision occurred.</div>
          <Link href="/settings" className="inline-flex items-center gap-2 pt-1 text-[10px] font-semibold text-[#7fc9bf] hover:text-[#b1f1e6]">Read system notes <ArrowDownRight size={13}/></Link>
        </div>
      </Panel>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <Panel title="Recent activity" label="Latest API records">{incidents.isLoading ? <LoadingRows/> : incidents.isError ? <QueryProblem onRetry={() => incidents.refetch()}/> : <IncidentRows items={(incidents.data ?? []).slice(0,5)} onChoose={setSelected}/>}</Panel>
      <Panel title="Camera readiness" label="Configured sources">
        {cameras.isLoading ? <LoadingRows/> : cameras.isError ? <QueryProblem onRetry={() => cameras.refetch()}/> : cameras.data?.length ? <div className="space-y-3">{cameras.data.slice(0,5).map(c=><div key={c.id} className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded bg-[#202a35] text-[#91a4b3]"><CameraIcon size={15}/></div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold text-[#d5dee6]">{c.name}</div><div className="truncate text-[10px] text-[#8291a0]">{c.location}</div></div><span className={`tag ${statusClass(c.status)}`}>{c.status}</span></div>)}<Link className="mt-1 inline-flex items-center gap-2 text-[10px] font-semibold text-[#7fc9bf]" href="/cameras">Manage cameras <ArrowDownRight size={13}/></Link></div> : <EmptyState title="No cameras configured" copy="Add a camera record before running footage analysis."/>}
      </Panel>
    </div>
    {selected && <IncidentDialog incident={selected} close={() => setSelected(null)}/>}
  </>;
}
function Metric({label,value,note,icon:Icon,tone='slate'}:{label:string;value?:string|number;note:string;icon:typeof Activity;tone?:string}) {
  return <div className="surface p-4"><div className="flex items-start justify-between"><div className="eyebrow">{label}</div><div className={`grid h-8 w-8 place-items-center rounded-md ${tone==='red'?'bg-[#321c22] text-[#ec8a91]':tone==='amber'?'bg-[#30281a] text-[#ddbc72]':tone==='green'?'bg-[#142922] text-[#7dcea4]':'bg-[#202b37] text-[#9cabb8]'}`}><Icon size={15}/></div></div><div className="mt-3 min-h-[32px] text-[25px] font-bold tracking-[-.04em] text-[#e3eaf0]">{value ?? <span className="skeleton inline-block h-7 w-20 align-middle"/>}</div><div className="mt-1 text-[10px] text-[#7f8e9d]">{note}</div></div>;
}
function InfoLine({icon:Icon,title,value,tone}:{icon:typeof Activity;title:string;value:string;tone:string}) {
  return <div className="flex items-center gap-3"><div className="text-[#7d8c9b]"><Icon size={15}/></div><div className="flex-1 text-[11px] text-[#b8c3cc]">{title}</div><span className={`tag ${tone==='green'?'tag-green':tone==='amber'?'tag-amber':'tag-slate'}`}>{value}</span></div>;
}

function IncidentDialog({ incident, close }: { incident: Incident; close: () => void }) {
  const update = useUpdateIncident(); const notify = useSimulateNotification(); const invalidate = useInvalidate();
  const [recipient,setRecipient] = useState(''); const [notice,setNotice] = useState('');
  const choices: IncidentUpdate['status'][] = ['verified','dismissed','resolved'];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080c11]/80 p-3 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="surface max-h-[92dvh] w-full max-w-[760px] overflow-y-auto scrollbar-thin">
      <div className="flex items-start justify-between border-b border-[#293440] p-4 md:p-5"><div><div className="eyebrow">Incident evidence / {incident.id}</div><h2 className="mb-0 mt-2 text-[18px] font-bold text-[#e2eaf0]">{incident.cameraName}</h2><p className="mb-0 mt-1 text-[11px] text-[#8d9aa8]">{incident.location} · {fmtTime(incident.createdAt)}</p></div><button className="btn btn-quiet px-2" onClick={close} aria-label="Close detail"><X size={17}/></button></div>
      <div className="grid gap-4 p-4 md:grid-cols-[1.15fr_.85fr] md:p-5">
        <Evidence imageUrl={incident.evidenceUrl}/>
        <div className="space-y-4">
          <div className="flex gap-2"><span className={`tag ${statusClass(incident.severity)}`}>{incident.severity} severity</span><span className={`tag ${statusClass(incident.status)}`}>{incident.status}</span></div>
          <div><div className="eyebrow mb-2">Observed signals</div>{incident.signals?.length ? <ul className="m-0 list-none space-y-2 p-0">{incident.signals.map((s,i)=><li key={`${s}-${i}`} className="flex gap-2 text-[11px] leading-5 text-[#c0cbd4]"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#d9ad58]"/>{s}</li>)}</ul> : <p className="text-[11px] text-[#8795a4]">No signal details returned.</p>}</div>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-[#2b3744] bg-[#111923] p-3"><DataPoint name="Detections" value={String(incident.detectionCount ?? 0)}/><DataPoint name="Source file" value={incident.sourceName}/><DataPoint name="Notification" value={incident.notificationStatus === 'simulated' ? 'Simulated' : 'Not sent'}/><DataPoint name="Coordinates" value={incident.latitude != null && incident.longitude != null ? `${incident.latitude}, ${incident.longitude}` : 'Not recorded'}/></div>
          <div className="rounded-md border border-[#4b3d25] bg-[#282217] p-3 text-[10px] leading-5 text-[#d7bc7c]">Review cue only: proximity and abrupt stopping can be false positives. Confirm against evidence; this system does not determine that a collision occurred.</div>
        </div>
      </div>
      <div className="border-t border-[#293440] p-4 md:p-5">
        <div className="eyebrow mb-2">Human review action</div><div className="flex flex-wrap gap-2">{choices.map(status=><button key={status} disabled={update.isPending || incident.status===status} onClick={()=>update.mutate({incidentId:incident.id,data:{status}},{onSuccess:()=>{invalidate();close();}})} className={`btn ${status==='verified'?'btn-primary':''}`}><Check size={13}/>{status==='verified'?'Verify':status==='dismissed'?'Dismiss':'Resolve'}</button>)}</div>
        {update.isError && <p className="text-[10px] text-[#f18e96]">{errText(update.error)}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><input className="field" placeholder="Recipient for simulated notification" value={recipient} onChange={e=>setRecipient(e.target.value)} aria-label="Notification recipient"/><button className="btn" disabled={!recipient.trim()||notify.isPending} onClick={()=>notify.mutate({incidentId:incident.id,data:{recipient:recipient.trim()}},{onSuccess:r=>{setNotice(r.message);invalidate();},onError:e=>setNotice(errText(e))})}><BellRing size={14}/>{notify.isPending?'Recording…':'Simulate notification'}</button></div>
        <p className="mb-0 mt-2 text-[10px] leading-4 text-[#8392a1]">This records a simulated notification only. It does not contact emergency services or dispatch responders.</p>{notice && <div className="mt-2 text-[10px] text-[#86d5a8]" role="status">{notice}</div>}
      </div>
    </div>
  </div>;
}
function DataPoint({name,value}:{name:string;value:string}) { return <div className="min-w-0"><div className="eyebrow">{name}</div><div className="mt-1 truncate text-[10px] text-[#c5d0d9]" title={value}>{value}</div></div>; }

function Evidence({imageUrl}:{imageUrl:string}) {
  const filename = decodeURIComponent(imageUrl.split('/').pop() ?? '');
  const evidence = useGetEvidence(filename);
  const [src,setSrc] = useState('');
  useEffect(()=>{if(!evidence.data)return;const url=URL.createObjectURL(evidence.data);setSrc(url);return()=>URL.revokeObjectURL(url);},[evidence.data]);
  return <div className="overflow-hidden rounded-md border border-[#2a3744] bg-[#0a1016]">
    {evidence.isLoading ? <div className="skeleton aspect-video"/> : evidence.isError ? <div className="grid aspect-video place-items-center px-5 text-center text-[11px] text-[#8796a5]">Evidence could not be loaded.<br/><button className="btn mt-3" onClick={()=>evidence.refetch()}>Retry</button></div> : src ? <img src={src} alt="Incident evidence frame" className="block max-h-[350px] w-full object-contain"/> : <div className="grid aspect-video place-items-center text-[11px] text-[#7f8e9b]">Evidence frame unavailable</div>}
    <div className="flex items-center justify-between border-t border-[#26313d] px-3 py-2"><span className="eyebrow">Evidence frame</span><a href={imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[#91d4c9]"><ExternalLink size={12}/>Open file</a></div>
  </div>;
}

function IncidentsPage({history=false}:{history?:boolean}) {
  const cameras = useListCameras();
  const [status,setStatus]=useState('');const [severity,setSeverity]=useState('');const [cameraId,setCameraId]=useState('');const [from,setFrom]=useState('');const [to,setTo]=useState('');const [search,setSearch]=useState('');
  const params = useMemo<ListIncidentsParams>(()=>({ ...(status?{status:status as ListIncidentsParams['status']}:{}),...(severity?{severity:severity as ListIncidentsParams['severity']}:{}),...(cameraId?{cameraId}:{}),...(from?{from}:{}),...(to?{to}:{}) }),[status,severity,cameraId,from,to]);
  const query=useListIncidents(params);const [selected,setSelected]=useState<Incident|null>(null);
  const filtered=(query.data??[]).filter(i=>`${i.cameraName} ${i.location} ${i.sourceName} ${i.signals.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHead kicker={history?'Record archive / 04':'Operator queue / 03'} title={history?'Incident history':'Incident review'} detail={history?'Filter persisted incident records and inspect the evidence and review trail.':'Search signals returned by analysis and record a human review decision.'}/>
    <div className="surface mb-4 p-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <label className="relative lg:col-span-2"><Search className="absolute left-3 top-3 text-[#778694]" size={14}/><input className="field pl-9" placeholder="Search source, location, signal…" aria-label="Search incidents" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <select className="field" aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All review status</option>{['pending','verified','dismissed','resolved'].map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" aria-label="Filter severity" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="">All severity</option>{['low','medium','high'].map(x=><option key={x}>{x}</option>)}</select>
      <select className="field" aria-label="Filter camera" value={cameraId} onChange={e=>setCameraId(e.target.value)}><option value="">All cameras</option>{(cameras.data??[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn btn-quiet" onClick={()=>{setStatus('');setSeverity('');setCameraId('');setSearch('');setFrom('');setTo('');}}><Filter size={14}/>Clear</button>
    </div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2"><span className="eyebrow w-10">From</span><input type="date" className="field" value={from} onChange={e=>setFrom(e.target.value)} aria-label="From date"/></label><label className="flex items-center gap-2"><span className="eyebrow w-10">To</span><input type="date" className="field" value={to} onChange={e=>setTo(e.target.value)} aria-label="To date"/></label></div></div>
    <Panel title={history?'Persisted incident records':'Incidents requiring operator attention'} label={`${filtered.length} result${filtered.length===1?'':'s'}`}>
      {query.isLoading?<LoadingRows/>:query.isError?<QueryProblem onRetry={()=>query.refetch()}/>:<IncidentRows items={filtered} onChoose={setSelected}/>}
    </Panel>{selected&&<IncidentDialog incident={selected} close={()=>setSelected(null)}/>}
  </>;
}

function CamerasPage() {
  const cameras=useListCameras();const create=useCreateCamera();const update=useUpdateCamera();const remove=useDeleteCamera();const invalidate=useInvalidate();
  const [editing,setEditing]=useState<Camera|null>(null);const [adding,setAdding]=useState(false);const [confirm,setConfirm]=useState<Camera|null>(null);const [error,setError]=useState('');
  const [form,setForm]=useState({name:'',location:'',latitude:'',longitude:'',status:'online'});
  const openAdd=()=>{setError('');setForm({name:'',location:'',latitude:'',longitude:'',status:'online'});setAdding(true);};
  const openEdit=(cam:Camera)=>{setError('');setForm({name:cam.name,location:cam.location,latitude:cam.latitude==null?'':String(cam.latitude),longitude:cam.longitude==null?'':String(cam.longitude),status:cam.status});setEditing(cam);};
  const closeForm=()=>{setAdding(false);setEditing(null);};
  const save=(e:React.FormEvent)=>{e.preventDefault();setError('');const values={name:form.name.trim(),location:form.location.trim(),latitude:form.latitude?Number(form.latitude):null,longitude:form.longitude?Number(form.longitude):null,status:form.status as CameraInput['status']};
    if(!values.name||!values.location||((values.latitude===null)!==(values.longitude===null))){setError('Enter a name and location. Coordinates must be supplied together.');return;}
    if(editing) update.mutate({cameraId:editing.id,data:values as CameraUpdate},{onSuccess:()=>{invalidate();closeForm();},onError:e=>setError(errText(e))});
    else create.mutate({data:values as CameraInput},{onSuccess:()=>{invalidate();closeForm();},onError:e=>setError(errText(e))});
  };
  const deleting=remove.isPending;
  return <><PageHead kicker="Source configuration / 05" title="Camera registry" detail="Manage camera metadata used to associate footage and incident records." action={<button className="btn btn-primary" onClick={openAdd}><Plus size={15}/>Add camera</button>}/>
    <Panel title="Configured sources" label={cameras.data?`${cameras.data.length} cameras`:'Camera inventory'}>
      {cameras.isLoading?<LoadingRows/>:cameras.isError?<QueryProblem onRetry={()=>cameras.refetch()}/>:cameras.data?.length?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cameras.data.map(cam=><CameraCard key={cam.id} camera={cam} edit={()=>openEdit(cam)} remove={()=>setConfirm(cam)}/>)}</div>:<EmptyState title="No camera records" copy="Add a configured camera to associate uploads with a location. Camera records do not connect a live feed by themselves."/>}
    </Panel>
    {(adding||editing)&&<Modal title={editing?'Edit camera configuration':'Add camera configuration'} close={closeForm}><form onSubmit={save} className="space-y-3">
      <label className="block"><span className="eyebrow mb-1.5 block">Camera name</span><input className="field" required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label className="block"><span className="eyebrow mb-1.5 block">Location description</span><input className="field" required maxLength={200} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
      <div className="grid grid-cols-2 gap-3"><label><span className="eyebrow mb-1.5 block">Latitude</span><input type="number" step="any" min="-90" max="90" className="field" value={form.latitude} onChange={e=>setForm({...form,latitude:e.target.value})}/></label><label><span className="eyebrow mb-1.5 block">Longitude</span><input type="number" step="any" min="-180" max="180" className="field" value={form.longitude} onChange={e=>setForm({...form,longitude:e.target.value})}/></label></div>
      <label className="block"><span className="eyebrow mb-1.5 block">Configuration status</span><select className="field" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['online','offline','maintenance'].map(s=><option key={s}>{s}</option>)}</select></label>
      {error&&<p className="text-[10px] text-[#f18e96]" role="alert">{error}</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" className="btn" onClick={closeForm}>Cancel</button><button className="btn btn-primary" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'Saving…':'Save configuration'}</button></div>
    </form></Modal>}
    {confirm&&<Modal title="Remove camera record?" close={()=>setConfirm(null)}><p className="text-[12px] leading-5 text-[#a5b1bd]">Remove <b className="text-[#e1e8ed]">{confirm.name}</b> from configured sources? Existing incident records are not changed.</p>{remove.isError&&<p className="text-[10px] text-[#f18e96]">{errText(remove.error)}</p>}<div className="mt-4 flex justify-end gap-2"><button className="btn" onClick={()=>setConfirm(null)}>Cancel</button><button className="btn btn-danger" disabled={deleting} onClick={()=>remove.mutate({cameraId:confirm.id},{onSuccess:()=>{invalidate();setConfirm(null);},onError:()=>{}})}><Trash2 size={14}/>{deleting?'Removing…':'Remove camera'}</button></div></Modal>}
  </>;
}
function CameraCard({camera,edit,remove}:{camera:Camera;edit:()=>void;remove:()=>void}) {
  return <div className="surface-soft p-4"><div className="flex items-start justify-between"><div className="grid h-9 w-9 place-items-center rounded-md border border-[#2c3946] bg-[#1b2632] text-[#9cb1bf]"><CameraIcon size={17}/></div><span className={`tag ${statusClass(camera.status)}`}>{camera.status}</span></div>
    <h3 className="mb-0 mt-4 text-[13px] font-bold text-[#dce4ea]">{camera.name}</h3><div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#8c9aa8]"><MapPin size={12}/>{camera.location}</div>
    <div className="mono mt-3 text-[9px] text-[#788897]">{camera.latitude!=null&&camera.longitude!=null?`${camera.latitude}, ${camera.longitude}`:'Coordinates not set'}</div>
    <div className="mt-4 flex gap-2 border-t border-[#283440] pt-3"><button className="btn flex-1" onClick={edit}>Edit details</button><button className="btn btn-quiet px-2 text-[#e18d94]" onClick={remove} aria-label={`Remove ${camera.name}`}><Trash2 size={14}/></button></div>
  </div>;
}
function Modal({title,children,close}:{title:string;children:React.ReactNode;close:()=>void}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080c11]/80 p-3 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className="surface w-full max-w-[480px] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="m-0 text-[15px] font-bold text-[#e3eaf0]">{title}</h2><button className="btn btn-quiet px-2" onClick={close} aria-label="Close"><X size={16}/></button></div>{children}</section></div>;
}

function MonitoringPage() {
  const cameras=useListCameras();const analyze=useAnalyzeVideo();
  const [file,setFile]=useState<File|null>(null);const [cameraId,setCameraId]=useState('');const [location,setLocation]=useState('');const [latitude,setLatitude]=useState('');const [longitude,setLongitude]=useState('');
  const [confidence,setConfidence]=useState(.35);const [suspicious,setSuspicious]=useState(5);const [result,setResult]=useState<VideoAnalysisResult|null>(null);const [localError,setLocalError]=useState('');
  const preview=useMemo(()=>file?URL.createObjectURL(file):'',[file]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const chooseCamera=(id:string)=>{setCameraId(id);const cam=cameras.data?.find(c=>c.id===id);if(cam){setLocation(cam.location);setLatitude(cam.latitude==null?'':String(cam.latitude));setLongitude(cam.longitude==null?'':String(cam.longitude));}};
  const submit=(e:React.FormEvent)=>{e.preventDefault();setLocalError('');setResult(null);if(!file){setLocalError('Choose a video file before starting analysis.');return;}if(!cameraId){setLocalError('Select a configured camera source.');return;}
    analyze.mutate({data:{video:file,cameraId,location:location||undefined,latitude:latitude?Number(latitude):undefined,longitude:longitude?Number(longitude):undefined,confidenceThreshold:confidence,suspiciousThreshold:suspicious}},{onSuccess:r=>setResult(r),onError:e=>setLocalError(errText(e))});
  };
  return <><PageHead kicker="Video ingestion / 02" title="Analyze footage" detail="Submit authorized CCTV footage for experimental signal review. Only detections and processed frames returned by the service are shown."/>
    <div className="grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
      <Panel title="Analysis request" label="Authorized footage only">
        <form onSubmit={submit} className="space-y-4">
          <label className="group block cursor-pointer rounded-lg border border-dashed border-[#42515e] bg-[#111923] p-5 text-center transition hover:border-[#5ab4a7]"><input type="file" accept="video/*" className="sr-only" onChange={e=>{setFile(e.target.files?.[0]??null);setResult(null);}}/><div className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-[#1c2b35] text-[#89d7cc]"><FileVideo2 size={19}/></div><div className="mt-3 text-[12px] font-semibold text-[#d8e2e9]">{file?file.name:'Choose a video file'}</div><div className="mt-1 text-[10px] text-[#7f8d9b]">{file?`${(file.size/1024/1024).toFixed(1)} MB · ${file.type||'video'}`:'CCTV export or authorized recording'}</div><div className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[#8bd1c7]"><Upload size={13}/>Browse files</div></label>
          {preview&&<video src={preview} controls className="max-h-48 w-full rounded-md border border-[#293541] bg-black"/>}
          {cameras.isError&&<div className="rounded border border-[#703139] bg-[#291a20] p-3 text-[10px] text-[#e9989e]">Camera inventory unavailable. <button type="button" className="underline" onClick={()=>cameras.refetch()}>Retry</button></div>}
          <label className="block"><span className="eyebrow mb-1.5 block">Camera / configured source</span><select className="field" value={cameraId} onChange={e=>chooseCamera(e.target.value)} required><option value="">Select a configured camera</option>{(cameras.data??[]).map(c=><option key={c.id} value={c.id}>{c.name} — {c.location}</option>)}</select></label>
          <label className="block"><span className="eyebrow mb-1.5 block">Incident location</span><input className="field" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Location description"/></label>
          <div className="grid grid-cols-2 gap-3"><label><span className="eyebrow mb-1.5 block">Latitude (optional)</span><input className="field" type="number" step="any" min="-90" max="90" value={latitude} onChange={e=>setLatitude(e.target.value)} placeholder="—"/></label><label><span className="eyebrow mb-1.5 block">Longitude (optional)</span><input className="field" type="number" step="any" min="-180" max="180" value={longitude} onChange={e=>setLongitude(e.target.value)} placeholder="—"/></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="eyebrow mb-1.5 flex justify-between"><span>Detection confidence</span><span className="mono text-[#b4c0ca]">{confidence.toFixed(2)}</span></span><input aria-label="Detection confidence threshold" type="range" min=".1" max=".95" step=".05" className="w-full accent-[#4db1a5]" value={confidence} onChange={e=>setConfidence(Number(e.target.value))}/></label><label className="block"><span className="eyebrow mb-1.5 flex justify-between"><span>Suspicious threshold</span><span className="mono text-[#b4c0ca]">{suspicious} frames</span></span><input aria-label="Suspicious frame threshold" type="range" min="2" max="12" step="1" className="w-full accent-[#d6ad60]" value={suspicious} onChange={e=>setSuspicious(Number(e.target.value))}/></label></div>
          <div className="rounded-md border border-[#4a3c25] bg-[#282217] p-3 text-[10px] leading-5 text-[#d2b975]"><AlertTriangle className="mr-1 inline" size={12}/>Experimental rule-based accident review. Proximity or an abrupt stop may be flagged, but neither proves a collision. A human must inspect all evidence.</div>
          {localError&&<div className="text-[10px] text-[#f18e96]" role="alert">{localError}</div>}
          <button className="btn btn-primary w-full" disabled={analyze.isPending||cameras.isLoading||!cameras.data?.length}>{analyze.isPending?<><span className="h-3 w-3 animate-spin rounded-full border border-[#effffb] border-t-transparent"/>Processing footage…</>:<><Activity size={15}/>Run analysis</>}</button>
        </form>
      </Panel>
      <div className="space-y-4">
        <Panel title="Analysis output" label={result?result.modelStatus:'Awaiting request'}>
          {!result&&!analyze.isPending&&<EmptyState title="No analysis results yet" copy="Select a video and configured camera, then run analysis. This panel will show only results returned by the service."/>}
          {analyze.isPending&&<div className="space-y-4 py-2"><div className="skeleton aspect-video w-full"/><div className="skeleton h-4 w-2/5"/><div className="skeleton h-20 w-full"/></div>}
          {result&&<AnalysisOutput result={result}/>}
          {localError&&!analyze.isPending&&<div className="mt-3 rounded border border-[#71313a] bg-[#281b20] p-3 text-[10px] text-[#efa1a5]">{localError}</div>}
        </Panel>
        {result&&<Panel title="Returned incident records" label={`${result.incidents.length} created`}><IncidentRows items={result.incidents}/></Panel>}
      </div>
    </div>
  </>;
}
function AnalysisOutput({result}:{result:VideoAnalysisResult}) {
  return <div className="space-y-4">
    <div className={`flex items-start gap-3 rounded-md border p-3 ${result.modelStatus==='available'?'border-[#295c47] bg-[#14251f]':'border-[#604e2d] bg-[#282318]'}`}><div className={result.modelStatus==='available'?'text-[#7bd1a0]':'text-[#e0b965]'}>{result.modelStatus==='available'?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}</div><div><div className="text-[11px] font-bold text-[#dce5e9]">Model {result.modelStatus}</div><div className="mt-1 text-[10px] leading-5 text-[#a5b1bc]">{result.modelMessage}</div></div></div>
    <div className="grid grid-cols-2 gap-2"><DataPoint name="Detections returned" value={String(result.detections.length)}/><DataPoint name="Processed frames" value={String(result.processedFrames.length)}/></div>
    {result.processedFrames.length>0&&<div><div className="eyebrow mb-2">Processed frame evidence</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{result.processedFrames.map((frame,i)=><a href={frame} target="_blank" rel="noreferrer" key={`${frame}-${i}`} className="overflow-hidden rounded border border-[#293540] bg-[#0b1117]"><img src={frame} alt={`Processed frame ${i+1}`} className="aspect-video w-full object-contain"/><div className="px-2 py-1 mono text-[9px] text-[#8795a2]">FRAME {i+1}</div></a>)}</div></div>}
    <div><div className="mb-2 flex items-center justify-between"><div className="eyebrow">Returned detections</div><span className="mono text-[10px] text-[#8493a1]">{result.detections.length}</span></div>
      {result.detections.length? <div className="max-h-[260px] overflow-auto scrollbar-thin rounded-md border border-[#293541]"><table className="w-full text-left"><thead className="sticky top-0 bg-[#1b2530]"><tr className="eyebrow"><th className="p-2.5">Class</th><th className="p-2.5">Confidence</th><th className="p-2.5">Frame</th><th className="p-2.5">Box coordinates</th></tr></thead><tbody>{result.detections.map((d,i)=><tr key={`${d.frame}-${i}`} className="border-t border-[#28333f] text-[10px] text-[#c5d0d9]"><td className="p-2.5 font-semibold">{d.className}</td><td className="p-2.5 mono">{(d.confidence*100).toFixed(1)}%</td><td className="p-2.5 mono">{d.frame}</td><td className="p-2.5 mono">[{d.x1}, {d.y1}] – [{d.x2}, {d.y2}]</td></tr>)}</tbody></table></div>:<EmptyState title="No detections returned" copy="The service returned no detection records for this analysis. No predictions are inferred by the interface."/>}
    </div>
  </div>;
}

function AnalyticsPage() {
  const summary=useGetSentinelSummary();const incidents=useListIncidents({});
  const records=incidents.data??[];
  const distribution=useMemo(()=>['pending','verified','dismissed','resolved'].map(status=>({status,count:records.filter(i=>i.status===status).length})),[records]);
  return <><PageHead kicker="Service records / 06" title="Analytics" detail="Aggregate views are calculated from the summary and incident records returned by the API. No forecast or synthetic activity is added."/>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Returned records" value={incidents.data?.length} note="Current incident query" icon={Database}/><Metric label="Verified" value={summary.data?.verifiedIncidents} note="Human-reviewed status" icon={CheckCircle2} tone="green"/><Metric label="Pending review" value={summary.data?.pendingIncidents} note="Requires operator attention" icon={Clock3} tone="amber"/></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]"><Panel title="Daily incident count" label="API summary">
      {summary.isLoading?<div className="skeleton h-[280px]"/>:summary.isError?<QueryProblem onRetry={()=>summary.refetch()}/>:summary.data?.daily.length?<div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.data.daily} margin={{top:15,right:10,bottom:0,left:-15}}><defs><linearGradient id="analyticArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#53b9aa" stopOpacity={.3}/><stop offset="100%" stopColor="#53b9aa" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#293440" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#80909e',fontSize:10}}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:'#80909e',fontSize:10}}/><Tooltip contentStyle={{background:'#18212b',border:'1px solid #34414d',borderRadius:7,color:'#dce5eb',fontSize:11}}/><Area type="monotone" dataKey="count" stroke="#58b9ad" strokeWidth={2} fill="url(#analyticArea)"/></AreaChart></ResponsiveContainer></div>:<EmptyState title="No trend records returned" copy="Daily series is empty in the current summary response."/>}
    </Panel><Panel title="Review status distribution" label={incidents.isLoading?'Loading':`${records.length} records`}>
      {incidents.isLoading?<LoadingRows/>:incidents.isError?<QueryProblem onRetry={()=>incidents.refetch()}/>:records.length?<div className="space-y-4">{distribution.map(row=><div key={row.status}><div className="mb-1.5 flex justify-between"><span className="text-[11px] capitalize text-[#bac5ce]">{row.status}</span><span className="mono text-[10px] text-[#9ba9b6]">{row.count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#27323e]"><div className={`h-full rounded-full transition-all ${row.status==='verified'?'bg-[#54b68a]':row.status==='pending'?'bg-[#d8ad58]':row.status==='dismissed'?'bg-[#778696]':'bg-[#4b99a5]'}`} style={{width:`${records.length?row.count/records.length*100:0}%`}}/></div></div>)}</div>:<EmptyState title="No incident records" copy="Status distribution appears once the API returns incident records."/>}
    </Panel></div>
    {(summary.isError||incidents.isError)&&<div className="mt-4 rounded-md border border-[#6a333b] bg-[#291b20] p-3 text-[10px] text-[#e89aa0]">Analytics is incomplete because one or more API queries failed. Retry the affected panel above.</div>}
  </>;
}

function SettingsPage() {
  const summary=useGetSentinelSummary();
  return <><PageHead kicker="Operational guidance / 07" title="System notes" detail="A transparent account of what this experimental review tool does, what it cannot establish, and how data is used."/>
    <div className="grid gap-4 xl:grid-cols-[1fr_.8fr]">
      <div className="space-y-4">
        <Panel title="Experimental model availability" label="Live API status">
          {summary.isLoading?<LoadingRows/>:summary.isError?<QueryProblem onRetry={()=>summary.refetch()}/>:<><div className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 ${summary.data?.modelAvailable?'border-[#285944] bg-[#14251f] text-[#8ed4ab]':'border-[#65502a] bg-[#2c2518] text-[#e2bd6b]'}`}><span className="h-2 w-2 rounded-full bg-current"/><span className="mono text-[10px] uppercase">{summary.data?.modelAvailable?'Model available':'Model unavailable'}</span></div><p className="mb-0 mt-3 text-[11px] leading-5 text-[#a3afbb]">{summary.data?.modelMessage||'No model message was returned.'}</p></>}
          <p className="mb-0 mt-4 border-t border-[#293541] pt-3 text-[10px] leading-5 text-[#8291a0]">Video analysis runs only when service-side model dependencies and weights are installed. If unavailable, no detections are fabricated.</p>
        </Panel>
        <Panel title="Review boundaries" label="Read before action">
          <ul className="m-0 space-y-3 p-0 text-[11px] leading-5 text-[#aab6c0]">{[
            'This is an experimental, rule-based accident review aid. Signals and detections are not a determination that an accident occurred.',
            'Proximity between objects or an abrupt stop alone does not prove a collision. Operators must assess the returned evidence and context.',
            'No facial recognition or person identification is performed or presented by this interface.',
            'The tool does not initiate emergency dispatch. Any notification action is explicitly simulated and only records a recipient message.',
          ].map((t,i)=><li key={t} className="flex gap-3"><span className="mono text-[#58b9ad]">0{i+1}</span><span>{t}</span></li>)}</ul>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title="Privacy and footage handling" label="Authorized use">
          <div className="space-y-3 text-[11px] leading-5 text-[#aab6c0]"><p className="m-0">Upload footage only when you are authorized to review it. Evidence is served from this application’s same-origin endpoint.</p><p className="m-0">Camera metadata, analysis outputs, and incident records are retrieved from the Sentinel API. This page does not claim a specific retention period or encryption policy beyond what the service reports.</p><p className="m-0">Avoid uploading footage containing sensitive material unless your organization’s policy permits it.</p></div>
        </Panel>
        <Panel title="Analysis thresholds" label="Per-request settings">
          <div className="space-y-3 text-[11px] leading-5 text-[#aab6c0]"><p className="m-0">Detection confidence and suspicious-frame thresholds are chosen on the video analysis request. They are passed to the analysis API and are not stored as a global preference.</p><Link href="/monitoring" className="btn mt-1"><Settings2 size={14}/>Configure a request</Link><p className="m-0 text-[10px] text-[#8291a0]">Thresholds tune review sensitivity; they do not certify or rule out an incident.</p></div>
        </Panel>
        <Panel title="Notification recipient" label="Simulation only">
          <p className="mt-0 text-[11px] leading-5 text-[#aab6c0]">A recipient is entered per incident when the operator records a simulated notification. There is no dispatch integration in this application.</p><div className="rounded-md border border-[#604e2d] bg-[#282318] p-3 text-[10px] leading-5 text-[#d6bd80]"><BellRing className="mr-1 inline" size={12}/>Simulation is not a real notification, emergency call, or dispatch.</div>
        </Panel>
      </div>
    </div>
  </>;
}

function NotFound() { return <div className="py-24 text-center"><div className="eyebrow">Route unavailable</div><h1 className="mt-3 text-2xl font-bold">This console page does not exist.</h1><Link className="btn btn-primary mt-5" href="/">Return to overview</Link></div>; }
function Routed() {
  return <AppShell><Switch>
    <Route path="/" component={Home}/>
    <Route path="/monitoring" component={MonitoringPage}/>
    <Route path="/alerts" component={()=><IncidentsPage/>}/>
    <Route path="/history" component={()=><IncidentsPage history/>}/>
    <Route path="/cameras" component={CamerasPage}/>
    <Route path="/analytics" component={AnalyticsPage}/>
    <Route path="/settings" component={SettingsPage}/>
    <Route component={NotFound}/>
  </Switch></AppShell>;
}
function App() { return <QueryClientProvider client={qc}><Router><Routed/></Router></QueryClientProvider>; }
export default App;
