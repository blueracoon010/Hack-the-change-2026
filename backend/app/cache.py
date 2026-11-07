"""Tiny in-memory TTL cache for async functions, so we don't hammer AESO / Calgary APIs."""

import functools
import time
from collections.abc import Awaitable, Callable
from typing import Any


def ttl_cache(seconds: float) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    def decorator(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        store: dict[Any, tuple[float, Any]] = {}

        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = (args, tuple(sorted(kwargs.items())))
            hit = store.get(key)
            if hit and time.monotonic() - hit[0] < seconds:
                return hit[1]
            value = await fn(*args, **kwargs)
            store[key] = (time.monotonic(), value)
            return value

        wrapper.cache_clear = store.clear  # type: ignore[attr-defined]
        return wrapper

    return decorator
