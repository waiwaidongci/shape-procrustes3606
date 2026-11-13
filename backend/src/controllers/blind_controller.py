from src.services import blind_service as service
def index(db,run_id=None):return service.list_verifications(db,run_id)
def create(db,data,user):return service.verify(db,data,user)

def detail(db,id):return service.get_verification(db,id)
