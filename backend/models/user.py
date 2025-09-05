from pydantic import BaseModel, EmailStr, validator, Field
from typing import Optional, Literal
import re

class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=15)
    gender: Optional[Literal["male", "female", "other"]] = None
    date_of_birth: Optional[str] = None  # Changed to string to match frontend
    id_type: Optional[Literal["nid", "passport", "birth_certificate", "driving_license"]] = None
    id_number: Optional[str] = Field(None, max_length=50)

    @validator('phone')
    @classmethod
    def validate_phone(cls, v):
        # Bangladesh phone number format validation
        pattern = r'^(\+88)?01[3-9]\d{8}$'
        if not re.match(pattern, v):
            raise ValueError('Invalid phone number format. Use: +8801XXXXXXXXX or 01XXXXXXXXX')
        return v

    @validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        # Allow letters, spaces, apostrophes ('), hyphens (-), and periods (.)
        if not re.match(r"^[a-zA-Z\s.'-]+$", v):
            raise ValueError("Name can only contain letters, spaces, apostrophes ('), hyphens (-), and periods (.)")
        return v.strip().title()

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)

    @validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone: str
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    id_type: Optional[str] = None
    id_number: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

    @validator('gender', pre=True)
    @classmethod
    def serialize_gender(cls, v):
        if hasattr(v, 'value'):
            return v.value
        return v

    @validator('id_type', pre=True)
    @classmethod
    def serialize_id_type(cls, v):
        if hasattr(v, 'value'):
            return v.value
        return v

    @validator('date_of_birth', pre=True)
    @classmethod
    def serialize_date_of_birth(cls, v):
        if v is None:
            return None
        if hasattr(v, 'date'):
            return v.date().isoformat()
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return str(v)

    @validator('created_at', pre=True)
    @classmethod
    def serialize_created_at(cls, v):
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return str(v)

    @validator('updated_at', pre=True)
    @classmethod
    def serialize_updated_at(cls, v):
        if v is None:
            return None
        if hasattr(v, 'isoformat'):
            return v.isoformat()
        return str(v)

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, min_length=10, max_length=15)
    gender: Optional[Literal["male", "female", "other"]] = None
    date_of_birth: Optional[str] = None
    id_type: Optional[Literal["nid", "passport", "birth_certificate", "driving_license"]] = None
    id_number: Optional[str] = Field(None, max_length=50)
    password: Optional[str] = Field(None, min_length=8, max_length=128)

    @validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if v is not None:
            pattern = r'^(\+88)?01[3-9]\d{8}$'
            if not re.match(pattern, v):
                raise ValueError('Invalid phone number format')
        return v

    @validator('name')
    @classmethod
    def validate_name(cls, v):
        if v is not None:
            if not v.strip():
                raise ValueError('Name cannot be empty')
            # Allow letters, spaces, apostrophes ('), hyphens (-), and periods (.)
            if not re.match(r"^[a-zA-Z\s.'-]+$", v):
                raise ValueError("Name can only contain letters, spaces, apostrophes ('), hyphens (-), and periods (.)")
            return v.strip().title()
        return v

    @validator('password')
    @classmethod
    def validate_password(cls, v):
        if v is not None:
            if len(v) < 8:
                raise ValueError('Password must be at least 8 characters long')
            if not re.search(r'[A-Za-z]', v):
                raise ValueError('Password must contain at least one letter')
            if not re.search(r'\d', v):
                raise ValueError('Password must contain at least one digit')
        return v

class AdminLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class TokenData(BaseModel):
    email: Optional[str] = None