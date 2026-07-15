from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, field_validator
from typing import Optional, List
from database import get_db, BrandKit, BrandColor, BrandFont, BrandLogo, User
from auth import get_current_user
import random
import string

router = APIRouter(prefix="/api/brand-kits", tags=["brand-kits"])


def generate_id():
    return "bk_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


# ─── Brand Kit ──────────────────────────────
class BrandKitCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Brand kit name is required")
        if len(name) > 100:
            raise ValueError("Brand kit name must be 100 characters or less")
        return name

class BrandKitResponse(BaseModel):
    id: str
    name: str
    colors: list
    fonts: list
    logos: list
    created_at: str
    updated_at: str

class BrandKitListResponse(BaseModel):
    brand_kits: List[BrandKitResponse]


@router.get("", response_model=BrandKitListResponse)
def list_brand_kits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    kits = db.query(BrandKit).filter(BrandKit.user_id == current_user.id).all()
    return BrandKitListResponse(
        brand_kits=[_kit_to_response(k, db) for k in kits]
    )


@router.post("", response_model=BrandKitResponse, status_code=status.HTTP_201_CREATED)
def create_brand_kit(
    req: BrandKitCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    name = req.name.strip()
    duplicate = (
        db.query(BrandKit)
        .filter(
            BrandKit.user_id == current_user.id,
            func.lower(BrandKit.name) == name.lower(),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A brand kit with this name already exists")

    kit = BrandKit(id=generate_id(), name=name, user_id=current_user.id)
    try:
        db.add(kit)
        db.commit()
        db.refresh(kit)
        return _kit_to_response(kit, db)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create brand kit") from exc


@router.delete("/{kit_id}")
def delete_brand_kit(
    kit_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id, BrandKit.user_id == current_user.id).first()
    if not kit:
        raise HTTPException(status_code=404, detail="Brand kit not found")
    db.delete(kit)
    db.commit()
    return {"message": "Brand kit deleted"}


# ─── Brand Colors ───────────────────────────
class ColorCreate(BaseModel):
    name: str
    hex_value: str

class ColorResponse(BaseModel):
    id: str
    name: str
    hex_value: str
    sort_order: int


@router.post("/{kit_id}/colors", response_model=ColorResponse)
def add_color(
    kit_id: str,
    req: ColorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    kit = _get_user_kit(kit_id, current_user.id, db)
    color = BrandColor(
        id=generate_id(), brand_kit_id=kit_id,
        name=req.name, hex_value=req.hex_value,
        sort_order=db.query(BrandColor).filter(BrandColor.brand_kit_id == kit_id).count()
    )
    db.add(color)
    db.commit()
    db.refresh(color)
    return ColorResponse(id=color.id, name=color.name, hex_value=color.hex_value, sort_order=color.sort_order)


@router.delete("/{kit_id}/colors/{color_id}")
def delete_color(
    kit_id: str, color_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _get_user_kit(kit_id, current_user.id, db)
    color = db.query(BrandColor).filter(BrandColor.id == color_id, BrandColor.brand_kit_id == kit_id).first()
    if not color:
        raise HTTPException(status_code=404, detail="Color not found")
    db.delete(color)
    db.commit()
    return {"message": "Color deleted"}


# ─── Brand Fonts ────────────────────────────
class FontCreate(BaseModel):
    name: str
    family: str
    weight: Optional[str] = "normal"

class FontResponse(BaseModel):
    id: str
    name: str
    family: str
    weight: str
    sort_order: int


@router.post("/{kit_id}/fonts", response_model=FontResponse)
def add_font(
    kit_id: str,
    req: FontCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _get_user_kit(kit_id, current_user.id, db)
    font = BrandFont(
        id=generate_id(), brand_kit_id=kit_id,
        name=req.name, family=req.family, weight=req.weight,
        sort_order=db.query(BrandFont).filter(BrandFont.brand_kit_id == kit_id).count()
    )
    db.add(font)
    db.commit()
    db.refresh(font)
    return FontResponse(id=font.id, name=font.name, family=font.family, weight=font.weight, sort_order=font.sort_order)


@router.delete("/{kit_id}/fonts/{font_id}")
def delete_font(
    kit_id: str, font_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _get_user_kit(kit_id, current_user.id, db)
    font = db.query(BrandFont).filter(BrandFont.id == font_id, BrandFont.brand_kit_id == kit_id).first()
    if not font:
        raise HTTPException(status_code=404, detail="Font not found")
    db.delete(font)
    db.commit()
    return {"message": "Font deleted"}


# ─── Brand Logos ────────────────────────────
class LogoCreate(BaseModel):
    name: str
    file_data: str  # Base64
    file_type: Optional[str] = "image/png"

class LogoResponse(BaseModel):
    id: str
    name: str
    file_data: str
    file_type: str
    sort_order: int


@router.post("/{kit_id}/logos", response_model=LogoResponse)
def add_logo(
    kit_id: str,
    req: LogoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _get_user_kit(kit_id, current_user.id, db)
    logo = BrandLogo(
        id=generate_id(), brand_kit_id=kit_id,
        name=req.name, file_data=req.file_data, file_type=req.file_type,
        sort_order=db.query(BrandLogo).filter(BrandLogo.brand_kit_id == kit_id).count()
    )
    db.add(logo)
    db.commit()
    db.refresh(logo)
    return LogoResponse(id=logo.id, name=logo.name, file_data=logo.file_data, file_type=logo.file_type, sort_order=logo.sort_order)


@router.delete("/{kit_id}/logos/{logo_id}")
def delete_logo(
    kit_id: str, logo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _get_user_kit(kit_id, current_user.id, db)
    logo = db.query(BrandLogo).filter(BrandLogo.id == logo_id, BrandLogo.brand_kit_id == kit_id).first()
    if not logo:
        raise HTTPException(status_code=404, detail="Logo not found")
    db.delete(logo)
    db.commit()
    return {"message": "Logo deleted"}


# ─── Helpers ────────────────────────────────
def _get_user_kit(kit_id: str, user_id: str, db: Session) -> BrandKit:
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id, BrandKit.user_id == user_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail="Brand kit not found")
    return kit


def _kit_to_response(kit: BrandKit, db: Session) -> BrandKitResponse:
    colors = db.query(BrandColor).filter(BrandColor.brand_kit_id == kit.id).order_by(BrandColor.sort_order).all()
    fonts = db.query(BrandFont).filter(BrandFont.brand_kit_id == kit.id).order_by(BrandFont.sort_order).all()
    logos = db.query(BrandLogo).filter(BrandLogo.brand_kit_id == kit.id).order_by(BrandLogo.sort_order).all()
    return BrandKitResponse(
        id=kit.id, name=kit.name,
        colors=[{"id": c.id, "name": c.name, "hex_value": c.hex_value} for c in colors],
        fonts=[{"id": f.id, "name": f.name, "family": f.family, "weight": f.weight} for f in fonts],
        logos=[{"id": l.id, "name": l.name, "file_data": l.file_data, "file_type": l.file_type} for l in logos],
        created_at=kit.created_at.isoformat() if kit.created_at else "",
        updated_at=kit.updated_at.isoformat() if kit.updated_at else "",
    )
