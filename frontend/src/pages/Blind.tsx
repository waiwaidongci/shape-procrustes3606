import {useEffect,useMemo,useState} from 'react';
import {researchStore,loadRuns,selectRun} from '../stores/research';
import {blindStore,loadBlinds,submitBlind,selectBlind} from '../stores/blind';
import {authStore,canEdit} from '../stores/auth';
import {useTask} from '../hooks/useTask';
import {usePolling} from '../hooks/usePolling';
import {num,sci,percent,date} from '../utils/format';
import PageHeading from '../components/common/PageHeading';
import ErrorNotice from '../components/common/ErrorNotice';
import ShapeCanvas from '../components/ShapeCanvas';
import type {BlindVerification} from '../types/domain';

type Draft={label:string;x:string;y:string};
const blank=(labels:string[]):Draft[]=>labels.map(label=>({label,x:'',y:''}));
const pointRows=(draft:Draft[])=>draft.map(r=>[Number(r.x),Number(r.y)]);

export default function Blind(){
  const {runs,selected}=researchStore.use(),{items}=blindStore.use(),{user}=authStore.use(),{busy,error,perform}=useTask();
  const completed=runs.filter(r=>r.status==='completed');
  const [runId,setRunId]=useState(0),[draft,setDraft]=useState<Draft[]>(blank([])),[selectedId,setSelected]=useState(Number(localStorage.getItem('shapes-blind')||0)),[message,setMessage]=useState('');
  const run=completed.find(r=>r.id===runId),labels=run?.result.labels||[];
  const [allRuns,setAllRuns]=useState(false);
  const reports=allRuns?items:items.filter(v=>v.run_id===runId),report=reports.find(v=>v.id===selectedId)||null;
  useEffect(()=>{perform(loadRuns);perform(loadBlinds)},[]);
  usePolling(loadRuns);
  useEffect(()=>{
    if(!completed.some(r=>r.id===runId))setRunId(completed.find(r=>r.id===selected)?.id||completed[0]?.id||0)
  },[runs,runId,selected]);
  useEffect(()=>{setDraft(blank(labels))},[runId]);
  useEffect(()=>{
    if(!reports.some(v=>v.id===selectedId))setSelected(reports[0]?.id||0);
  },[items,runId]);
  const filled=useMemo(()=>draft.filter(r=>r.x!==''&&r.y!=='').length,[draft]);
  const update=(index:number,key:keyof Draft,value:string)=>setDraft(rows=>rows.map((r,i)=>i===index?{...r,[key]:value}:r));
  const choose=(id:number)=>{setSelected(id);selectBlind(id)};
  return <>
    <PageHeading no="06" title="盲验复验" sub="选定已完成的冻结研究，录入八个同源角点与标签；沿用冻结均值与保留模态，不重算GPA或PCA。"/>
    <ErrorNotice error={error}/>
    {message&&<p className="success" role="status">{message}</p>}
    <div className="blind-spread">
      <section>
        <h2 className="ruled-title">录入新裁片 <small>blind / 不参与冻结集合</small></h2>
        {!completed.length?<div className="empty">先完成一项配准研究，再以它的冻结均值与保留模态做盲验。<a href="#/runs">前往工作台 →</a></div>:
        <form className="blind-form" onSubmit={e=>{e.preventDefault();perform(async()=>{
          const result=await submitBlind({run_id:runId,labels:draft.map(r=>r.label.trim()),points:pointRows(draft)});
          choose(result.id);
          setMessage(result.reused?('同一输入已有报告 #'+result.id+'，本次未新增记录，仅回看既有报告。'):('盲验报告 #'+result.id+' 已留存输入坐标与研究指纹。'))}
        )}}>
          <label className="run-select"><span>依据冻结研究</span><select aria-label="盲验依据研究" value={runId} onChange={e=>{setRunId(Number(e.target.value));setMessage('');selectRun(Number(e.target.value))}}>{completed.map(r=><option key={r.id} value={r.id}>#{r.id} {r.name}</option>)}</select></label>
          <div className="method-note">
            <b>冻结依据：{run?.result.fingerprint.slice(0,12)||'—'}…</b>
            <p>按 {labels.join(' → ')} 顺序录入。沿用该研究冻结的单位GPA均值、PCA算术均值与保留{run?.result.pca.retained??0}个模态载荷；新点只做去平移、centroid-size标准化与det(R)=+1旋转，再投影得分并重建。镜像不会被当作旋转消去。</p>
            <p>标签错序、重复或缺失，以及零centroid-size、共线等退化输入会被拒绝并说明原因；本册不自动重排或修正。</p>
          </div>
          <div className="blind-grid" role="group" aria-label="八个同源角点">
            {draft.map((row,i)=><div className="blind-row" key={i}>
              <span className="blind-index">{String(i+1).padStart(2,'0')}</span>
              <label>标签<input aria-label={'角点'+(i+1)+'标签'} value={row.label} onChange={e=>update(i,'label',e.target.value)} maxLength={20} required/></label>
              <label>x / mm<input aria-label={'角点'+(i+1)+'x'} type="number" step="any" value={row.x} onChange={e=>update(i,'x',e.target.value)} placeholder="0" required/></label>
              <label>y / mm<input aria-label={'角点'+(i+1)+'y'} type="number" step="any" value={row.y} onChange={e=>update(i,'y',e.target.value)} placeholder="0" required/></label>
            </div>)}
          </div>
          <div className="button-row"><button className="primary" disabled={busy||!canEdit(user)||!run}>{busy?'盲验中…':'执行盲验 →'}</button><span className="muted">已填 {filled} / 8 点</span></div>
          {!canEdit(user)&&<p className="muted">观察员只读；请形状分析员录入新裁片并执行盲验。</p>}
        </form>}
        <aside className="margin-note">盲验不把新裁片加入集合，也不更新冻结均值、奇异值或解释率。报告写入数据库，附输入坐标、研究指纹与输入指纹；源裁片后续修改不会改变已留存报告。</aside>
        <div className="button-row"><a href="#/results" className="text-link">回看该研究的冻结结果 ↗</a></div>
      </section>
      <section>
        <h2 className="ruled-title">盲验报告 <small>{reports.length}份</small></h2>
        {allRuns&&<p className="muted">正在回看全部研究的盲验；报告本身标明依据研究与两级指纹。</p>}
        <div className="button-row"><button type="button" className="small-button" onClick={()=>setAllRuns(!allRuns)}>{allRuns?'仅看当前研究':'回看全部研究的报告'}</button></div>
        {!reports.length&&<div className="empty">该研究尚无盲验。用冻结均值和保留模态对照同源新裁片；报告只在输入变化时新增。</div>}
        {reports.map(v=><button type="button" key={v.id} className={'blind-entry'+(v.id===selectedId?' active':'')} onClick={()=>choose(v.id)}>
          <span className="entry-line"><small>BLIND {v.id}</small><span>{date(v.created_at)}</span></span>
          <b>#{v.run_id} {v.result.basis.run_name} · {v.input_fingerprint.slice(0,16)}…</b>
          <span className="blind-entry-meta">残差 {sci(v.result.residual)} / det(R) {num(v.result.rotation_determinant,6)} / {v.result.basis.retained}模态{v.result.reflection_diagnostic.mirror_implied?' / 疑似镜像':''}</span>
        </button>)}
        {report&&<BlindReport report={report}/>}
      </section>
    </div>
  </>;
}

function BlindReport({report}:{report:BlindVerification}){
  const r=report.result,reflection=r.reflection_diagnostic;
  return <article className="blind-report">
    <div className="result-byline"><b>#{report.id} 盲验报告</b><span>{report.verified_by} / {date(report.created_at)}</span></div>
    <div className="blind-basis">
      <small>依据冻结研究</small>
      <b>#{r.basis.run_id} {r.basis.run_name}</b>
      <span>同源顺序 {r.basis.labels.join(' → ')}</span>
      <span>保留模态 PC{r.basis.mode_indices.join(' / PC')}（实际 {r.basis.retained} / 请求 {r.basis.retained_requested}）</span>
      <span>GPA均值范数 {num(r.basis.gpa_mean_norm,9)} / PCA均值范数 {num(r.basis.pca_mean_norm,9)}</span>
    </div>
    <div className="result-metrics">
      <div><small>保留模态残差</small><strong>{sci(r.residual)}</strong><span>相对单位形状 {r.residual_ratio==null?'—':sci(r.residual_ratio)}</span></div>
      <div><small>对冻结GPA均值距离</small><strong>{sci(r.gpa_distance)}</strong><span>仅SO(2)，不反射</span></div>
      <div><small>det(R)</small><strong>{num(r.rotation_determinant,9)}</strong><span>+1 才与冻结模态同向</span></div>
      <div><small>保留模态</small><strong>{r.basis.retained}<i>个</i></strong><span>沿用请求 {r.basis.retained_requested}</span></div>
    </div>
    <h2 className="ruled-title">去摆放、尺寸与旋转后的轮廓 <small>dimensionless</small></h2>
    <div className="comparison-grid">
      <section><ShapeCanvas shapes={[{points:r.gpa_mean,label:'冻结单位GPA均值',color:'var(--red)',emphasis:true},{points:r.aligned,label:'本次对齐',color:'var(--ink)',emphasis:true}]} labels={r.basis.labels} unit="dimensionless" caption="朱砂=冻结单位GPA均值；炭墨=本次新裁片经中心化、centroid-size标准化与det(R)=+1旋转后的对齐轮廓。像素尺度不作物理比较。"/></section>
      <section><ShapeCanvas shapes={[{points:r.arithmetic_mean,label:'冻结PCA算术均值',color:'var(--moss)',emphasis:true,dashed:true},{points:r.aligned,label:'本次对齐',color:'var(--ink)'},{points:r.reconstruction,label:'保留模态重建',color:'var(--red)',emphasis:true}]} labels={r.basis.labels} unit="dimensionless" caption="苔色虚线=冻结PCA算术均值；炭墨细线=对齐轮廓；朱砂=用冻结保留模态的重建轮廓。残差按逐点欧氏距离留档。"/></section>
    </div>
    <div className="mean-strip">
      <div><small>对齐轮廓范数</small><b>{num(r.aligned_norm,9)}</b></div>
      <div><small>centroid-size</small><b>{num(r.normalization.centroid_size,5)}<i>mm</i></b></div>
      <p>平移、正尺度与旋转已在配准中移除；本次报告不重算GPA、奇异值或解释率，冻结均值与载荷原样复用。</p>
    </div>
    <h2 className="ruled-title">保留模态得分 <small>以冻结载荷投影</small></h2>
    {!r.scores.length?<div className="no-variation"><h2>该研究没有可保留的形变模态</h2><p>冻结研究未解析出有效PCA方向；本次盲验只对照冻结均值并与算术均值重建，不生成得分或模态解释。</p></div>:
    <div className="table-scroll"><table><thead><tr><th>模态</th><th>本次得分</th><th>冻结奇异值</th><th>冻结解释率</th></tr></thead><tbody>
      {r.scores.map(s=><tr key={s.index}><td>PC{s.index}</td><td>{num(s.value,6)}</td><td>{sci(s.singular_value)}</td><td>{percent(s.explained_ratio)}</td></tr>)}
    </tbody></table></div>}
    <h2 className="ruled-title">左右反射差异 <small>保留差异，不消去</small></h2>
    <div className={'reflection-note'+(reflection.mirror_implied?' flagged':'')}>
      <p>允许反射的残差 {sci(reflection.reflected_residual)}（其旋转 det {num(reflection.reflected_rotation_determinant,6)}）对比禁反射残差 {sci(reflection.proper_residual)}。{reflection.mirror_implied?'反射更贴合，提示本次轮廓方向与冻结集合相反；按口径保留镜像差异，不把反射当作旋转消去，得分仍按det(R)=+1对齐给出。':'禁反射更贴合，没有镜像替代解释更优。'}</p>
      <ShapeCanvas shapes={[{points:r.gpa_mean,label:'冻结单位GPA均值',color:'var(--moss)',emphasis:true},{points:r.aligned,label:'禁反射对齐',color:'var(--ink)',emphasis:true},{points:r.reflected_aligned,label:'允许反射对齐',color:'var(--red)',dashed:true}]} labels={r.basis.labels} unit="dimensionless" caption="苔色=冻结均值；炭墨=禁反射对齐（det=+1）；朱砂虚线=允许反射的最小二乘对齐（det=−1），仅作差异诊断，不参与得分或重建。"/>
    </div>
    <h2 className="ruled-title">逐角点重建与残差 <small>同源顺序 {r.basis.labels.join(' → ')}</small></h2>
    <div className="table-scroll"><table><thead><tr><th>标签</th><th>输入 x / y / mm</th><th>对齐 x / y</th><th>重建 x / y</th><th>逐点残差</th></tr></thead><tbody>
      {r.basis.labels.map((label,i)=><tr key={label}><td>{label}</td><td>{num(r.input.points[i][0],5)} / {num(r.input.points[i][1],5)}</td><td>{num(r.aligned[i][0],6)} / {num(r.aligned[i][1],6)}</td><td>{num(r.reconstruction[i][0],6)} / {num(r.reconstruction[i][1],6)}</td><td>{sci(r.point_residuals[i])}</td></tr>)}
    </tbody></table></div>
    <details className="edit-fold"><summary>旋转矩阵、单位化记录与完整输入</summary><pre>{JSON.stringify({rotation:r.rotation,normalization:r.normalization,preshape:r.preshape,input:r.input},null,2)}</pre></details>
    <div className="result-boundary"><b>依据与边界</b><p>依据研究 #{r.basis.run_id}「{r.basis.run_name}」的冻结指纹与{r.basis.retained}个保留模态。盲验只投影新点，不混入重算；线性重建不保证可制造，也不证明工艺成因。</p><a href="#/results">回看冻结研究结果 →</a></div>
    <div className="fingerprint">研究指纹 <code>{report.run_fingerprint}</code><br/>输入指纹 <code>{report.input_fingerprint}</code></div>
  </article>;
}
