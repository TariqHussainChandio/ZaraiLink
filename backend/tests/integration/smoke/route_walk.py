"""Flat list of the app's real API routes for the authorization matrix and the audit-log guard.

FastAPI 0.141 no longer flattens `app.routes`: an included router is one lazy `_IncludedRouter`, so
iterating `app.routes` for `APIRoute` finds only the app's own handful (the matrix's "more than 100 routes"
guard failed on the upgrade instead of silently passing on 4). `iter_route_contexts` is FastAPI's public
way to get every route with its effective path and dependencies.
"""

from collections.abc import Iterator
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts


@dataclass(frozen=True)
class ApiRoute:
    path: str
    methods: frozenset[str]
    dependant: Dependant


def api_routes(app: FastAPI) -> Iterator[ApiRoute]:
    for context in iter_route_contexts(app.routes):
        route = context.original_route
        if isinstance(route, APIRoute):
            yield ApiRoute(
                path=context.path or route.path,
                methods=frozenset((context.methods or route.methods) - {"HEAD", "OPTIONS"}),
                dependant=context.dependant or route.dependant,
            )
