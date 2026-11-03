#!/usr/bin/env python3
"""Publish reviewed promo derivatives through Wordbase's existing authenticated API.

Default plan is read-only. Apply requires an exact release revision, a verified
backup marker and a private journal; it never publishes apps or changes Caddy.
"""
import argparse,fcntl,hashlib,json,subprocess,time,urllib.request,urllib.parse,uuid
from pathlib import Path
ROOT=Path('/var/www/wordbase')
ORIGIN='https://norvyn.com'

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def revision():return subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
def journal_source_matches(recorded, current, command):
 return recorded==current or (command=='verify' and subprocess.run(['git','-C',str(ROOT),'merge-base','--is-ancestor',recorded,current],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0)
def metadata(app):return json.loads(app.get('meta') or '{}')
def current_items(app):
 m=metadata(app);v=m.get('promotionalMedia')
 if isinstance(v,dict) and 'items' in v:return v['items']
 if isinstance(v,dict) and v.get('type') in ('video','animated-image','image'):return [v]
 if v is not None and v!={'type':'none'}:raise ValueError('Unrecognized existing promo metadata; preserve it and review')
 return [{'type':'video','src':m['video'],**({'poster':m['videoPoster']} if m.get('videoPoster') else {})}] if m.get('video') else []
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',nargs='?',default='plan',choices=['plan','apply','verify']);parser.add_argument('--stage',type=Path,required=True);parser.add_argument('--journal',type=Path);parser.add_argument('--source-revision');args=parser.parse_args()
 stage=args.stage.resolve(strict=True);inventory=stage/'inventory.json';assets=[]
 for asset in json.loads(inventory.read_text())['assets']:
  if asset['association']['status']!='confirmed' or asset['association'].get('catalogStatus')!='published':continue
  d=asset['delivery']
  for name,key in [('file','sha256'),('posterFile','posterSHA256')]:
   file=stage/'assets'/Path(d[name]).name
   assert file.resolve().is_relative_to((stage/'assets').resolve()) and file.is_file() and not file.is_symlink()
   assert sha(file)==d[key],('Staged derivative hash mismatch',asset['id'],name)
  assets.append(asset)
 assert assets,'No confirmed published-app assets staged'
 if args.command=='plan':
  print(json.dumps({'assets':len(assets),'apps':sorted({a['association']['appSlug'] for a in assets}),'bytes':sum(a['delivery']['bytes']+a['delivery']['posterBytes'] for a in assets),'productionWrites':False},ensure_ascii=False,indent=2));return
 assert args.source_revision and revision()==args.source_revision,'Unexpected source revision; stop before writes'
 assert args.journal and args.journal.is_absolute() and not args.journal.resolve().is_relative_to(ROOT),'Private journal required outside served checkout'
 assert (stage/'backup-verified.json').is_file() and json.loads((stage/'backup-verified.json').read_text()).get('verified') is True,'Verify backup before authoring'
 values={}
 for line in (ROOT/'.env').read_text().splitlines():
  if '=' in line and not line.lstrip().startswith('#'):
   k,v=line.split('=',1);values[k.strip()]=v.strip().strip('"\x27')
 key=values['WORDBASE_API_KEY']
 def call(path,method='GET',body=None,content_type='application/json'):
  payload=body if isinstance(body,bytes) else None if body is None else json.dumps(body,ensure_ascii=False).encode()
  req=urllib.request.Request('http://127.0.0.1:4100/api'+path,method=method,data=payload,headers={'Authorization':'Bearer '+key,'Content-Type':content_type})
  with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
 def rows():return call('/apps?limit=10000')['data']
 def save():
  args.journal.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n');args.journal.chmod(0o600)
 if args.journal.exists():
  state=json.loads(args.journal.read_text());assert state['inventorySHA256']==sha(inventory) and journal_source_matches(state['revision'],args.source_revision,args.command),'Journal/stage differs; inspect before retry'
 else:
  assert args.command=='apply','No prior publication journal'
  state={'revision':args.source_revision,'inventorySHA256':sha(inventory),'beforeApps':rows(),'uploads':{},'assigned':{}};save()
 before_by_slug={a['slug']:a for a in state['beforeApps']}
 for asset in assets:assert before_by_slug[asset['association']['appSlug']]['status']=='published','Never publish a draft for a promo'
 if args.command=='verify':
  final=rows();by_slug={a['slug']:a for a in final};receipt=[]
  for asset in assets:
   slug=asset['association']['appSlug'];match=next((m for m in current_items(by_slug[slug]) if m.get('id')==asset['id']),None)
   upload=state['uploads'][asset['id']];assert match and match['src']==upload['video']['url'] and match['poster']==upload['poster']['url']
   for prefix in ['/apps/','/en/apps/']:
    with urllib.request.urlopen(ORIGIN+prefix+urllib.parse.quote(slug),timeout=30) as response:html=response.read().decode()
    assert match['src'] in html and 'data-promo-panel' in html,'Published page missing assigned media'
   receipt.append({'id':asset['id'],'sourceSHA256':asset['source']['sha256'],'appSlug':slug,'status':'deployed','mediaId':upload['video']['id'],'url':upload['video']['url'],'posterMediaId':upload['poster']['id'],'posterUrl':upload['poster']['url']})
  for original in state['beforeApps']:
   if original['status']=='draft':assert original==by_slug[original['slug']],'Existing draft changed'
  build=call('/build/status');assert build['status']=='success' and build['startedAt']>=state['queuedAt']-2000,'Catalog rebuild not accepted yet'
  state['verified']=True;save();(stage/'publication-result.json').write_text(json.dumps({'origin':ORIGIN,'revision':args.source_revision,'publicationRevision':state['revision'],'verifiedAt':int(time.time()*1000),'assets':receipt,'draftsPreserved':sum(a['status']=='draft' for a in final),'build':build},ensure_ascii=False,indent=2)+'\n');print('Verified deployed promos:',len(receipt));return
 assert not state.get('verified'),'Already verified; use a new reviewed stage for another release'
 library=call('/media?limit=10000')['data']
 def upload(asset,kind):
  d=asset['delivery'];is_video=kind=='video';field='file' if is_video else 'posterFile';hashfield='sha256' if is_video else 'posterSHA256';expected=d[hashfield]
  filename='promo-'+asset['source']['sha256'][:12]+'-'+expected[:16]+('.mp4' if is_video else '.jpg')
  saved=state['uploads'].setdefault(asset['id'],{}).get(kind)
  existing=saved or next((m for m in library if m['filename']==filename),None)
  if existing:
   with urllib.request.urlopen(ORIGIN+existing['url'],timeout=60) as response:assert hashlib.sha256(response.read()).hexdigest()==expected,'Recorded media hash differs'
   result=existing
  else:
   boundary='wordbase-promo-'+uuid.uuid4().hex;mime='video/mp4' if is_video else 'image/jpeg';file=stage/'assets'/Path(d[field]).name
   body=(f'--{boundary}\r\nContent-Disposition: form-data; name="alt_text"\r\n\r\n{asset["association"]["alt"]}\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n').encode()+file.read_bytes()+f'\r\n--{boundary}--\r\n'.encode()
   result=call('/media','POST',body,'multipart/form-data; boundary='+boundary)
   assert result['size']==d['bytes' if is_video else 'posterBytes']
   state['uploads'][asset['id']][kind]=result;save()
   with urllib.request.urlopen(ORIGIN+result['url'],timeout=60) as response:assert hashlib.sha256(response.read()).hexdigest()==expected,'Uploaded media differs'
  state['uploads'][asset['id']][kind]=result;save();return result
 planned={}
 for asset in assets:
  video=upload(asset,'video');poster=upload(asset,'poster');a=asset['association'];d=asset['delivery']
  planned.setdefault(a['appSlug'],[]).append((a.get('order',0),{'id':asset['id'],'type':'video','src':video['url'],'poster':poster['url'],'alt':a['alt'],'label':a['label'],'width':d['width'],'height':d['height']}))
 planned={slug:[item for _,item in sorted(items,key=lambda x:x[0])] for slug,items in planned.items()}
 assert revision()==args.source_revision,'Source changed during upload; retain uploaded files unused and stop'
 lockfile=ROOT/'packages/api/data/.deployment.lock';assert not lockfile.is_symlink()
 with lockfile.open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  watcher=subprocess.run(['systemctl','is-active','--quiet','wordbase-rebuild.path']).returncode==0
  subprocess.run(['systemctl','stop','wordbase-rebuild.path'],check=True)
  build_lock=None
  try:
   for _ in range(300):
    if subprocess.check_output(['systemctl','show','--value','-p','ActiveState','wordbase-rebuild.service'],text=True).strip() in ('inactive','failed'):break
    time.sleep(1)
   else:raise RuntimeError('Prior rebuild did not finish; no metadata changed')
   release_lock=ROOT/'packages/api/data/.release.lock';assert not release_lock.is_symlink();build_lock=release_lock.open('a');fcntl.flock(build_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   for slug,new_items in planned.items():
    fresh=next(a for a in rows() if a['slug']==slug);assert fresh['status']=='published'
    existing=current_items(fresh);ids={m.get('id') for m in new_items}
    combined=[m for m in existing if m.get('id') not in ids]+new_items;assert len(combined)<=12,'Gallery limit exceeded; preserve existing media'
    if metadata(fresh).get('promotionalMedia')=={'items':combined}:continue
    # Append reviewed new media while retaining pre-existing media, copy and publication.
    after=call('/apps/'+fresh['id'],'PUT',{'promotionalMedia':{'items':combined}})
    assert metadata(after)['promotionalMedia']=={'items':combined}
    for k,v in fresh.items():
     if k not in ('meta','updatedAt'):assert after[k]==v,('Unexpected app field change',slug,k)
    old_meta=metadata(fresh);new_meta=metadata(after)
    for k in ['video','videoPoster','promotionalMedia']:old_meta.pop(k,None);new_meta.pop(k,None)
    assert old_meta==new_meta,'Unrelated metadata changed'
    state['assigned'][slug]={'before':current_items(fresh),'after':combined};save();print('Assigned',slug,len(new_items),'new promos',flush=True)
   state['queuedAt']=int(time.time()*1000);save();assert call('/build/trigger','POST',{})['status']=='requested';state['queued']=True;save()
  except BaseException:
   # Restore only our promo field when it still equals this transaction's value.
   for slug,change in state['assigned'].items():
    current=next(a for a in rows() if a['slug']==slug)
    if metadata(current).get('promotionalMedia')=={'items':change['after']}:
     value={'items':change['before']} if change['before'] else {'type':'none'}
     call('/apps/'+current['id'],'PUT',{'promotionalMedia':value})
   state['recoveredPromoAssignments']=True;save();raise
  finally:
   if build_lock:build_lock.close()
   if watcher:subprocess.run(['systemctl','start','wordbase-rebuild.path'],check=True)
 print('Promos assigned; one rebuild queued. Verify after rebuild before recording deployed status.',flush=True)

if __name__=='__main__':main()
