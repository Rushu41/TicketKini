
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from backend.config import settings
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode


def _sanitize_asyncpg_url(url: str):
    """Ensure URL is asyncpg, drop unsupported sslmode, and set ssl for managed hosts.
    Returns (sanitized_url, connect_args).
    """
    s = (url or "").strip()
    if s.startswith("postgres://"):
        s = "postgresql://" + s[len("postgres://"):]
    if s.startswith("postgresql://"):
        s = "postgresql+asyncpg://" + s[len("postgresql://"):]

    try:
        parsed = urlparse(s)
        qs = dict(parse_qsl(parsed.query))
        # remove sslmode if present (asyncpg doesn't support it)
        qs.pop("sslmode", None)
        host = (parsed.hostname or "").lower()
        # enable SSL for managed hosts like Render
        if host.endswith("render.com") or "render.com" in host:
            qs["ssl"] = "true"
        new_query = urlencode(qs)
        sanitized = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
    except Exception:
        sanitized = s

    connect_args = {}
    # If ssl=true in URL, also pass connect arg explicitly
    if "ssl=true" in sanitized:
        connect_args["ssl"] = True
    return sanitized, connect_args

# Create async engine (with URL sanitization for asyncpg on managed hosts)
_db_url, _connect_args = _sanitize_asyncpg_url(settings.DATABASE_URL)
engine = create_async_engine(
    _db_url,
    echo=bool(getattr(settings, "DEBUG", False)),
    future=True,
    connect_args=_connect_args,
)

# Create async session factory
SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Create base class for models
Base = declarative_base()

# Dependency to get database session
async def get_db():
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Create all tables
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Drop all tables (for development/testing)
async def drop_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)