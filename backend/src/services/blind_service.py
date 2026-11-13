import hashlib,json
import numpy as np
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from src.models import BlindVerification
from src.services.run_service import get_run
from src.services.geometry import preshape,proper_rotation

ALGORITHM='frozen-basis-blind-projection-v1'

def _canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)

def _fingerprint(run_fingerprint,labels,points):
    canonical={'algorithm':ALGORITHM,'run_fingerprint':run_fingerprint,'labels':labels,'points':points}
    return hashlib.sha256(_canonical(canonical).encode()).hexdigest()

def _basis(result):
    pca=result.get('pca') or {}
    if 'gpa_mean' not in result or 'arithmetic_mean' not in pca or 'modes' not in pca:raise HTTPException(409,'该研究缺少冻结均值或保留模态，不能盲验')
    return result['gpa_mean'],pca['arithmetic_mean'],pca['modes']

def _validate_labels(labels,frozen,run):
    if len(set(labels))!=8:raise HTTPException(422,'八个标签必须互不相同；请按冻结研究的同源标签逐一录入')
    if labels==frozen:return
    if set(labels)==set(frozen):raise HTTPException(422,'标签顺序与冻结研究不一致：须按 '+' → '.join(frozen)+' 录入，本册不自动换位或反转顺序')
    template_labels=list((run.snapshot.get('template') or {}).get('labels') or [])
    missing=[l for l in frozen if l not in labels];extra=[l for l in labels if l not in frozen]
    parts=[]
    if missing:parts.append('缺少 '+', '.join(missing))
    if extra:parts.append('多出 '+', '.join(extra))
    detail='标签须与冻结研究完全一致（'+'；'.join(parts)+'），不得改用其他同源标签'
    if template_labels and set(template_labels)==set(frozen) and template_labels!=frozen:
        detail+='。冻结研究标签为 '+' → '.join(frozen)+'，模板当前标签为 '+' → '.join(template_labels)
    raise HTTPException(422,detail)

def analyze_blind(run,labels,points):
    """Project one new outline onto the frozen GPA mean and retained linear modes.

    No GPA alternation and no PCA decomposition is re-run here; the frozen mean,
    arithmetic mean, loadings and explained ratios are reused verbatim.
    """
    gpa_mean,arithmetic_mean,modes=_basis(run.result)
    point_matrix=np.asarray(points,dtype=float)
    unit,normalization=preshape(point_matrix)
    mean=np.asarray(gpa_mean,dtype=float)
    if mean.shape!=unit.shape:raise ValueError('冻结GPA均值与同源角点数不一致，不能盲验')
    rotation=proper_rotation(unit,mean);aligned=unit@rotation
    u,_,vt=np.linalg.svd(unit.T@mean);det_ref=float(np.linalg.det(u@vt));sign=1. if det_ref>=0 else -1.
    reflected_rotation=u@np.diag([1.,-sign])@vt;reflected_aligned=unit@reflected_rotation
    proper_distance=float(np.linalg.norm(aligned-mean));reflected_distance=float(np.linalg.norm(reflected_aligned-mean))
    unit_norm=float(np.linalg.norm(aligned))
    loadings=np.asarray([m['loading'] for m in modes],dtype=float).reshape(len(modes),-1) if modes else np.zeros((0,unit.size))
    frac_mean=np.asarray(arithmetic_mean,dtype=float).reshape(-1)
    centered=aligned.reshape(-1)-frac_mean
    scores=centered@loadings.T if len(modes) else np.zeros(0)
    reconstruction=(frac_mean+(scores@loadings if len(modes) else 0)).reshape(aligned.shape)
    residual=float(np.linalg.norm(aligned-reconstruction))
    mirror_implied=bool(reflected_distance<proper_distance-1e-9*max(1.0,proper_distance))
    return {
        'method':ALGORITHM,'recomputed':False,'reflection_removed':False,
        'basis':{'run_id':run.id,'run_name':run.name,'run_fingerprint':run.result['fingerprint'],'labels':list(run.result['labels']),'retained':int(len(modes)),'retained_requested':int(run.result['pca'].get('requested',len(modes))),'mode_indices':[int(m['index']) for m in modes],'gpa_mean_norm':float(np.linalg.norm(mean)),'pca_mean_norm':float(np.linalg.norm(frac_mean))},
        'input':{'labels':list(labels),'points':point_matrix.tolist()},
        'normalization':normalization,
        'gpa_mean':mean.tolist(),
        'arithmetic_mean':frac_mean.reshape(unit.shape).tolist(),
        'preshape':unit.tolist(),
        'rotation':rotation.tolist(),
        'rotation_determinant':float(np.linalg.det(rotation)),
        'aligned':aligned.tolist(),
        'reflected_aligned':reflected_aligned.tolist(),
        'aligned_norm':unit_norm,
        'gpa_distance':proper_distance,
        'reflection_diagnostic':{'proper_residual':proper_distance,'reflected_residual':reflected_distance,'reflected_rotation_determinant':float(np.linalg.det(reflected_rotation)),'mirror_implied':mirror_implied},
        'scores':[{'index':int(m['index']),'value':float(scores[i]),'singular_value':float(m['singular_value']),'explained_ratio':float(m['explained_ratio'])} for i,m in enumerate(modes)],
        'reconstruction':reconstruction.tolist(),
        'residual':residual,
        'residual_ratio':float(residual/unit_norm) if unit_norm else None,
        'point_residuals':[float(np.linalg.norm(aligned[i]-reconstruction[i])) for i in range(len(aligned))],
        'scope':'SO(2) rotation only (det=+1); mirror differences are preserved; frozen GPA mean and retained modes are reused without re-estimating GPA or PCA',
    }

def list_verifications(db,run_id=None):
    statement=select(BlindVerification).order_by(BlindVerification.id.desc())
    if run_id is not None:statement=statement.where(BlindVerification.run_id==run_id)
    return db.scalars(statement).all()

def get_verification(db,id):
    v=db.get(BlindVerification,id)
    if not v:raise HTTPException(404,'盲验报告不存在')
    return v

def verify(db,data,user):
    run=get_run(db,data.run_id)
    if run.status!='completed':raise HTTPException(409,'盲验须选定已完成的冻结研究')
    if not run.result.get('fingerprint'):raise HTTPException(409,'该研究没有冻结指纹，不能盲验')
    frozen_labels=run.result.get('labels') or []
    _validate_labels(list(data.labels),frozen_labels,run)
    points=[[float(x)+0.0 for x in p] for p in data.points]
    input_fingerprint=_fingerprint(run.result['fingerprint'],list(data.labels),points)
    existing=db.scalar(select(BlindVerification).where(BlindVerification.run_id==run.id,BlindVerification.input_fingerprint==input_fingerprint))
    if existing:
        existing.reused=True
        return existing
    try:
        report=analyze_blind(run,list(data.labels),points)
    except ValueError as exc:
        raise HTTPException(422,str(exc))
    record=BlindVerification(run_id=run.id,run_fingerprint=run.result['fingerprint'],input_fingerprint=input_fingerprint,input=report['input'],result=report,verified_by=user.email)
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing=db.scalar(select(BlindVerification).where(BlindVerification.run_id==run.id,BlindVerification.input_fingerprint==input_fingerprint))
        if not existing:raise HTTPException(409,'盲验报告写入冲突，请重试')
        existing.reused=True
        return existing
    record.reused=False
    return record
