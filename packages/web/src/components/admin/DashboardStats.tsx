import { useState, useEffect, useRef } from 'preact/hooks';
import { adminObserved } from '../../lib/admin-api';
import { DataNote, emptyReading, readingStatus, type Reading } from './DataNote';
interface Overview { totalPageViews:number; todayPageViews:number; activePostCount:number; }
interface PostsResponse { data:{id:string;title:string;status:string;createdAt:number}[];total:number; }
export default function DashboardStats() {
  const [overview,setOverview]=useState(emptyReading<Overview>());
  const [posts,setPosts]=useState(emptyReading<PostsResponse>());
  const [comments,setComments]=useState(emptyReading<{pending:number;total:number}>());
  const [loading,setLoading]=useState(false); const [now,setNow]=useState(Date.now());
  const busy=useRef(false);
  async function refresh() {
    if(busy.current) return; busy.current=true;setLoading(true);
    async function read<T>(path:string,set:(update:(previous:Reading<T>)=>Reading<T>)=>void) {
      try { const result=await adminObserved<T>(path);set(()=>({...result,error:null,fetchedAt:Date.now()})); }
      catch(error) { set(previous=>({...previous,error:error instanceof Error ? error.message : 'Request failed'})); }
    }
    await Promise.all([
      read<Overview>('/api/analytics/overview',setOverview),
      read<PostsResponse>('/api/posts?limit=5',setPosts),
      read<{pending:number;total:number}>('/api/comments/counts',setComments),
    ]);
    setNow(Date.now());setLoading(false);busy.current=false;
  }
  useEffect(()=>{void refresh();const interval=setInterval(()=>{setNow(Date.now());void refresh();},60_000);return()=>clearInterval(interval);},[]);
  const cards:{label:string;value:number|undefined;reading:Reading<unknown>}[]=[
    {label:'Posts',value:posts.data?.total,reading:posts},
    {label:'Published posts',value:overview.data?.activePostCount,reading:overview},
    {label:'Pending comments · all posts',value:comments.data?.pending,reading:comments},
    {label:'Recorded views · lifetime',value:overview.data?.totalPageViews,reading:overview},
    {label:'Recorded views · today UTC',value:overview.data?.todayPageViews,reading:overview},
  ];
  return <div>
    <div class="flex flex-wrap justify-between gap-3 mb-4"><div><h2 class="text-xl font-semibold text-ink">Site overview</h2><p class="text-sm text-ink-3">Review pending work and recorded activity. Data refreshes every minute while this page is open.</p></div><button onClick={()=>void refresh()} disabled={loading} class="border rounded-lg px-4 py-2 text-sm disabled:opacity-50">{loading?'Refreshing…':'Refresh'}</button></div>
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">{cards.map(({label,value,reading})=><div class="bg-surface rounded-lg border p-5"><p class="text-sm text-ink-3">{label}</p><p class="text-3xl font-semibold mt-2">{value===undefined?'—':value.toLocaleString()}</p>{readingStatus(reading,now) && <p class="text-xs text-ink-2 mt-2">{readingStatus(reading,now)}</p>}</div>)}</div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <section><h3 class="font-medium">Views & published count</h3><DataNote reading={overview} now={now}/></section>
      <section><h3 class="font-medium"><a class="text-accent" href="/admin/comments">Review comments →</a></h3><DataNote reading={comments} now={now}/></section>
      <section><h3 class="font-medium">Content records</h3><p class="text-xs text-ink-3">SQLite posts · current records · latest five by creation time.</p><DataNote reading={posts} now={now}/></section>
    </div>
    <p class="text-sm text-ink-3 mb-6">For build, sync and API status, open <a href="/admin/observability" class="text-accent">Observability</a>. Public reachability, TLS and backup verification are not monitored here.</p>
    <section class="bg-surface rounded-lg border"><div class="px-6 py-4 border-b"><h3 class="font-semibold">Recently created posts</h3></div>
      {posts.data===null?<p class="p-6 text-ink-3">Posts unavailable.</p>:posts.data.data.length===0?<p class="p-6 text-ink-3">No post records.</p>:posts.data.data.map(post=><div class="px-6 py-3 flex flex-wrap justify-between gap-3 border-b"><a href={`/admin/posts/edit?id=${post.id}`} class="text-accent">{post.title}</a><span class="text-sm text-ink-3">{post.status} · created {new Date(post.createdAt*1000).toISOString().slice(0,10)} UTC</span></div>)}
    </section>
  </div>;
}
