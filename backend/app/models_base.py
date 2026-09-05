from sqlalchemy import BigInteger, Integer
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

BigIntPK = BigInteger().with_variant(Integer, "sqlite")
