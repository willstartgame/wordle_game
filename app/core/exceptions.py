from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class Result:
    is_success: bool
    data: Optional[Any] = None
    error_message: Optional[str] = None

    @classmethod
    def success(cls, data: Any = None):
        return cls(is_success=True, data=data)

    @classmethod
    def failure(cls, error_message: str):
        return cls(is_success=False, error_message=error_message)