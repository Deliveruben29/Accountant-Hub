from sqlalchemy import create_engine, Column, Integer, String, Float, Date, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime
import bcrypt

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="User") # 'Admin' or 'User'
    language_preference = Column(String, default="en") # 'en', 'es', 'de'
    
    files = relationship("UploadedFile", back_populates="uploader", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")

class UploadedFile(Base):
    __tablename__ = 'uploaded_files'
    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)
    file_size = Column(Integer)
    account_source = Column(String, nullable=False)
    uploaded_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    uploader = relationship("User", back_populates="files")
    transactions = relationship("Transaction", back_populates="source_file", cascade="all, delete-orphan")

class Transaction(Base):
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="CHF")
    type = Column(String, nullable=False) # 'Income' or 'Expense'
    merchant = Column(String, nullable=False)
    city = Column(String)
    category = Column(String, default="Uncategorized")
    account_source = Column(String, nullable=False) # 'PostFinance', 'CornerCard', 'Manual'
    long_reference_metadata = Column(Text) # Raw multi-line data
    
    file_id = Column(Integer, ForeignKey('uploaded_files.id'), nullable=True) # None if manual
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)

    user = relationship("User", back_populates="transactions")
    source_file = relationship("UploadedFile", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, date={self.date}, amount={self.amount}, merchant='{self.merchant}')>"

# Auth Helpers
def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_initial_admin(session):
    admin = session.query(User).filter_by(username="admin").first()
    if not admin:
        admin = User(
            username="admin", 
            password_hash=get_password_hash("admin123"), 
            role="Admin",
            language_preference="en"
        )
        session.add(admin)
        session.commit()

# Map German/French/Italian concepts to a unified English category system
CATEGORY_MAPPING = {
    # Food & Groceries
    "volg laden": "Groceries",
    "coop": "Groceries",
    "migros": "Groceries",
    "mercadona": "Groceries",
    # Dining out
    "rest.bar": "Restaurant/Bars",
    "restaurante": "Restaurant/Bars",
    "el templo": "Restaurant/Bars",
    # Telecommunications
    "salt mobile": "Telecommunications",
    "sunrise": "Telecommunications",
    "swisscom": "Telecommunications",
    # Transport
    "sbb": "Transport",
    "schweizerische bundesb": "Transport",
    "taxi": "Transport",
    "swiss air": "Transport",
    "flixbus": "Transport",
    "trainline": "Transport",
    # Software / Services
    "capcut": "Software/Services",
    "envato": "Software/Services",
    "viggle": "Software/Services",
    "google": "Software/Services",
    # Dating
    "tinder": "Dating",
    "parship": "Dating",
    # Night life
    "aalcaraz": "Night life",
    "anar i tornar": "Night life",
    # Cash
    "bargeldbezug": "Cash Withdrawal",
    # Income/Transfers
    "card reload": "Transfer"
}

def guess_category(merchant_name, raw_text=""):
    """Deduce standard category from merchant name or raw text"""
    combined = f"{merchant_name} {raw_text}".lower()
    for keyword, category in CATEGORY_MAPPING.items():
        if keyword in combined:
            return category
    return "Uncategorized"

import os

def get_engine(db_path=None):
    if db_path is None:
        db_path = os.environ.get("DATABASE_URL", "sqlite:///accountant.db")
    return create_engine(db_path, echo=False)

def init_db(engine):
    Base.metadata.create_all(engine)
    session = get_session(engine)
    create_initial_admin(session)
    session.close()

def get_session(engine):
    Session = sessionmaker(bind=engine)
    return Session()

if __name__ == "__main__":
    engine = get_engine()
    init_db(engine)
    print("Database schema successfully upgraded. Initial Admin seeded.")
