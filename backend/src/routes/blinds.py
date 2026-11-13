from fastapi import APIRouter,Depends,Response
from src.config.database import get_db
from src.utils.auth import current_user,editor
from src.schemas.blind import BlindInput,BlindOut
from src.controllers import blind_controller as controller
router=APIRouter(prefix='/blind-verifications',tags=['blind-verifications'])
@router.get('',response_model=list[BlindOut])
def index(run_id:int|None=None,db=Depends(get_db),user=Depends(current_user)):return controller.index(db,run_id)
@router.post('',response_model=BlindOut,status_code=201)
def create(data:BlindInput,response:Response,db=Depends(get_db),user=Depends(editor)):
    report=controller.create(db,data,user)
    if report.reused:response.status_code=200
    return report
@router.get('/{id}',response_model=BlindOut)
def detail(id:int,db=Depends(get_db),user=Depends(current_user)):return controller.detail(db,id)
