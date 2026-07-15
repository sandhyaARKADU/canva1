from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, Template, User
from auth import get_current_user
from datetime import datetime

router = APIRouter(prefix="/api/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    data: Optional[str] = None
    thumbnail: Optional[str] = None
    width: Optional[int] = 800
    height: Optional[int] = 800
    tags: Optional[str] = None
    is_premium: Optional[bool] = False


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    data: Optional[str] = None
    thumbnail: Optional[str] = None
    tags: Optional[str] = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    category_id: Optional[str]
    data: Optional[str]
    thumbnail: Optional[str]
    width: int
    height: int
    tags: Optional[str]
    is_premium: bool
    use_count: int
    created_at: str
    updated_at: str


class TemplateListResponse(BaseModel):
    templates: List[TemplateResponse]
    total: int


import random
import string


def generate_id():
    return "tmpl_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


@router.get("", response_model=TemplateListResponse)
def list_templates(
    category_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Template)

    if category_id:
        query = query.filter(Template.category_id == category_id)
    if search:
        query = query.filter(Template.name.ilike(f"%{search}%"))

    total = query.count()
    templates = query.order_by(Template.use_count.desc()).offset(offset).limit(limit).all()

    return TemplateListResponse(
        templates=[
            TemplateResponse(
                id=t.id, name=t.name, description=t.description,
                category_id=t.category_id, data=t.data, thumbnail=t.thumbnail,
                width=t.width, height=t.height, tags=t.tags,
                is_premium=t.is_premium, use_count=t.use_count,
                created_at=t.created_at.isoformat() if t.created_at else "",
                updated_at=t.updated_at.isoformat() if t.updated_at else "",
            )
            for t in templates
        ],
        total=total
    )


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return TemplateResponse(
        id=template.id, name=template.name, description=template.description,
        category_id=template.category_id, data=template.data, thumbnail=template.thumbnail,
        width=template.width, height=template.height, tags=template.tags,
        is_premium=template.is_premium, use_count=template.use_count,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.post("/{template_id}/use", response_model=TemplateResponse)
def use_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    template.use_count = (template.use_count or 0) + 1
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id, name=template.name, description=template.description,
        category_id=template.category_id, data=template.data, thumbnail=template.thumbnail,
        width=template.width, height=template.height, tags=template.tags,
        is_premium=template.is_premium, use_count=template.use_count,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.post("", response_model=TemplateResponse)
def create_template(
    req: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    template_id = generate_id()
    template = Template(
        id=template_id,
        name=req.name,
        description=req.description,
        category_id=req.category_id,
        data=req.data,
        thumbnail=req.thumbnail,
        width=req.width,
        height=req.height,
        tags=req.tags,
        is_premium=req.is_premium,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id, name=template.name, description=template.description,
        category_id=template.category_id, data=template.data, thumbnail=template.thumbnail,
        width=template.width, height=template.height, tags=template.tags,
        is_premium=template.is_premium, use_count=template.use_count,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: str,
    req: TemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if req.name is not None: template.name = req.name
    if req.description is not None: template.description = req.description
    if req.category_id is not None: template.category_id = req.category_id
    if req.data is not None: template.data = req.data
    if req.thumbnail is not None: template.thumbnail = req.thumbnail
    if req.tags is not None: template.tags = req.tags
    template.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id, name=template.name, description=template.description,
        category_id=template.category_id, data=template.data, thumbnail=template.thumbnail,
        width=template.width, height=template.height, tags=template.tags,
        is_premium=template.is_premium, use_count=template.use_count,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(template)
    db.commit()
    return {"message": "Template deleted"}
