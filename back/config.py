from pydantic_settings import BaseSettings


class Settings(BaseSettings):

    database_url: str = "x://x:x@x:x/x"

    app_title: str = "reprotest api"
    app_version: str = "1.0.0"
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
