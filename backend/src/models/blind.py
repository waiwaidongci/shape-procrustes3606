from datetime import datetime
from sqlalchemy import String,ForeignKey,UniqueConstraint,DateTime,JSON
from sqlalchemy.orm import Mapped,mapped_column
from src.config.database import Base
class BlindVerification(Base):
    __tablename__='blind_verifications'
    id:Mapped[int]=mapped_column(primary_key=True)
    run_id:Mapped[int]=mapped_column(ForeignKey('alignment_runs.id'))
    run_fingerprint:Mapped[str]=mapped_column(String(64))
    input_fingerprint:Mapped[str]=mapped_column(String(64))
    input:Mapped[dict]=mapped_column(JSON,default=dict)
    result:Mapped[dict]=mapped_column(JSON,default=dict)
    verified_by:Mapped[str]=mapped_column(String(160),default='')
    created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
    __table_args__=(UniqueConstraint('run_id','input_fingerprint'),)
