from typing import Annotated
from datetime import datetime
from pydantic import BaseModel,Field,ConfigDict,model_validator
Coordinate=Annotated[float,Field(allow_inf_nan=False,ge=-1e6,le=1e6)]
Point=Annotated[list[Coordinate],Field(min_length=2,max_length=2)]
Outline=Annotated[list[Point],Field(min_length=8,max_length=8)]
Label=Annotated[str,Field(min_length=1,max_length=20)]
class BlindInput(BaseModel):
    run_id:int
    labels:list[Label]=Field(min_length=8,max_length=8)
    points:Outline
    @model_validator(mode='after')
    def labels_distinct(self):
        if len(set(self.labels))!=8:raise ValueError('八个标签必须互不相同')
        return self
class BlindOut(BaseModel):
    id:int
    run_id:int
    run_fingerprint:str
    input_fingerprint:str
    input:dict
    result:dict
    verified_by:str
    created_at:datetime
    reused:bool=False
    model_config=ConfigDict(from_attributes=True)
