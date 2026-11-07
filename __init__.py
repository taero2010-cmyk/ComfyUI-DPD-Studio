"""DPD Studio nodes for ComfyUI: free tools, one section at a time.

Each section is a Python module under `sections/` that may define NODE_CLASS_MAPPINGS and NODE_DISPLAY_NAME_MAPPINGS,
plus browser code under `web/<section>/`. This file gathers them all, so one install brings every section. A section
that fails to load is reported and skipped; the others still load.
"""
import importlib
import logging
import pkgutil

from . import sections

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

for info in pkgutil.iter_modules(sections.__path__):
    try:
        module = importlib.import_module(f"{__name__}.sections.{info.name}")
    except Exception:
        logging.exception("DPD Studio: the %s section did not load", info.name)
        continue
    NODE_CLASS_MAPPINGS.update(getattr(module, "NODE_CLASS_MAPPINGS", {}))
    NODE_DISPLAY_NAME_MAPPINGS.update(getattr(module, "NODE_DISPLAY_NAME_MAPPINGS", {}))

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
